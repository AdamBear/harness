import { describe, expect, it } from 'vitest'

import { createTelemetryShim } from './shim.js'

describe('telemetry shim', () => {
  it('runs span callback and returns value', async () => {
    const shim = createTelemetryShim()
    const result = await shim.span('x', { a: 1, b: undefined }, async () => 'ok')
    expect(result).toBe('ok')
  })

  it('records counters and histograms without throwing', () => {
    const shim = createTelemetryShim()
    expect(() => {
      shim.recordCounter('c', 1, { a: 'x', b: undefined })
      shim.recordHistogram('h', 1.2, { a: 'x' })
    }).not.toThrow()
  })
})
