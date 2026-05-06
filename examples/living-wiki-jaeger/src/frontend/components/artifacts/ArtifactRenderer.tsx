import { Download, ExternalLink, FileCode, Image as ImageIcon } from 'lucide-react'
import { Suspense, lazy, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import JsonRenderer from 'json-renderer'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

const MermaidDiagram = lazy(() => import('../../MermaidDiagram.js'))

export type ArtifactKind = 'markdown' | 'mermaid' | 'svg' | 'drawio' | 'drawio_xml' | 'json_panel'

export type ResearchArtifact = {
  id?: string
  artifactId?: string
  kind: ArtifactKind
  title: string
  mimeType?: string
  contentType?: string
  contentRef?: string
  storagePath?: string
  url?: string
  contentUrl?: string
  previewUrl?: string
  downloadUrl?: string
  drawioEditorUrl?: string
  viewerConfig?: Record<string, unknown>
  content?: string
  panelSpec?: unknown
  data?: unknown
  renderMode?: 'inline' | 'document' | 'download'
}

export function ArtifactList(props: { artifacts: ResearchArtifact[]; compact?: boolean }) {
  if (props.artifacts.length === 0) return null
  return (
    <div className={props.compact ? 'artifact-list artifact-list-compact' : 'artifact-list'}>
      {props.artifacts.map((artifact, index) => (
        <ArtifactRenderer key={artifact.id ?? artifact.artifactId ?? `${artifact.kind}-${index}`} artifact={artifact} />
      ))}
    </div>
  )
}

export function ArtifactRenderer({ artifact }: { artifact: ResearchArtifact }) {
  return (
    <section className="artifact-card">
      <header>
        <div>
          <strong>{artifact.title}</strong>
          <span>{artifact.kind.replace('_', ' ')}</span>
        </div>
        <ArtifactActions artifact={artifact} />
      </header>
      <ArtifactBody artifact={artifact} />
    </section>
  )
}

function ArtifactBody({ artifact }: { artifact: ResearchArtifact }) {
  switch (artifact.kind) {
    case 'markdown':
      return artifact.content ? <MarkdownArtifact markdown={artifact.content} /> : <ArtifactReference artifact={artifact} />
    case 'mermaid':
      return artifact.content
        ? <Suspense fallback={<pre>Rendering diagram...</pre>}><MermaidDiagram code={artifact.content} /></Suspense>
        : <ArtifactReference artifact={artifact} />
    case 'svg':
      return artifact.content ? <SafeSvg content={artifact.content} /> : <ArtifactReference artifact={artifact} />
    case 'drawio':
    case 'drawio_xml':
      return <DrawIoArtifact artifact={artifact} />
    case 'json_panel':
      return artifact.panelSpec || artifact.data
        ? <JsonRenderer siteJson={panelSiteJson(artifact.panelSpec ?? artifact.data)} data={{}} />
        : <ArtifactReference artifact={artifact} />
    default:
      return <ArtifactReference artifact={artifact} />
  }
}

function MarkdownArtifact({ markdown }: { markdown: string }) {
  const components: Components = {
    code: ({ className, children, ...codeProps }) => {
      const code = String(children ?? '')
      if (className?.includes('language-mermaid')) {
        return <Suspense fallback={<pre>Rendering diagram...</pre>}><MermaidDiagram code={code} /></Suspense>
      }
      return <code className={className} {...codeProps}>{children}</code>
    }
  }
  return <div className="artifact-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{markdown}</ReactMarkdown></div>
}

function SafeSvg({ content }: { content: string }) {
  if (!looksLikeSvg(content)) return <pre>SVG artifact could not be rendered safely.</pre>
  return <div className="artifact-svg" dangerouslySetInnerHTML={{ __html: stripUnsafeSvg(content) }} />
}

function DrawIoArtifact({ artifact }: { artifact: ResearchArtifact }) {
  const tabs = useMemo(() => drawIoTabs(artifact), [artifact])
  const [active, setActive] = useState(tabs[0]?.id ?? 'reference')
  const activeTab = tabs.find((tab) => tab.id === active) ?? tabs[0]
  return (
    <div className="drawio-artifact">
      <div className="artifact-tabs" role="tablist" aria-label={`${artifact.title} views`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab?.id === tab.id}
            onClick={() => setActive(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
      <div className="artifact-tab-panel" role="tabpanel">
        {activeTab?.body ?? <ArtifactReference artifact={artifact} />}
      </div>
    </div>
  )
}

function ArtifactReference({ artifact }: { artifact: ResearchArtifact }) {
  const ref = artifact.contentRef ?? artifact.storagePath ?? firstUrl(artifact)
  return <pre>{ref ? `Stored artifact: ${ref}` : 'Artifact content is not available yet.'}</pre>
}

function ArtifactActions({ artifact }: { artifact: ResearchArtifact }) {
  const openUrl = firstUrl(artifact)
  const downloadUrl = artifact.downloadUrl ?? artifact.contentUrl ?? artifact.url ?? (artifact.content ? contentDownloadUrl(artifact.content) : undefined)
  if (!openUrl && !downloadUrl) return null
  return (
    <div className="artifact-actions">
      {openUrl ? (
        <a href={openUrl} target="_blank" rel="noreferrer" aria-label={`Open ${artifact.title}`}>
          <ExternalLink size={14} />
          Open
        </a>
      ) : null}
      {downloadUrl ? (
        <a href={downloadUrl} download={artifactFileName(artifact)} aria-label={`Download ${artifact.title}`}>
          <Download size={14} />
          Download
        </a>
      ) : null}
    </div>
  )
}

function looksLikeSvg(content: string) {
  return /^\s*<svg[\s>]/i.test(content) && !/<script[\s>]/i.test(content) && !/\son\w+=/i.test(content)
}

function stripUnsafeSvg(content: string) {
  return content
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+=(?:"[^"]*"|'[^']*')/gi, '')
}

function extractSvgFromDrawIo(content: string | undefined) {
  if (!content) return undefined
  const match = content.match(/<svg[\s\S]*<\/svg>/i)
  return match?.[0]
}

function drawIoTabs(artifact: ResearchArtifact) {
  const svg = extractSvgFromDrawIo(artifact.content)
  const previewUrl = artifact.previewUrl ?? artifact.url
  const tabs: Array<{ id: string; label: string; icon: ReactNode; body: ReactNode }> = []
  if (svg) {
    tabs.push({ id: 'preview', label: 'Preview', icon: <ImageIcon size={14} />, body: <SafeSvg content={svg} /> })
  } else if (artifact.content) {
    tabs.push({ id: 'preview', label: 'Preview', icon: <ImageIcon size={14} />, body: <DrawIoSketch xml={artifact.content} /> })
  } else if (previewUrl) {
    tabs.push({
      id: 'preview',
      label: 'Preview',
      icon: <ImageIcon size={14} />,
      body: <iframe className="artifact-frame" title={`${artifact.title} preview`} src={previewUrl} />
    })
  }
  if (artifact.content) tabs.push({ id: 'xml', label: 'XML', icon: <FileCode size={14} />, body: <pre>{artifact.content}</pre> })
  tabs.push({ id: 'reference', label: 'Reference', icon: <ExternalLink size={14} />, body: <ArtifactReference artifact={artifact} /> })
  return tabs
}

function firstUrl(artifact: ResearchArtifact) {
  return artifact.drawioEditorUrl ?? artifact.url ?? artifact.previewUrl ?? artifact.contentUrl ?? artifact.downloadUrl
}

function DrawIoSketch({ xml }: { xml: string }) {
  const cells = useMemo(() => parseDrawIoVertices(xml), [xml])
  if (cells.length === 0) return <ArtifactReference artifact={{ kind: 'drawio_xml', title: 'draw.io XML', content: xml }} />
  const width = Math.max(520, ...cells.map((cell) => cell.x + cell.width + 32))
  const height = Math.max(260, ...cells.map((cell) => cell.y + cell.height + 32))
  return (
    <div className="drawio-sketch" style={{ '--drawio-width': `${width}px`, '--drawio-height': `${height}px` } as CSSProperties}>
      {cells.map((cell, index) => (
        <div
          key={cell.id}
          className={index === cells.length - 1 ? 'drawio-node drawio-node-primary' : 'drawio-node'}
          style={{ left: cell.x, top: cell.y, width: cell.width, height: cell.height }}
        >
          {cell.label}
        </div>
      ))}
    </div>
  )
}

function parseDrawIoVertices(xml: string) {
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    return [...doc.querySelectorAll('mxCell[vertex="1"]')].map((cell) => {
      const geometry = cell.querySelector('mxGeometry')
      return {
        id: cell.getAttribute('id') ?? crypto.randomUUID(),
        label: cell.getAttribute('value') ?? 'Node',
        x: Number(geometry?.getAttribute('x') ?? 0),
        y: Number(geometry?.getAttribute('y') ?? 0),
        width: Number(geometry?.getAttribute('width') ?? 140),
        height: Number(geometry?.getAttribute('height') ?? 56)
      }
    })
  } catch {
    return []
  }
}

function contentDownloadUrl(content: string) {
  return `data:application/xml;charset=utf-8,${encodeURIComponent(content)}`
}

function artifactFileName(artifact: ResearchArtifact) {
  const safeTitle = artifact.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'artifact'
  if (artifact.kind === 'drawio' || artifact.kind === 'drawio_xml') return `${safeTitle}.drawio`
  if (artifact.kind === 'markdown') return `${safeTitle}.md`
  if (artifact.kind === 'svg') return `${safeTitle}.svg`
  return `${safeTitle}.txt`
}

function panelSiteJson(panel: unknown) {
  const record = panel && typeof panel === 'object' ? panel as { title?: unknown; sections?: unknown } : {}
  const sections = Array.isArray(record.sections) ? record.sections as Array<{ heading?: string; items?: string[] }> : []
  return {
    version: '1.0' as const,
    meta: { title: String(record.title ?? 'Structured Output'), description: '', favicon: null, fonts: [] },
    globalStyles: {
      bodyBackground: 'transparent',
      bodyColor: '#1f2937',
      bodyFontFamily: 'Inter, system-ui, sans-serif',
      bodyFontSize: '13px',
      bodyLineHeight: '1.5',
      linkColor: '#2563eb',
      linkHoverColor: '#1d4ed8'
    },
    pages: [{
      id: 'panel',
      name: 'Panel',
      slug: '/',
      isHome: true,
      root: {
        id: 'root',
        tag: 'section',
        style: { display: 'grid', gap: '10px' },
        children: [
          { id: 'title', tag: 'h3', style: { margin: '0', fontSize: '14px' }, textContent: String(record.title ?? 'Structured Output') },
          ...sections.map((section, index) => ({
            id: `section-${index}`,
            tag: 'div',
            style: { display: 'grid', gap: '4px' },
            children: [
              { id: `heading-${index}`, tag: 'strong', style: { fontSize: '12px' }, textContent: section.heading ?? 'Section' },
              ...(section.items ?? []).map((item, itemIndex) => ({
                id: `item-${index}-${itemIndex}`,
                tag: 'p',
                style: { margin: '0', fontSize: '12px' },
                textContent: item
              }))
            ]
          }))
        ]
      }
    }]
  }
}
