import { renderMermaidSVG } from 'beautiful-mermaid'

export default function MermaidDiagram(props: { code: string }) {
  try {
    const svg = renderMermaidSVG(props.code, {
      bg: '#111315',
      fg: '#f4f7fa',
      line: '#5c6773',
      accent: '#22c55e',
      muted: '#a5adb8',
      surface: '#171a1d',
      border: '#3a424b',
      transparent: true,
      padding: 28
    })
    return <div className="mermaid-diagram" dangerouslySetInnerHTML={{ __html: svg }} />
  } catch (error) {
    return <pre>{error instanceof Error ? error.message : String(error)}</pre>
  }
}
