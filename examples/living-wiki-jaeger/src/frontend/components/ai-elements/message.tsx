import type { HTMLAttributes } from 'react'

export function Message(props: HTMLAttributes<HTMLDivElement> & { from?: 'user' | 'assistant' | 'system' | 'tool' }) {
  const from = props.from ?? 'assistant'
  return <div {...props} className={`ai-message ai-message-${from} ${props.className ?? ''}`} />
}

export function MessageContent(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ai-message-content ${props.className ?? ''}`} />
}

export function MessageResponse(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ai-message-response ${props.className ?? ''}`} />
}
