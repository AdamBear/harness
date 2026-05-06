import { context, trace } from '@opentelemetry/api'
import { sanitizeForLog } from '../errors/redaction.js'
import type { Logger, LogLevel } from './logger.js'

const ORDERED_LEVELS: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
const LEVEL_INDEX = new Map(ORDERED_LEVELS.map((level, index) => [level, index]))
const ENV_NAME = 'PURISTA_HARNESS_LOG_LEVEL'

function isLogLevel(value: string): value is LogLevel {
  return LEVEL_INDEX.has(value as LogLevel)
}

/**
 * Options for {@link JsonLogger}.
 */
export interface JsonLoggerOptions {
  /** Minimum emitted level. Defaults to env `PURISTA_HARNESS_LOG_LEVEL` or `info`. */
  level?: LogLevel
  /** Writable destination for newline-delimited JSON records. Defaults to `process.stdout`. */
  out?: { write(chunk: string): unknown }
  /** Static bindings added to every emitted log record. */
  bindings?: Record<string, unknown>
}

/**
 * Default structured logger emitting one JSON object per line.
 */
export class JsonLogger implements Logger {
  private readonly minLevel: LogLevel
  private readonly out: { write(chunk: string): unknown }
  private readonly bindings: Record<string, unknown>

  public constructor(opts: JsonLoggerOptions = {}) {
    this.out = opts.out ?? process.stdout
    this.bindings = { ...(opts.bindings ?? {}) }

    if (opts.level) {
      this.minLevel = opts.level
      return
    }

    const envLevel = process.env[ENV_NAME]
    if (envLevel && !isLogLevel(envLevel)) {
      this.minLevel = 'info'
      this.write('warn', `Invalid ${ENV_NAME} value. Falling back to info.`, { invalid_level: envLevel })
      return
    }

    this.minLevel = envLevel && isLogLevel(envLevel) ? envLevel : 'info'
  }

  public trace(msg: string, fields?: Record<string, unknown>): void { this.write('trace', msg, fields) }
  public debug(msg: string, fields?: Record<string, unknown>): void { this.write('debug', msg, fields) }
  public info(msg: string, fields?: Record<string, unknown>): void { this.write('info', msg, fields) }
  public warn(msg: string, fields?: Record<string, unknown>): void { this.write('warn', msg, fields) }
  public error(msg: string, fields?: Record<string, unknown>): void { this.write('error', msg, fields) }
  public fatal(msg: string, fields?: Record<string, unknown>): void { this.write('fatal', msg, fields) }

  public child(bindings: Record<string, unknown>): Logger {
    return new JsonLogger({ level: this.minLevel, out: this.out, bindings: { ...this.bindings, ...bindings } })
  }

  private write(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
    if ((LEVEL_INDEX.get(level) ?? 0) < (LEVEL_INDEX.get(this.minLevel) ?? 0)) {
      return
    }

    const activeContext = context.active()
    const spanContext = trace.getSpan(activeContext)?.spanContext() ?? trace.getSpanContext(activeContext)
    const sanitized = sanitizeForLog({ ...this.bindings, ...fields })
    const safeFields = sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
      ? sanitized as Record<string, unknown>
      : {}
    const line = {
      level,
      time: new Date().toISOString(),
      msg,
      ...(spanContext?.traceId ? { trace_id: spanContext.traceId } : {}),
      ...(spanContext?.spanId ? { span_id: spanContext.spanId } : {}),
      ...safeFields
    }

    try {
      this.out.write(`${JSON.stringify(line)}\n`)
    } catch {
      // Logging must not affect harness execution.
    }
  }
}
