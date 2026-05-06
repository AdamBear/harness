const REDACTED = '[redacted]'
const TRUNCATED = '[truncated]'

const SENSITIVE_KEY_PATTERN = /(?:^|[-_.])(authorization|cookie|set-cookie|token|accesstoken|refreshtoken|apikey|api_key|x-api-key|secret|password|credential|privatekey|clientsecret)(?:$|[-_.])/i
const CONTENT_KEY_PATTERN = /^(prompt|prompts|messages|input|inputs|output|outputs|content|contents|text|data|body)$/i
const SAFE_PROVIDER_ERROR_KEYS = new Set(['code', 'type', 'param', 'message'])

export type RedactionMode = 'log' | 'provider_body'

export function sanitizeForLog(value: unknown): unknown {
  return sanitizeValue(value, { mode: 'log', seen: new WeakSet(), depth: 0 })
}

export function sanitizeProviderBody(value: unknown): unknown {
  return sanitizeValue(value, { mode: 'provider_body', seen: new WeakSet(), depth: 0 })
}

export function sanitizeMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const sanitized = sanitizeForLog(meta)
  return isRecord(sanitized) ? sanitized : undefined
}

export function sanitizeProviderMessage(message: string): string {
  return redactString(message).slice(0, 500)
}

function sanitizeValue(
  value: unknown,
  opts: { mode: RedactionMode; seen: WeakSet<object>; depth: number; key?: string }
): unknown {
  if (opts.key && isSensitiveKey(opts.key)) return REDACTED
  if (opts.mode === 'provider_body' && opts.key && isContentKey(opts.key) && !SAFE_PROVIDER_ERROR_KEYS.has(opts.key)) return REDACTED
  if (value === undefined) return undefined
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') return redactString(value).slice(0, 4000)
  if (typeof value === 'symbol' || typeof value === 'function') return String(value).slice(0, 4000)
  if (opts.depth >= 4) return TRUNCATED
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValue(item, { mode: opts.mode, seen: opts.seen, depth: opts.depth + 1 }))
  if (!isRecord(value)) return String(value).slice(0, 4000)
  if (opts.seen.has(value)) return '[circular]'
  opts.seen.add(value)

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value).slice(0, 40)) {
    out[key] = sanitizeValue(item, { ...opts, depth: opts.depth + 1, key })
  }
  opts.seen.delete(value)
  return out
}

function redactString(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\bBasic\s+[A-Za-z0-9+/=-]+/gi, 'Basic [redacted]')
    .replace(/\b(sk|pk|rk|sess|key|token|secret)_[A-Za-z0-9._-]{8,}/gi, '$1_[redacted]')
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`))
}

function isContentKey(key: string): boolean {
  return CONTENT_KEY_PATTERN.test(key)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
