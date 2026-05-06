import { ArrowDown } from 'lucide-react'
import { type HTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react'

export function Conversation(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ai-conversation ${props.className ?? ''}`} />
}

export function ConversationContent(props: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)
  const [atBottom, setAtBottom] = useState(true)

  useEffect(() => {
    if (!atBottom || !ref.current) return
    if (typeof ref.current.scrollTo === 'function') {
      ref.current.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' })
    } else {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  })

  return (
    <div
      {...props}
      ref={ref}
      className={`ai-conversation-content ${props.className ?? ''}`}
      onScroll={(event) => {
        const element = event.currentTarget
        setAtBottom(element.scrollHeight - element.scrollTop - element.clientHeight < 36)
        props.onScroll?.(event)
      }}
    />
  )
}

export function ConversationEmptyState(props: HTMLAttributes<HTMLDivElement> & { icon?: ReactNode; title?: string; description?: string }) {
  return (
    <div {...props} className={`ai-conversation-empty ${props.className ?? ''}`}>
      {props.icon}
      {props.title && <strong>{props.title}</strong>}
      {props.description && <span>{props.description}</span>}
      {props.children}
    </div>
  )
}

export function ConversationScrollButton(props: HTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={`ai-conversation-scroll ${props.className ?? ''}`} type="button" aria-label="Scroll to latest message">
      <ArrowDown size={14} />
    </button>
  )
}
