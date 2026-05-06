import { afterEach, describe, expect, it } from 'vitest'
import { context, trace } from '@opentelemetry/api'
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks'

import { JsonLogger } from './json-logger.js'

class MemoryStream {
  public lines: string[] = []

  public write(chunk: string): void {
    this.lines.push(chunk)
  }
}

describe('JsonLogger', () => {
  const original = process.env['PURISTA_HARNESS_LOG_LEVEL']

  afterEach(() => {
    process.env['PURISTA_HARNESS_LOG_LEVEL'] = original
  })

  it('emits json line shape with RFC3339 timestamp', () => {
    const out = new MemoryStream()
    const logger = new JsonLogger({ out, level: 'trace', bindings: { harness: 'r' } })
    logger.info('hello', { run_id: 'r1' })

    const line = JSON.parse(out.lines[0] ?? '{}') as Record<string, string>
    expect(line['level']).toBe('info')
    expect(line['msg']).toBe('hello')
    expect(line['harness']).toBe('r')
    expect(line['run_id']).toBe('r1')
    expect(line['time']).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/)
  })

  it('child shadows parent bindings', () => {
    const out = new MemoryStream()
    const parent = new JsonLogger({ out, level: 'trace', bindings: { a: 1, b: 1 } })
    const child = parent.child({ b: 2, c: 3 })
    child.info('x')
    const line = JSON.parse(out.lines[0] ?? '{}') as Record<string, number>
    expect(line['a']).toBe(1)
    expect(line['b']).toBe(2)
    expect(line['c']).toBe(3)
  })

  it('invalid env level falls back to info and logs warning once', () => {
    process.env['PURISTA_HARNESS_LOG_LEVEL'] = 'bad'
    const out = new MemoryStream()
    const logger = new JsonLogger({ out })
    logger.debug('dropped')
    logger.info('kept')
    expect(out.lines).toHaveLength(2)
    expect(JSON.parse(out.lines[0] ?? '{}')['level']).toBe('warn')
    expect(JSON.parse(out.lines[1] ?? '{}')['msg']).toBe('kept')
  })

  it('redacts sensitive fields and does not throw when output fails', () => {
    const out = new MemoryStream()
    const logger = new JsonLogger({ out, level: 'trace' })
    logger.error('secret', { authorization: 'Bearer sk_live_secret', nested: { apiKey: 'sk_live_secret' } })
    expect(out.lines.join('')).not.toContain('sk_live_secret')
    expect(out.lines.join('')).toContain('[redacted]')

    const throwing = new JsonLogger({ level: 'trace', out: { write: () => { throw new Error('sink failed') } } })
    expect(() => throwing.info('still safe', { token: 'secret-token' })).not.toThrow()
  })

  it('adds active trace and span ids', () => {
    context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable())
    const out = new MemoryStream()
    const logger = new JsonLogger({ out, level: 'trace' })
    try {
      context.with(trace.setSpanContext(context.active(), {
        traceId: '00000000000000000000000000000001',
        spanId: '0000000000000002',
        traceFlags: 1
      }), () => {
        logger.info('with trace')
      })
    } finally {
      context.disable()
    }

    const line = JSON.parse(out.lines[0] ?? '{}') as Record<string, string>
    expect(line['trace_id']).toBe('00000000000000000000000000000001')
    expect(line['span_id']).toBe('0000000000000002')
  })
})
