import { afterEach, describe, expect, it } from 'vitest'

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
})
