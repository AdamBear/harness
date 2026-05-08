# Adapter Authoring

## Contents
- Model Provider Adapter
- OpenAI-Compatible Provider
- Anthropic Provider
- Amazon Bedrock Provider
- Azure AI Foundry Provider
- State Store Adapter
- Sandbox Adapter
- Durable Runtime Adapter
- Harness Context

Adapters should be thin, typed implementations of harness ports. Prefer official provider SDKs and pass provider-specific options through instead of recreating provider feature matrices inside the harness.

## Model Provider Adapter
Prefer extending `BaseModelProvider`:

```ts
import {
  BaseModelProvider,
  type EmbeddingRequest,
  type EmbeddingResponse,
  type ModelProvider,
  type ObjectRequest,
  type ObjectResponse,
  type RerankRequest,
  type RerankResponse,
  type TextRequest,
  type TextResponse
} from '@purista/harness'

export function customProvider(options: CustomOptions): ModelProvider {
  return new CustomProvider(options)
}

class CustomProvider extends BaseModelProvider {
  constructor(private readonly options: CustomOptions) {
    super({ id: 'custom', genAiSystem: 'custom' })
  }

  protected override async doText(req: TextRequest): Promise<TextResponse> {
    req.signal.throwIfAborted()
    const response = await this.options.client.generateText(req)
    return {
      content: response.text,
      usage: { inputTokens: response.inputTokens, outputTokens: response.outputTokens, totalTokens: response.totalTokens },
      finishReason: 'stop',
      raw: response
    }
  }

  protected override async doObject<T>(req: ObjectRequest<T>): Promise<ObjectResponse<T>> {
    req.signal.throwIfAborted()
    const response = await this.options.client.generateObject(req)
    return {
      object: response.object,
      usage: response.usage,
      finishReason: 'stop',
      raw: response
    }
  }
}
```

Implement only supported operations:
- `doText` for `text`
- `doTextStream` for `text_stream`
- `doObject` for `object`
- `doObjectStream` for `object_stream`
- `doEmbed` for `embeddings`
- `doRerank` for `rerank`

If the provider cannot support an operation cleanly, omit it and do not declare the matching alias capability in examples.

Adapter mapping checklist:
- map messages and multimodal `ContentPart` values
- map tool declarations and tool calls
- map schema/object generation
- implement streaming as `AsyncIterable<TextStreamChunk>` / `AsyncIterable<ObjectStreamChunk>` when supported
- implement embeddings and rerank only when the provider API has first-class support
- map token usage and finish reason
- pass `req.signal` to SDK calls when supported
- pass `req.call.providerOptions` through to provider-specific SDK options
- normalize provider errors to `ModelError` / `ModelCapabilityError` through `BaseModelProvider` behavior
- expose `genAiSystem` for OpenTelemetry semantic conventions
- implement `close()` when the provider owns sockets, child processes, or clients needing shutdown

## OpenAI-Compatible Provider
Use `@purista/harness-openai` for OpenAI or OpenAI-compatible endpoints:

```ts
import { openai } from '@purista/harness-openai'

openai({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENAI_BASE_URL,
  organization: process.env.OPENAI_ORG,
  project: process.env.OPENAI_PROJECT
})
```

The OpenAI adapter supports chat-completions style text/object operations and embeddings. Declare only the capabilities the selected model and endpoint support.

The adapter inherits harness logger, telemetry, and model timeout through `BaseModelProvider` unless explicit adapter options override them.

## Anthropic Provider
Use `@purista/harness-anthropic` for Anthropic Messages API models:

```ts
import { anthropic } from '@purista/harness-anthropic'

anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
})
```

The Anthropic adapter maps harness messages, tool calls, structured object
generation, and streaming to the official `@anthropic-ai/sdk`.

## Amazon Bedrock Provider
Use `@purista/harness-bedrock` for Amazon Bedrock Runtime Converse models:

```ts
import { bedrock } from '@purista/harness-bedrock'

bedrock({
  region: process.env.AWS_REGION ?? 'us-east-1'
})
```

The Bedrock adapter maps harness calls to the official
`@aws-sdk/client-bedrock-runtime` Converse and ConverseStream APIs. AWS
credentials use the standard AWS SDK credential chain.

## Azure AI Foundry Provider
Use `@purista/harness-azure-foundry` for Azure AI Foundry model endpoints:

```ts
import { azureFoundry } from '@purista/harness-azure-foundry'

azureFoundry({
  endpoint: process.env.AZURE_AI_ENDPOINT!,
  apiKey: process.env.AZURE_AI_API_KEY!
})
```

The Azure adapter maps chat completions, object generation, streaming, and
embeddings to the official `@azure-rest/ai-inference` client.

## State Store Adapter
Implement `StateStore` for durable sessions, messages, runs, and streamed events. Extend `StateStoreAdapterBase` when useful so logger, telemetry, and harness name are inherited:

```ts
class PostgresStateStore extends StateStoreAdapterBase {
  async getSession(id) { /* read session */ }
  async upsertSession(record) { /* upsert session */ }
  async appendMessages(sessionId, messages) { /* append atomically */ }
  async listMessages(sessionId, opts) { /* stable ordering */ }
  async createRun(record) { /* insert run */ }
  async finishRun(runId, patch) { /* update terminal run */ }
  async appendEvents(runId, events) { /* append event batch */ }
  async listEvents(runId, opts) { /* cursor/after support */ }
}
```

Durable state stores should pass the state-store contract tests from `@purista/harness/testing`.

State stores may implement `configureHarnessContext(context)` directly or extend `StateStoreAdapterBase`. Keep message and event ordering stable because session history and stream replay rely on deterministic order.

## Sandbox Adapter
Implement `Sandbox` and `SandboxSession` for custom isolation:

```ts
const remoteSandbox = {
  capabilities: ['sandbox.fs', 'sandbox.exec'],
  async open({ sessionId, runId, signal }) {
    return remoteSession
  }
}
```

Make executor availability explicit:
- `executor: 'unavailable'` for filesystem-only sessions
- `executor: 'available'` when `exec(...)` is supported

Snapshot-capable adapters may implement `snapshot`, `resume`, and `hibernate`, and should declare matching capabilities so applications can fail fast with `.requires([...])`.

## Durable Runtime Adapter
Use a durable runtime adapter when workflow execution needs leases, checkpoints, retries, and resume behavior:

```ts
const harness = defineHarness()
  .runtime(durableRuntime)
  .requires(['runtime.checkpoint', 'runtime.resume_from_checkpoint'])
  .models(...)
  .agents(...)
  .build()
```

Streams are observation, not recovery. Recovery resumes from committed checkpoints.

Use `.requires([...])` with durable runtime capabilities so unsupported adapters fail at startup instead of silently degrading.

## Harness Context
Adapters that need shared logger, telemetry, timeout defaults, or harness name can implement:

```ts
configureHarnessContext(context) {
  this.logger ??= context.logger
  this.telemetry ??= context.telemetry
  this.harnessName ??= context.harnessName
}
```

Avoid importing application packages in adapters. Adapter packages should depend on `@purista/harness` and their provider SDK only.
