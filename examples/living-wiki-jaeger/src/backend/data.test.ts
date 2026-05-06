import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

async function loadDataModule() {
  return import(new URL('./data.js', import.meta.url).href) as Promise<{
    createLivingWikiStore: (options: { dataRoot: string }) => {
      readSource: (slug: string) => Promise<{ slug: string; content: string }>
      readWikiPage: (slug: string) => Promise<{ slug: string; content: string }>
      writeWikiPage: (slug: string, content: string) => Promise<{ slug: string; content: string }>
      storeArtifact: (input: {
        kind: 'markdown' | 'mermaid' | 'svg' | 'drawio_xml' | 'json_panel'
        title: string
        contentType: string
        content: string
        createdByRunId: string
        sourcePageIds?: string[]
        renderMode?: 'inline' | 'document' | 'download'
        drawioEditorUrl?: string
        viewerConfig?: Record<string, unknown>
      }) => Promise<{ manifest: { artifactId: string; storagePath: string; digest: string }; content: string }>
      readArtifact: (artifactId: string) => Promise<{ manifest: { artifactId: string; storagePath: string; drawioEditorUrl?: string; viewerConfig?: Record<string, unknown> }; content: string }>
      searchWiki: (query: string) => Promise<{ results: Array<{ slug: string; snippet: string }> }>
      listBacklinks: (slug: string) => Promise<{ target: string; pages: Array<{ slug: string }> }>
      appendLog: (entry: string, at?: Date) => Promise<{ slug: 'log'; appended: true }>
    }
  }>
}

async function loadSchemasModule() {
  return import(new URL('./schemas.js', import.meta.url).href) as Promise<{
    slugSchema: { safeParse: (value: unknown) => { success: boolean } }
  }>
}

async function createTempDataRoot(): Promise<string> {
  const root = join(tmpdir(), `living-wiki-data-${randomUUID()}`)
  await mkdir(join(root, 'wiki'), { recursive: true })
  await mkdir(join(root, 'raw', 'sources'), { recursive: true })
  await writeFile(join(root, 'wiki', 'index.md'), '# Index\n\nSee [[target-page]].\n', 'utf8')
  await writeFile(join(root, 'wiki', 'target-page.md'), '# Target Page\n\nGrounded target claim.\n', 'utf8')
  await writeFile(join(root, 'wiki', 'linked-page.md'), '# Linked Page\n\nLinks to [[target-page]].\n', 'utf8')
  await writeFile(join(root, 'wiki', 'log.md'), '# Operational Log\n', 'utf8')
  await writeFile(join(root, 'raw', 'sources', 'source-one.md'), '# Source One\n\nSource claim about target page.\n', 'utf8')
  return root
}

describe('file-backed wiki data safety', () => {
  it('validates slugs before file access and rejects traversal-shaped values', async () => {
    const { createLivingWikiStore } = await loadDataModule()
    const { slugSchema } = await loadSchemasModule()
    const store = createLivingWikiStore({ dataRoot: await createTempDataRoot() })

    expect(slugSchema.safeParse('target-page').success).toBe(true)

    for (const slug of ['', '../target-page', 'target-page.md', 'Target-Page', 'target/page', '%2e%2e-target']) {
      expect(slugSchema.safeParse(slug).success).toBe(false)
      await expect(store.readWikiPage(slug)).rejects.toThrow(/slug/i)
      await expect(store.writeWikiPage(slug, '# Bad\n')).rejects.toThrow(/slug/i)
    }
  })

  it('reads and writes only inside the configured data directories', async () => {
    const { createLivingWikiStore } = await loadDataModule()
    const dataDir = await createTempDataRoot()
    const store = createLivingWikiStore({ dataRoot: dataDir })

    await expect(store.readSource('source-one')).resolves.toMatchObject({
      slug: 'source-one',
      content: expect.stringContaining('Source claim')
    })

    const writeResult = await store.writeWikiPage('new-page', '# New Page\n\nLinks to [[target-page]].\n')
    expect(writeResult).toMatchObject({ slug: 'new-page', content: expect.stringContaining('# New Page') })
    await expect(store.readWikiPage('new-page')).resolves.toMatchObject({
      slug: 'new-page',
      content: expect.stringContaining('[[target-page]]')
    })

    await expect(readFile(join(dataDir, 'wiki', 'new-page.md'), 'utf8')).resolves.toContain('# New Page')
  })

  it('searches wiki content and lists exact wiki-link backlinks', async () => {
    const { createLivingWikiStore } = await loadDataModule()
    const store = createLivingWikiStore({ dataRoot: await createTempDataRoot() })

    await expect(store.searchWiki('target claim')).resolves.toMatchObject({
      results: expect.arrayContaining([
        expect.objectContaining({ slug: 'target-page', snippet: expect.stringMatching(/target/i) })
      ])
    })

    await expect(store.listBacklinks('target-page')).resolves.toMatchObject({
      target: 'target-page',
      pages: expect.arrayContaining([
        expect.objectContaining({ slug: 'index' }),
        expect.objectContaining({ slug: 'linked-page' })
      ])
    })
  })

  it('appends timestamped operational log entries without replacing existing log content', async () => {
    const { createLivingWikiStore } = await loadDataModule()
    const dataDir = await createTempDataRoot()
    const store = createLivingWikiStore({ dataRoot: dataDir })

    await store.appendLog('ingest_source updated target-page from source-one', new Date('2026-05-05T12:00:00.000Z'))

    const log = await readFile(join(dataDir, 'wiki', 'log.md'), 'utf8')
    expect(log).toContain('# Operational Log')
    expect(log).toContain('ingest_source')
    expect(log).toContain('target-page')
    expect(log).toContain('source-one')
    expect(log).toContain('2026-05-05T12:00:00.000Z')
  })

  it('stores artifacts below the data directory and rejects traversal-shaped artifact ids', async () => {
    const { createLivingWikiStore } = await loadDataModule()
    const dataDir = await createTempDataRoot()
    const store = createLivingWikiStore({ dataRoot: dataDir })

    const stored = await store.storeArtifact({
      kind: 'mermaid',
      title: 'Trace Map',
      contentType: 'text/vnd.mermaid',
      content: 'graph LR\n  A --> B\n',
      createdByRunId: 'run-artifact-1',
      sourcePageIds: ['target-page'],
      renderMode: 'inline'
    })

    expect(stored.manifest.artifactId).toMatch(/^artifact-/)
    expect(stored.manifest.storagePath).toContain('artifacts/content/')
    expect(stored.manifest.storagePath).not.toContain('..')
    expect(stored.manifest.digest).toMatch(/^[a-f0-9]{64}$/)
    await expect(store.readArtifact(stored.manifest.artifactId)).resolves.toMatchObject({
      manifest: { artifactId: stored.manifest.artifactId },
      content: 'graph LR\n  A --> B\n'
    })

    await expect(store.readArtifact('../secret')).rejects.toThrow(/artifact/i)
    await expect(store.readArtifact(`${stored.manifest.artifactId}/../secret`)).rejects.toThrow(/artifact/i)
  })

  it('persists optional draw.io artifact viewer metadata with the manifest', async () => {
    const { createLivingWikiStore } = await loadDataModule()
    const store = createLivingWikiStore({ dataRoot: await createTempDataRoot() })

    const stored = await store.storeArtifact({
      kind: 'drawio_xml',
      title: 'Architecture Board',
      contentType: 'application/vnd.jgraph.mxfile',
      content: '<mxfile><diagram name="Architecture"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>',
      createdByRunId: 'run-drawio-1',
      sourcePageIds: ['target-page'],
      renderMode: 'document',
      drawioEditorUrl: 'https://app.diagrams.net/',
      viewerConfig: { page: 'Architecture', mode: 'viewer' }
    })

    await expect(store.readArtifact(stored.manifest.artifactId)).resolves.toMatchObject({
      manifest: {
        artifactId: stored.manifest.artifactId,
        drawioEditorUrl: 'https://app.diagrams.net/',
        viewerConfig: { page: 'Architecture', mode: 'viewer' }
      },
      content: expect.stringContaining('<mxGraphModel')
    })
  })
})
