import { createHash, randomUUID } from 'node:crypto'
import { appendFile, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { basename, extname, join, normalize, resolve, sep } from 'node:path'
import { z } from 'zod'
import { artifactKindSchema, artifactManifestSchema, artifactRenderModeSchema, type ArtifactManifest } from './schemas.js'

export const slugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/, 'Invalid slug.')

export class DataValidationError extends Error {
  public constructor(message: string, public readonly field: string) {
    super(message)
    this.name = 'DataValidationError'
  }
}

export interface WikiPage {
  slug: string
  title: string
  summary: string
  content: string
}

export interface SourceFile {
  slug: string
  title: string
  summary: string
  content: string
}

export interface SearchResult {
  slug: string
  title: string
  snippet: string
  score: number
}

export interface Backlink {
  slug: string
  title: string
}

export interface StoredArtifact {
  manifest: ArtifactManifest
  content: string
}

export interface FileWikiStore {
  dataDir: string
  wikiDir: string
  sourceDir: string
  artifactDir: string
  listPages(): Promise<WikiPage[]>
  listWikiPages(): Promise<WikiPage[]>
  readWikiPage(slug: string): Promise<WikiPage>
  writeWikiPage(slug: string, content: string): Promise<WikiPage & { bytesWritten: number }>
  listSources(): Promise<SourceFile[]>
  readSource(slug: string): Promise<SourceFile>
  writeSource(slug: string, content: string): Promise<SourceFile & { bytesWritten: number }>
  searchWiki(query: string, limit?: number): Promise<{ results: SearchResult[] }>
  listBacklinks(slug: string): Promise<{ target: string; pages: Backlink[] }>
  storeArtifact(input: {
    kind: ArtifactManifest['kind']
    title: string
    contentType: string
    content: string
    createdByRunId: string
    sourcePageIds?: string[]
    renderMode?: ArtifactManifest['renderMode']
    drawioEditorUrl?: string
    viewerConfig?: Record<string, unknown>
  }): Promise<StoredArtifact>
  readArtifact(artifactId: string): Promise<StoredArtifact>
  listArtifacts(): Promise<ArtifactManifest[]>
  appendLog(
    entry: string | { workflow: string; message: string; pages?: string[]; sources?: string[] },
    at?: Date
  ): Promise<{ slug: 'log'; appended: true; bytesWritten: number }>
}

export function defaultDataRoot(): string {
  return resolve(process.cwd(), 'examples/living-wiki-jaeger/data')
}

export function assertSlug(slug: string): string {
  const parsed = slugSchema.safeParse(slug)
  if (!parsed.success) {
    throw new DataValidationError('Invalid slug.', 'slug')
  }
  return parsed.data
}

export function createFileWikiStore(options: { dataDir?: string } = {}): FileWikiStore {
  const dataDir = resolve(options.dataDir ?? defaultDataRoot())
  const wikiDir = join(dataDir, 'wiki')
  const sourceDir = join(dataDir, 'raw', 'sources')
  const artifactDir = join(dataDir, 'artifacts')
  const artifactContentDir = join(artifactDir, 'content')
  const artifactManifestDir = join(artifactDir, 'manifest')

  async function ensureRoot(root: string): Promise<string> {
    await mkdir(root, { recursive: true })
    return realpath(root)
  }

  async function safeMarkdownPath(root: string, slug: string): Promise<string> {
    const parsed = assertSlug(slug)
    const realRoot = await ensureRoot(root)
    const target = normalize(join(realRoot, `${parsed}.md`))
    if (target !== realRoot && !target.startsWith(`${realRoot}${sep}`)) {
      throw new Error(`Resolved path escaped data directory for slug field.`)
    }
    return target
  }

  async function safePathBelow(root: string, relativePath: string, field: string): Promise<string> {
    const realRoot = await ensureRoot(root)
    const target = normalize(join(realRoot, relativePath))
    if (target !== realRoot && !target.startsWith(`${realRoot}${sep}`)) {
      throw new Error(`Resolved path escaped data directory for ${field} field.`)
    }
    return target
  }

  async function readMarkdown(root: string, slug: string): Promise<string> {
    const path = await safeMarkdownPath(root, slug)
    return readFile(path, 'utf8')
  }

  async function writeMarkdown(root: string, slug: string, content: string): Promise<WikiPage & { bytesWritten: number }> {
    const path = await safeMarkdownPath(root, slug)
    await mkdir(root, { recursive: true })
    await writeFile(path, content, 'utf8')
    return { slug, title: titleFromMarkdown(slug, content), summary: summaryFromMarkdown(content), content, bytesWritten: Buffer.byteLength(content, 'utf8') }
  }

  async function listMarkdownSlugs(root: string): Promise<string[]> {
    await mkdir(root, { recursive: true })
    const entries = await readdir(root, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => basename(entry.name, '.md'))
      .filter((slug) => slugSchema.safeParse(slug).success)
      .sort()
  }

  function assertArtifactId(artifactId: string): string {
    if (!/^artifact-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(artifactId)) {
      throw new DataValidationError('Invalid artifact id.', 'artifactId')
    }
    return artifactId
  }

  function extensionForKind(kind: ArtifactManifest['kind']): string {
    switch (kind) {
      case 'markdown': return '.md'
      case 'mermaid': return '.mmd'
      case 'svg': return '.svg'
      case 'drawio_xml': return '.drawio.xml'
      case 'json_panel': return '.json'
    }
  }

  function sanitizeArtifactContent(kind: ArtifactManifest['kind'], content: string): string {
    if (Buffer.byteLength(content, 'utf8') > 1_048_576) {
      throw new DataValidationError('Artifact content exceeds the 1 MB limit.', 'content')
    }
    if (kind !== 'svg') return content
    return content
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, '')
  }

  async function manifestPath(artifactId: string): Promise<string> {
    return safePathBelow(artifactManifestDir, `${assertArtifactId(artifactId)}.json`, 'artifactId')
  }

  async function contentPathFromManifest(manifest: ArtifactManifest): Promise<string> {
    const normalized = normalize(manifest.storagePath)
    if (normalized.startsWith('..') || normalized.includes(`${sep}..${sep}`) || normalize(normalized) !== normalized) {
      throw new DataValidationError('Invalid artifact storage path.', 'storagePath')
    }
    return safePathBelow(dataDir, normalized, 'storagePath')
  }

  function titleFromMarkdown(slug: string, content: string): string {
    const heading = content.split(/\r?\n/).find((line) => line.startsWith('# '))
    return heading?.replace(/^#\s+/, '').trim() || slug.replaceAll('-', ' ')
  }

  function summaryFromMarkdown(content: string): string {
    const paragraph = content
      .split(/\r?\n\r?\n/)
      .map((part) => part.replace(/^#+\s+/gm, '').trim())
      .find((part) => part.length > 0)
    return (paragraph ?? '').slice(0, 180)
  }

  async function pageFromSlug(slug: string): Promise<WikiPage> {
    const content = await readMarkdown(wikiDir, slug)
    return { slug, title: titleFromMarkdown(slug, content), summary: summaryFromMarkdown(content), content }
  }

  async function sourceFromSlug(slug: string): Promise<SourceFile> {
    const content = await readMarkdown(sourceDir, slug)
    return { slug, title: titleFromMarkdown(slug, content), summary: summaryFromMarkdown(content), content }
  }

  return {
    dataDir,
    wikiDir,
    sourceDir,
    artifactDir,
    async listPages() {
      return Promise.all((await listMarkdownSlugs(wikiDir)).map(pageFromSlug))
    },
    async listWikiPages() {
      return this.listPages()
    },
    readWikiPage: pageFromSlug,
    async writeWikiPage(slug, content) {
      return writeMarkdown(wikiDir, assertSlug(slug), content)
    },
    async listSources() {
      return Promise.all((await listMarkdownSlugs(sourceDir)).map(sourceFromSlug))
    },
    readSource: sourceFromSlug,
    async writeSource(slug, content) {
      return writeMarkdown(sourceDir, assertSlug(slug), content)
    },
    async searchWiki(query, limit = 8) {
      const terms = query.toLowerCase().split(/\W+/).filter(Boolean)
      const pages = await this.listPages()
      const results = pages
        .map((page) => {
          const haystack = `${page.title}\n${page.content}`.toLowerCase()
          const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0)
          const firstTerm = terms.find((term) => haystack.includes(term))
          const index = firstTerm ? Math.max(0, haystack.indexOf(firstTerm) - 60) : 0
          return {
            slug: page.slug,
            title: page.title,
            snippet: page.content.replace(/\s+/g, ' ').slice(index, index + 180),
            score
          }
        })
        .filter((result) => result.score > 0 || terms.length === 0)
        .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))
        .slice(0, limit)
      return { results }
    },
    async listBacklinks(slug) {
      const parsed = assertSlug(slug)
      const pages = await this.listPages()
      return {
        target: parsed,
        pages: pages
        .filter((page) => page.slug !== parsed && page.content.includes(`[[${parsed}]]`))
        .map((page) => ({ slug: page.slug, title: page.title }))
        .sort((a, b) => a.slug.localeCompare(b.slug))
      }
    },
    async storeArtifact(input) {
      const kind = artifactKindSchema.parse(input.kind)
      const renderMode = artifactRenderModeSchema.parse(input.renderMode ?? 'inline')
      for (const sourcePageId of input.sourcePageIds ?? []) assertSlug(sourcePageId)
      const content = sanitizeArtifactContent(kind, input.content)
      const artifactId = `artifact-${randomUUID()}`
      const storagePath = normalize(join('artifacts', 'content', `${artifactId}${extensionForKind(kind)}`))
      if (storagePath.startsWith('..')) throw new DataValidationError('Invalid artifact storage path.', 'storagePath')
      const createdAt = new Date().toISOString()
      const digest = createHash('sha256').update(content).digest('hex')
      const manifest = artifactManifestSchema.parse({
        artifactId,
        kind,
        title: input.title,
        contentType: input.contentType,
        storagePath,
        createdByRunId: input.createdByRunId,
        sourcePageIds: input.sourcePageIds ?? [],
        digest,
        createdAt,
        renderMode,
        ...(input.drawioEditorUrl ? { drawioEditorUrl: input.drawioEditorUrl } : {}),
        ...(input.viewerConfig ? { viewerConfig: input.viewerConfig } : {})
      })
      const contentPath = await contentPathFromManifest(manifest)
      await mkdir(artifactContentDir, { recursive: true })
      await mkdir(artifactManifestDir, { recursive: true })
      await writeFile(contentPath, content, 'utf8')
      await writeFile(await manifestPath(artifactId), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
      return { manifest, content }
    },
    async readArtifact(artifactId) {
      const path = await manifestPath(artifactId)
      const manifest = artifactManifestSchema.parse(JSON.parse(await readFile(path, 'utf8')))
      const contentPath = await contentPathFromManifest(manifest)
      return { manifest, content: await readFile(contentPath, 'utf8') }
    },
    async listArtifacts() {
      await mkdir(artifactManifestDir, { recursive: true })
      const entries = await readdir(artifactManifestDir, { withFileTypes: true })
      const manifests = await Promise.all(entries
        .filter((entry) => entry.isFile() && extname(entry.name) === '.json')
        .map(async (entry) => artifactManifestSchema.parse(JSON.parse(await readFile(join(artifactManifestDir, entry.name), 'utf8')))))
      return manifests.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    },
    async appendLog(entry, at) {
      const normalized = typeof entry === 'string'
        ? { workflow: 'manual', message: entry }
        : entry
      for (const page of normalized.pages ?? []) assertSlug(page)
      for (const source of normalized.sources ?? []) assertSlug(source)
      const stamp = (at ?? new Date()).toISOString()
      const line = [
        `\n- ${stamp} [${normalized.workflow}] ${normalized.message}`,
        normalized.pages?.length ? ` pages=${normalized.pages.join(',')}` : '',
        normalized.sources?.length ? ` sources=${normalized.sources.join(',')}` : ''
      ].join('')
      const path = await safeMarkdownPath(wikiDir, 'log')
      await appendFile(path, `${line}\n`, 'utf8')
      return { slug: 'log', appended: true, bytesWritten: Buffer.byteLength(`${line}\n`, 'utf8') }
    }
  }
}

export function createLivingWikiStore(options: { dataRoot?: string; dataDir?: string } = {}): FileWikiStore {
  const dataDir = options.dataRoot ?? options.dataDir
  return dataDir === undefined ? createFileWikiStore() : createFileWikiStore({ dataDir })
}
