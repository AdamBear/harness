# Models

**Purpose.** Defines the model alias config, the `ModelProvider` port with full TS signatures, capability declaration and enforcement, and `ModelDefaults`.

## Capabilities (closed enum)

```ts
type ModelCapability =
  | 'text' | 'text_stream'
  | 'json' | 'json_stream'
  | 'tool_use'
  | 'vision_input'
```

`tool_use` and `vision_input` are markers, not method-callable. The other entries each correspond to a same-named method on `ModelProvider`. A provider only needs to implement the methods it claims; calling an unclaimed method throws [`ModelCapabilityError`](./15-error-catalog.md).

## Alias config

```ts
interface ModelAlias {
  provider: ModelProvider
  model: string
  capabilities: readonly ModelCapability[]
  defaults?: ModelDefaults
  /** Free-form provider-specific options, passed to the provider unchanged. */
  providerOptions?: Record<string, unknown>
}

interface ModelDefaults {
  temperature?: number          // 0..2
  maxTokens?: number            // positive int
  topP?: number                 // 0..1
  stopSequences?: string[]
  /** Provider-specific knobs. Use this for reasoning effort, etc. */
  providerOptions?: Record<string, unknown>
}
```

Aliases are registered via `defineHarness().models({...})`. Each key is the alias id referenced by agents (`AgentDefinition.model`).

## `ModelProvider` port

Adapter packages SHOULD extend `BaseModelProvider` instead of implementing this
interface from scratch. The base class owns timeout/cancellation, safe logging,
tracing/metrics, error normalization, and common response validation. Concrete
adapters implement provider-specific request/response mapping in protected
methods such as `doText`, `doJson`, `doTextStream`, and `doJsonStream`.
At harness composition time, `BaseModelProvider` instances automatically inherit
the harness logger, telemetry shim, and `defaults.modelTimeoutMs` unless the
adapter explicitly set its own value.

Adapters SHOULD stay thin over official provider SDKs. Prefer passing SDK
constructor options and per-call provider options through to the official SDK
instead of recreating provider-specific features in harness code. The adapter's
main responsibility is mapping between harness-neutral request/response shapes
and the provider SDK's request/response shapes.

```ts
interface ModelProvider {
  readonly id: string                          // human-readable, e.g. 'openai', 'anthropic'
  /**
   * GenAI semantic-conventions value for `gen_ai.system`, e.g. 'openai', 'anthropic',
   * 'azure.ai.openai'. The harness asserts this is set when emitting model-call spans.
   * See [14-otel-conventions](./14-otel-conventions.md).
   */
  readonly genAiSystem: string

  text?(req: TextRequest): Promise<TextResponse>
  textStream?(req: TextRequest): AsyncIterable<TextStreamChunk>

  json?(req: JsonRequest): Promise<JsonResponse>
  jsonStream?(req: JsonRequest): AsyncIterable<JsonStreamChunk>

  close?(): Promise<void>
}

abstract class BaseModelProvider implements ModelProvider {
  readonly id: string
  readonly genAiSystem: string
  text(req: TextRequest): Promise<TextResponse>
  textStream(req: TextRequest): AsyncIterable<TextStreamChunk>
  json(req: JsonRequest): Promise<JsonResponse>
  jsonStream(req: JsonRequest): AsyncIterable<JsonStreamChunk>
}
```

### Common request shape

```ts
interface BaseRequest {
  model: string                          // resolved alias.model
  messages: ModelMessage[]
  defaults?: ModelDefaults                // resolved alias.defaults overrides
  call?: ModelCallOptions                 // per-call overrides
  signal: AbortSignal
  /** Trace context propagation. The harness auto-injects this from the active OTel
   *  context; providers treat it as opaque pass-through. */
  traceparent?: string
}

interface ModelCallOptions {
  temperature?: number
  maxTokens?: number
  topP?: number
  stopSequences?: string[]
  providerOptions?: Record<string, unknown>
}

type ModelMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | ContentPart[]; toolCalls?: ToolCallSpec[] }
  | { role: 'tool'; toolCallId: string; content: string }

type ContentPart =
  | { kind: 'text'; text: string }
  | { kind: 'image'; mimeType: string; dataBase64: string }      // requires vision_input

interface ToolCallSpec {
  id: string
  name: string
  arguments: JsonValue
}
```

### Text

```ts
interface TextRequest extends BaseRequest {
  tools?: ModelToolSpec[]                 // requires capability 'tool_use'
}
interface TextResponse {
  content: string
  toolCalls?: ToolCallSpec[]
  usage: TokenUsage
  finishReason: FinishReason
  raw?: unknown
}
type TextStreamChunk =
  | { kind: 'delta'; text: string }
  | { kind: 'tool_call'; call: ToolCallSpec }
  | { kind: 'finish'; usage: TokenUsage; finishReason: FinishReason }

type FinishReason = 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error'
interface TokenUsage { inputTokens: number; outputTokens: number; totalTokens: number }

interface ModelToolSpec {
  name: string
  description: string
  parameters: JsonValue                   // JSON Schema
}
```

### JSON

```ts
interface JsonRequest extends BaseRequest {
  schema: JsonValue                       // JSON Schema for the response
  tools?: ModelToolSpec[]
}
interface JsonResponse {
  data: JsonValue
  toolCalls?: ToolCallSpec[]
  usage: TokenUsage
  finishReason: FinishReason
  raw?: unknown
}
type JsonStreamChunk =
  | { kind: 'partial'; data: JsonValue }
  | { kind: 'tool_call'; call: ToolCallSpec }
  | { kind: 'finish'; data: JsonValue; usage: TokenUsage; finishReason: FinishReason }
```

## Models access on agent context

The agent context exposes `models` keyed by registered alias id. Each alias handle exposes the four method shapes:

```ts
interface ModelHandle<A extends ModelAlias> {
  text(req: Omit<TextRequest, 'model' | 'signal'>): Promise<TextResponse>
  textStream(req: Omit<TextRequest, 'model' | 'signal'>): AsyncIterable<TextStreamChunk>
  json(req: Omit<JsonRequest, 'model' | 'signal'>): Promise<JsonResponse>
  jsonStream(req: Omit<JsonRequest, 'model' | 'signal'>): AsyncIterable<JsonStreamChunk>
}
```

The harness injects `model`, `signal`, and merges `defaults` ← `call` per call. If the alias doesn't claim the capability for the method invoked, throw `ModelCapabilityError`. If the provider doesn't implement the method, throw `ModelCapabilityError` with `meta.reason: 'method_missing'`.

## Capability enforcement

| Method called          | Required capability       |
|------------------------|---------------------------|
| `models[alias].text`          | `'text'`                  |
| `models[alias].textStream`    | `'text_stream'`           |
| `models[alias].json`          | `'json'`                  |
| `models[alias].jsonStream`    | `'json_stream'`           |
| any with `tools[]`     | also `'tool_use'`         |
| any with image content | also `'vision_input'`     |

## Defaults resolution

Per call, the effective options are computed:

```
effective = { ...alias.defaults, ...req.call }
```

Then pass `effective.providerOptions` through verbatim. `temperature`, `maxTokens`, `topP`, `stopSequences` map to first-class fields on the provider's request.

## Errors

- `ModelCapabilityError` — alias missing capability or provider missing method.
- `ModelError` — provider-side failure (HTTP error, malformed response). `retriable` is `true` for 5xx/network; `false` for 4xx other than 429 (429 is retriable). Provider implementations MUST map "context length exceeded" responses (e.g. OpenAI `context_length_exceeded`) to `ModelError` with `meta.reason: 'context_length_exceeded'` and `retriable: false`. See the full reason enum in [15-error-catalog](./15-error-catalog.md).
- `OperationTimeoutError` — exceeded `defaults.modelTimeoutMs`.
- `OperationCancelledError` — abort signaled.

## Cross-references

- [02-harness-config](./02-harness-config.md) — `.models(...)` builder method.
- [09-agents](./09-agents.md) — how the agent handler accesses models.
- [14-otel-conventions](./14-otel-conventions.md) — `chat {request.model}` span (GenAI conv) and `gen_ai.client.*` metrics.
- [15-error-catalog](./15-error-catalog.md).
