import { describe, expect, it, vi } from 'vitest'

import { ModelError, OperationTimeoutError } from '../errors/index.js'
import { JsonLogger, type Logger } from '../logger/index.js'
import { BaseModelProvider } from '../ports/base-model-provider.js'
import type { JsonRequest, JsonResponse } from '../ports/model-provider.js'
import type { TelemetryShim } from '../telemetry/index.js'
import type { HarnessAdapterContext } from '../ports/harness-context.js'

class TestProvider extends BaseModelProvider {
  public error: unknown
  public delayMs = 0

  constructor(opts: { timeoutMs?: number; telemetry?: TelemetryShim; logger?: Logger } = {}) {
    super({ id: 'test', genAiSystem: 'test', ...opts })
  }

  protected override async doJson(req: JsonRequest): Promise<JsonResponse> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs))
    }
    if (this.error) throw this.error
    return {
      data: { ok: true },
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
      finishReason: 'stop',
      raw: { secret: 'not logged' }
    }
  }
}

function harnessContext(logger: Logger, telemetry: TelemetryShim, modelTimeoutMs = 300_000): HarnessAdapterContext {
  return {
    harnessName: 'test',
    logger,
    telemetry,
    defaults: {
      agentMaxIterations: 16,
      runTimeoutMs: 600_000,
      toolTimeoutMs: 120_000,
      skillTimeoutMs: 60_000,
      modelTimeoutMs
    }
  }
}

describe('BaseModelProvider', () => {
  it('normalizes raw provider failures into ModelError', async () => {
    const provider = new TestProvider()
    provider.error = Object.assign(new Error('provider failed'), {
      status: 503,
      code: 'server_error',
      type: 'api_error',
      request_id: 'req_base',
      error: { message: 'upstream unavailable', type: 'api_error' },
      headers: { 'x-request-id': 'req_base' }
    })

    await expect(provider.json({
      model: 'm',
      messages: [],
      schema: {},
      signal: new AbortController().signal
    })).rejects.toMatchObject({
      message: 'Model provider call failed(HTTP 503, server_error, api_error): upstream unavailable.',
      meta: {
        status: 503,
        providerCode: 'server_error',
        providerType: 'api_error',
        providerRequestId: 'req_base',
        providerMessage: 'upstream unavailable',
        providerBody: { message: 'upstream unavailable', type: 'api_error' }
      }
    })
  })

  it('enforces base timeout even when adapter work does not finish', async () => {
    const provider = new TestProvider({ timeoutMs: 5 })
    provider.delayMs = 50

    await expect(provider.json({
      model: 'm',
      messages: [],
      schema: {},
      signal: new AbortController().signal
    })).rejects.toBeInstanceOf(OperationTimeoutError)
  })

  it('records safe telemetry attributes and token counters', async () => {
    const calls: Array<{ name: string; attrs: Record<string, unknown> }> = []
    const telemetry: TelemetryShim = {
      span: async (_name, _attrs, fn) => fn({ setStatus: vi.fn(), recordException: vi.fn(), end: vi.fn() } as any),
      recordHistogram: (name, _value, attrs) => { calls.push({ name, attrs }) },
      recordCounter: (name, _value, attrs) => { calls.push({ name, attrs }) },
      currentTraceparent: () => undefined
    }
    const provider = new TestProvider({ telemetry })

    await provider.json({ model: 'm', messages: [{ role: 'user', content: 'secret prompt' }], schema: {}, signal: new AbortController().signal })

    expect(calls.some((call) => call.name === 'harness.model.tokens.total')).toBe(true)
    expect(JSON.stringify(calls)).not.toContain('secret prompt')
  })

  it('adds provider error details to telemetry attributes', async () => {
    const attrs: Record<string, unknown>[] = []
    const telemetry: TelemetryShim = {
      span: async (_name, _attrs, fn) => fn({ setStatus: vi.fn(), recordException: vi.fn(), end: vi.fn(), setAttributes: (next: Record<string, unknown>) => attrs.push(next) } as any),
      recordHistogram: () => undefined,
      recordCounter: () => undefined,
      currentTraceparent: () => undefined
    }
    const provider = new TestProvider({ telemetry })
    provider.error = Object.assign(new Error('bad request'), {
      status: 400,
      code: 'invalid_request_error',
      type: 'invalid_request_error',
      param: 'messages',
      error: { message: 'Invalid messages', type: 'invalid_request_error', param: 'messages' }
    })

    await expect(provider.json({
      model: 'm',
      messages: [],
      schema: {},
      signal: new AbortController().signal
    })).rejects.toBeInstanceOf(ModelError)

    expect(attrs.at(-1)).toMatchObject({
      'harness.error.model_provider_status': 400,
      'harness.error.model_provider_code': 'invalid_request_error',
      'harness.error.model_provider_type': 'invalid_request_error',
      'harness.error.model_provider_param': 'messages',
      'harness.error.model_provider_message': 'Invalid messages'
    })
  })

  it('inherits harness logger, telemetry, and timeout when adapter did not set them', async () => {
    const logs: string[] = []
    const counters: string[] = []
    const telemetry: TelemetryShim = {
      span: async (_name, _attrs, fn) => fn({ setStatus: vi.fn(), recordException: vi.fn(), end: vi.fn() } as any),
      recordHistogram: () => undefined,
      recordCounter: (name) => { counters.push(name) },
      currentTraceparent: () => undefined
    }
    const provider = new TestProvider()
    provider.delayMs = 50
    provider.configureHarnessContext(harnessContext(new JsonLogger({ level: 'error', out: { write: (chunk) => logs.push(chunk) } }), telemetry, 5))

    await expect(provider.json({
      model: 'm',
      messages: [],
      schema: {},
      signal: new AbortController().signal
    })).rejects.toBeInstanceOf(OperationTimeoutError)

    expect(counters).toContain('harness.model.errors')
    expect(logs.join('')).toContain('Model provider call failed.')
  })

  it('keeps explicit adapter telemetry over inherited harness telemetry', async () => {
    const explicitCounters: string[] = []
    const inheritedCounters: string[] = []
    const explicitTelemetry: TelemetryShim = {
      span: async (_name, _attrs, fn) => fn({ setStatus: vi.fn(), recordException: vi.fn(), end: vi.fn() } as any),
      recordHistogram: () => undefined,
      recordCounter: (name) => { explicitCounters.push(name) },
      currentTraceparent: () => undefined
    }
    const inheritedTelemetry: TelemetryShim = {
      span: async (_name, _attrs, fn) => fn({ setStatus: vi.fn(), recordException: vi.fn(), end: vi.fn() } as any),
      recordHistogram: () => undefined,
      recordCounter: (name) => { inheritedCounters.push(name) },
      currentTraceparent: () => undefined
    }
    const provider = new TestProvider({ telemetry: explicitTelemetry })
    provider.configureHarnessContext(harnessContext(new JsonLogger({ level: 'fatal', out: { write: () => undefined } }), inheritedTelemetry))

    await provider.json({ model: 'm', messages: [], schema: {}, signal: new AbortController().signal })

    expect(explicitCounters).toContain('harness.model.tokens.total')
    expect(inheritedCounters).toEqual([])
  })
})
