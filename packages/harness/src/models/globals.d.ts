interface AbortSignal {
  readonly aborted: boolean
  readonly reason?: unknown
  throwIfAborted(): void
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void
  removeEventListener(type: 'abort', listener: () => void): void
}

declare const AbortSignal: {
  abort(reason?: unknown): AbortSignal
}

declare const crypto: {
  getRandomValues<T extends ArrayBufferView>(array: T): T
}

declare const process: {
  stdout: { write(chunk: string): unknown }
  env: Record<string, string | undefined>
}
