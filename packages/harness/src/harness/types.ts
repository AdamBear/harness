export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface ExecOptions {
  cwd?: string
  env?: Record<string, string>
  stdin?: string
  timeoutMs?: number
  signal?: AbortSignal
}

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number
  durationSeconds: number
}

export interface DirEntry {
  name: string
  path: string
  kind: 'file' | 'directory'
  size?: number
}

export interface FileStat {
  kind: 'file' | 'directory'
  size: number
  modifiedAt: string
}
