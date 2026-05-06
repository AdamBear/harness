import { ModelCapabilityError } from '../errors/index.js'
import {
  ATTR_GEN_AI_REQUEST_MODEL,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_SYSTEM,
  ATTR_GEN_AI_TOKEN_TYPE,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
  GEN_AI_TOKEN_TYPE_VALUE_INPUT,
  GEN_AI_TOKEN_TYPE_VALUE_OUTPUT
} from '@opentelemetry/semantic-conventions/incubating'
import type {
  JsonRequest,
  JsonResponse,
  JsonStreamChunk,
  ModelAlias,
  ModelCallOptions,
  ModelCapability,
  TextRequest,
  TextResponse,
  TextStreamChunk
} from '../ports/model-provider.js'
import type { SpanAttrs, TelemetryShim } from '../telemetry/index.js'

export interface ModelInvokeContext {
  harnessName: string
  sessionId: string
  runId: string
  workflowId?: string
  agentId?: string
}

interface HandleRequest {
  messages: TextRequest['messages']
  call?: ModelCallOptions | undefined
  tools?: TextRequest['tools'] | undefined
  schema?: JsonRequest['schema'] | undefined
}

/** Bound model handle produced by {@link createModelRegistry}. */
export interface ModelHandle {
  /** Executes a single text generation request. */
  text(req: Omit<TextRequest, 'model' | 'signal' | 'defaults'>, signal: AbortSignal, ctx?: ModelInvokeContext): Promise<TextResponse>
  /** Executes a streaming text generation request. */
  textStream(req: Omit<TextRequest, 'model' | 'signal' | 'defaults'>, signal: AbortSignal, ctx?: ModelInvokeContext): AsyncIterable<TextStreamChunk>
  /** Executes a single structured JSON generation request. */
  json(req: Omit<JsonRequest, 'model' | 'signal' | 'defaults'>, signal: AbortSignal, ctx?: ModelInvokeContext): Promise<JsonResponse>
  /** Executes a streaming structured JSON generation request. */
  jsonStream(req: Omit<JsonRequest, 'model' | 'signal' | 'defaults'>, signal: AbortSignal, ctx?: ModelInvokeContext): AsyncIterable<JsonStreamChunk>
}

/**
 * Creates per-alias model handles that enforce capability gates before provider invocation.
 *
 * @example
 * ```ts
 * const registry = createModelRegistry({
 *   assistant: { provider, model: 'gpt-4.1-mini', capabilities: ['text'] }
 * })
 * const out = await registry.assistant.text({ messages: [{ role: 'user', content: 'hi' }] }, new AbortController().signal)
 * ```
 */
export function createModelRegistry(aliases: Record<string, ModelAlias>, options: { telemetry?: TelemetryShim; harnessName?: string } = {}): Record<string, ModelHandle> {
  return Object.fromEntries(
    Object.entries(aliases).map(([aliasKey, alias]) => [aliasKey, createHandle(aliasKey, alias, options)])
  )
}

function createHandle(aliasKey: string, alias: ModelAlias, options: { telemetry?: TelemetryShim; harnessName?: string }): ModelHandle {
  return {
    text(req, signal, ctx) {
      ensureCapabilities(aliasKey, alias, 'text', req)
      if (!alias.provider.text) throw methodMissing(aliasKey, 'text')
      const fullReq: TextRequest = {
        model: alias.model,
        messages: req.messages,
        ...(req.call ? { call: req.call } : {}),
        ...(mergeDefaults(alias, req.call) ? { defaults: mergeDefaults(alias, req.call) } : {}),
        ...(req.tools ? { tools: req.tools } : {}),
        signal,
        traceparent: req.traceparent ?? options.telemetry?.currentTraceparent()
      }
      return withModelSpan(options, aliasKey, alias, 'text', ctx, () => alias.provider.text!(fullReq))
    },
    textStream(req, signal) {
      ensureCapabilities(aliasKey, alias, 'text_stream', req)
      if (!alias.provider.textStream) throw methodMissing(aliasKey, 'textStream')
      return alias.provider.textStream({
        model: alias.model,
        messages: req.messages,
        ...(req.call ? { call: req.call } : {}),
        ...(mergeDefaults(alias, req.call) ? { defaults: mergeDefaults(alias, req.call) } : {}),
        ...(req.tools ? { tools: req.tools } : {}),
        signal,
        traceparent: req.traceparent ?? options.telemetry?.currentTraceparent()
      })
    },
    json(req, signal, ctx) {
      ensureCapabilities(aliasKey, alias, 'json', req)
      if (!alias.provider.json) throw methodMissing(aliasKey, 'json')
      const fullReq: JsonRequest = {
        model: alias.model,
        messages: req.messages,
        ...(req.call ? { call: req.call } : {}),
        ...(mergeDefaults(alias, req.call) ? { defaults: mergeDefaults(alias, req.call) } : {}),
        ...(req.tools ? { tools: req.tools } : {}),
        schema: req.schema,
        signal,
        traceparent: req.traceparent ?? options.telemetry?.currentTraceparent()
      }
      return withModelSpan(options, aliasKey, alias, 'json', ctx, () => alias.provider.json!(fullReq))
    },
    jsonStream(req, signal) {
      ensureCapabilities(aliasKey, alias, 'json_stream', req)
      if (!alias.provider.jsonStream) throw methodMissing(aliasKey, 'jsonStream')
      return alias.provider.jsonStream({
        model: alias.model,
        messages: req.messages,
        ...(req.call ? { call: req.call } : {}),
        ...(mergeDefaults(alias, req.call) ? { defaults: mergeDefaults(alias, req.call) } : {}),
        ...(req.tools ? { tools: req.tools } : {}),
        schema: req.schema,
        signal,
        traceparent: req.traceparent ?? options.telemetry?.currentTraceparent()
      })
    }
  }
}

async function withModelSpan<T>(
  options: { telemetry?: TelemetryShim; harnessName?: string },
  aliasKey: string,
  alias: ModelAlias,
  method: ModelCapability,
  ctx: ModelInvokeContext | undefined,
  fn: () => Promise<T>
): Promise<T> {
  if (!options.telemetry) return fn()
  const started = Date.now()
  const attrs: SpanAttrs = {
    'harness.name': ctx?.harnessName ?? options.harnessName,
    'harness.session.id': ctx?.sessionId,
    'harness.run.id': ctx?.runId,
    'harness.workflow.id': ctx?.workflowId,
    'harness.agent.id': ctx?.agentId,
    'harness.model.alias': aliasKey,
    'harness.model.method': method,
    [ATTR_GEN_AI_SYSTEM]: alias.provider.genAiSystem,
    [ATTR_GEN_AI_REQUEST_MODEL]: alias.model,
    'model.provider': alias.provider.id
  }

  return options.telemetry.span(`chat ${alias.model}`, attrs, async (span) => {
    const result = await fn()
    const usage = (result as { usage?: { inputTokens: number; outputTokens: number; totalTokens: number }; finishReason?: string }).usage
    const finishReason = (result as { finishReason?: string }).finishReason
    if (usage) {
      span.setAttributes({
        [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: usage.inputTokens,
        [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: usage.outputTokens,
        'gen_ai.usage.total_tokens': usage.totalTokens
      })
      options.telemetry?.recordCounter('gen_ai.client.token.usage', usage.inputTokens, { ...attrs, [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_INPUT })
      options.telemetry?.recordCounter('gen_ai.client.token.usage', usage.outputTokens, { ...attrs, [ATTR_GEN_AI_TOKEN_TYPE]: GEN_AI_TOKEN_TYPE_VALUE_OUTPUT })
    }
    if (finishReason) span.setAttribute(ATTR_GEN_AI_RESPONSE_FINISH_REASONS, [finishReason])
    options.telemetry?.recordHistogram('gen_ai.client.operation.duration', (Date.now() - started) / 1000, attrs)
    return result
  })
}

/**
 * Validates alias capabilities for the requested operation.
 *
 * Throws {@link ModelCapabilityError} when required capabilities are missing.
 */
function ensureCapabilities(aliasKey: string, alias: ModelAlias, method: ModelCapability, req: HandleRequest): void {
  if (!alias.capabilities.includes(method)) {
    throw new ModelCapabilityError('Model alias does not provide requested capability.', {
      alias: aliasKey,
      method,
      reason: 'missing_capability'
    })
  }

  if (req.tools && req.tools.length > 0 && !alias.capabilities.includes('tool_use')) {
    throw new ModelCapabilityError('Model alias does not support tool use.', {
      alias: aliasKey,
      method,
      reason: 'missing_capability'
    })
  }

  const hasImageInput = req.messages.some(
    (message) => Array.isArray(message.content) && message.content.some((part) => part.kind === 'image')
  )
  if (hasImageInput && !alias.capabilities.includes('vision_input')) {
    throw new ModelCapabilityError('Model alias does not support vision input.', {
      alias: aliasKey,
      method,
      reason: 'missing_capability'
    })
  }
}

/** Builds a standardized capability error when provider methods are missing. */
function methodMissing(alias: string, method: string): ModelCapabilityError {
  return new ModelCapabilityError('Model provider method is not implemented.', {
    alias,
    method,
    reason: 'method_missing'
  })
}

/** Merges alias defaults with per-call overrides. */
function mergeDefaults(alias: ModelAlias, call?: ModelCallOptions): ModelAlias['defaults'] | undefined {
  const merged: ModelAlias['defaults'] = {
    ...(alias.defaults ?? {}),
    ...(call ?? {}),
    providerOptions: {
      ...(alias.defaults?.providerOptions ?? {}),
      ...(call?.providerOptions ?? {})
    }
  }
  const hasTopLevel =
    merged.temperature !== undefined
    || merged.maxTokens !== undefined
    || merged.topP !== undefined
    || merged.stopSequences !== undefined
    || Object.keys(merged.providerOptions ?? {}).length > 0
  return hasTopLevel ? merged : undefined
}
