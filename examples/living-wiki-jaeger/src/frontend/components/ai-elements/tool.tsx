import { CheckCircle2, ChevronDown, LoaderCircle, XCircle } from 'lucide-react'
import type { DetailsHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

export type ToolState = 'input-streaming' | 'input-available' | 'output-available' | 'output-error'

export function Tool(props: DetailsHTMLAttributes<HTMLDetailsElement>) {
  return <details {...props} className={`ai-tool ${props.className ?? ''}`} />
}

export function ToolHeader(props: HTMLAttributes<HTMLElement> & { type: string; state: ToolState; toolName?: string }) {
  const { type, state, toolName, className, ...summaryProps } = props
  const Icon = state === 'output-error' ? XCircle : state === 'output-available' ? CheckCircle2 : LoaderCircle
  const label = state === 'output-error' ? 'Error' : state === 'output-available' ? 'Completed' : 'Running'
  return (
    <summary {...summaryProps} className={`ai-tool-header ${className ?? ''}`}>
      <Icon className={state === 'input-available' || state === 'input-streaming' ? 'spin' : ''} size={14} />
      <span>{toolName ?? type.replace(/^tool-/, '')}</span>
      <em>{label}</em>
      <ChevronDown size={14} />
    </summary>
  )
}

export function ToolContent(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ai-tool-content ${props.className ?? ''}`} />
}

export function ToolInput(props: HTMLAttributes<HTMLPreElement> & { input?: unknown }) {
  return <pre {...props} className={`ai-tool-json ${props.className ?? ''}`}>{JSON.stringify(props.input ?? {}, null, 2)}</pre>
}

export function ToolOutput(props: HTMLAttributes<HTMLDivElement> & { output?: ReactNode; errorText?: string }) {
  return <div {...props} className={`ai-tool-output ${props.className ?? ''}`}>{props.errorText ? <p>{props.errorText}</p> : props.output}</div>
}
