import { ArrowUp, LoaderCircle, Plus } from 'lucide-react'
import { createContext, type FormEvent, type HTMLAttributes, type ReactNode, type TextareaHTMLAttributes, useContext, useRef } from 'react'

export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error'
export type PromptInputMessage = { text: string; files?: File[] }

const FileInputContext = createContext<{ open: () => void; files: File[] }>({ open: () => undefined, files: [] })

export function PromptInput(props: Omit<HTMLAttributes<HTMLFormElement>, 'onSubmit'> & {
  onSubmit?: (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => void
  multiple?: boolean
  accept?: string
  files?: File[]
  onFilesChange?: (files: File[]) => void
}) {
  const { onSubmit, multiple, accept, files, onFilesChange, children, className, ...formProps } = props
  const fileRef = useRef<HTMLInputElement>(null)
  const open = () => fileRef.current?.click()
  return (
    <FileInputContext.Provider value={{ open, files: files ?? [] }}>
      <form
        {...formProps}
        className={`ai-prompt-input ${className ?? ''}`}
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          onSubmit?.({ text: String(form.get('message') ?? ''), ...(files ? { files } : {}) }, event)
        }}
      >
        <input
          ref={fileRef}
          type="file"
          hidden
          multiple={multiple}
          accept={accept}
          onChange={(event) => onFilesChange?.(Array.from(event.currentTarget.files ?? []))}
        />
        {children}
      </form>
    </FileInputContext.Provider>
  )
}

export function PromptInputBody(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ai-prompt-body ${props.className ?? ''}`} />
}

export function PromptInputFooter(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ai-prompt-footer ${props.className ?? ''}`} />
}

export function PromptInputTools(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={`ai-prompt-tools ${props.className ?? ''}`} />
}

export function PromptInputTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      name={props.name ?? 'message'}
      className={`ai-prompt-textarea ${props.className ?? ''}`}
      rows={props.rows ?? 1}
      onInput={(event) => {
        event.currentTarget.style.height = 'auto'
        event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 180)}px`
        props.onInput?.(event)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault()
          event.currentTarget.form?.requestSubmit()
        }
        props.onKeyDown?.(event)
      }}
    />
  )
}

export function PromptInputButton(props: HTMLAttributes<HTMLButtonElement> & { tooltip?: string | { content: ReactNode } }) {
  return (
    <button {...props} className={`ai-prompt-button ${props.className ?? ''}`} title={typeof props.tooltip === 'string' ? props.tooltip : undefined} type="button" />
  )
}

export function PromptInputActionAddAttachments(props: HTMLAttributes<HTMLButtonElement> & { label?: string }) {
  const files = useContext(FileInputContext)
  return (
    <PromptInputButton {...props} tooltip="Attach markdown source" onClick={(event) => { files.open(); props.onClick?.(event) }}>
      <Plus size={14} />
      <span>{props.label ?? 'Attach'}</span>
    </PromptInputButton>
  )
}

export function PromptInputSubmit(props: HTMLAttributes<HTMLButtonElement> & { status?: ChatStatus; disabled?: boolean }) {
  const busy = props.status === 'submitted' || props.status === 'streaming'
  return (
    <button {...props} className={`ai-prompt-submit ${props.className ?? ''}`} type="submit" disabled={props.disabled || busy} aria-label="Send message">
      {busy ? <LoaderCircle className="spin" size={15} /> : <ArrowUp size={15} />}
    </button>
  )
}
