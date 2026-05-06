/**
 * Supported structured log levels, ordered from most to least verbose.
 */
export type LogLevel =
  /** Fine-grained diagnostic tracing. */
  'trace'
  /** Developer-oriented debugging details. */
  | 'debug'
  /** Standard operational information. */
  | 'info'
  /** Recoverable warnings requiring visibility. */
  | 'warn'
  /** Errors that impacted a request/run. */
  | 'error'
  /** Fatal errors that may terminate process health. */
  | 'fatal'

/**
 * Logger contract used by the harness.
 *
 * All methods must be synchronous and non-throwing from the perspective of
 * harness callers.
 */
export interface Logger {
  trace(msg: string, fields?: Record<string, unknown>): void
  debug(msg: string, fields?: Record<string, unknown>): void
  info(msg: string, fields?: Record<string, unknown>): void
  warn(msg: string, fields?: Record<string, unknown>): void
  error(msg: string, fields?: Record<string, unknown>): void
  fatal(msg: string, fields?: Record<string, unknown>): void
  child(bindings: Record<string, unknown>): Logger
}
