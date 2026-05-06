import type {
  BaseModelProviderOptions,
  JsonRequest,
  JsonResponse,
  JsonStreamChunk,
  ModelMessage,
  ModelProvider,
  TextRequest,
  TextResponse,
  TextStreamChunk,
  ToolCallSpec,
  TokenUsage,
  JsonValue
} from '@purista/harness'
import { BaseModelProvider } from '@purista/harness'
import OpenAI, { type ClientOptions } from 'openai'

/**
 * Configuration for the OpenAI model provider factory.
 */
export interface OpenAiFactoryOptions extends ClientOptions {
  /** Optional injected client for tests or custom transport behavior. */
  client?: OpenAiClient
  /** Optional adapter-level logger override. Defaults to the harness logger when registered. */
  harnessLogger?: BaseModelProviderOptions['logger']
  /** Optional adapter-level telemetry override. Defaults to the harness telemetry shim when registered. */
  telemetry?: BaseModelProviderOptions['telemetry']
  /** Optional adapter-level timeout override. Defaults to the harness model timeout when registered. */
  harnessTimeoutMs?: number
}

/**
 * Creates an OpenAI-backed harness `ModelProvider`.
 *
 * Execution model:
 * - In-process adapter code
 * - External network calls to OpenAI-compatible chat completions endpoint
 * - AsyncIterable streaming for `textStream` and `jsonStream`
 *
 * @example
 * ```ts
 * import { z } from 'zod'
 * import { defineHarness } from '@purista/harness'
 * import { openai } from '@purista/harness-openai'
 *
 * const harness = defineHarness()
 *   .models({
 *     assistant: {
 *       provider: openai({ apiKey: process.env.OPENAI_API_KEY }),
 *       model: 'gpt-4.1-mini',
 *       capabilities: ['json']
 *     }
 *   })
 *   .agents({
 *     assistant: {
 *       model: 'assistant',
 *       instructions: 'Answer in one sentence.'
 *     }
 *   })
 *   .workflows({
 *     summarize: {
 *       input: z.string(),
 *       output: z.string(),
 *       handler: (ctx) => ctx.agents.assistant(ctx.input)
 *     }
 *   })
 *   .build()
 *
 * const session = await harness.getSession('demo')
 * const response = await session.workflows.summarize.prompt('Summarize this issue.')
 * ```
 */
export function openai(options: OpenAiFactoryOptions = {}): ModelProvider {
  return new OpenAiModelProvider(options)
}

class OpenAiModelProvider extends BaseModelProvider {
  private readonly client: OpenAiClient

  public constructor(private readonly options: OpenAiFactoryOptions) {
    super({
      id: 'openai',
      genAiSystem: 'openai',
      ...(options.harnessLogger ? { logger: options.harnessLogger } : {}),
      ...(options.telemetry ? { telemetry: options.telemetry } : {}),
      ...(options.harnessTimeoutMs !== undefined ? { timeoutMs: options.harnessTimeoutMs } : options.timeout !== undefined ? { timeoutMs: options.timeout } : {})
    })
    this.client = options.client ?? new OpenAI(toClientOptions(options))
  }

  protected override async doText(req: TextRequest): Promise<TextResponse> {
      req.signal.throwIfAborted()
      const response = await createChatCompletion(this.client, req, false)
      return mapTextResponse(response)
  }

  protected override async *doTextStream(req: TextRequest): AsyncIterable<TextStreamChunk> {
      req.signal.throwIfAborted()
      const stream = await createChatCompletion(this.client, req, true)
      let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      for await (const chunk of stream) {
        req.signal.throwIfAborted()
        const choice = chunk.choices[0]
        if (!choice) continue
        if (choice.delta?.content) {
          yield { kind: 'delta', text: choice.delta.content }
        }
        if (choice.delta?.tool_calls) {
          for (const call of choice.delta.tool_calls) {
            if (!call.function?.name || !call.id) continue
            yield {
              kind: 'tool_call',
              call: {
                id: call.id,
                name: call.function.name,
                arguments: parseToolArgs(call.function.arguments)
              }
            }
          }
        }
        if (chunk.usage) {
          usage = toUsage(chunk.usage.prompt_tokens, chunk.usage.completion_tokens)
        }
      }
      yield { kind: 'finish', usage, finishReason: 'stop' }
  }

  protected override async doJson(req: JsonRequest): Promise<JsonResponse> {
      req.signal.throwIfAborted()
      const response = await createChatCompletion(this.client, req, false)
      const textContent = response.choices[0]?.message?.content ?? '{}'
      const toolCalls = extractToolCalls(response)
      return {
        data: parseJson(textContent),
        ...(toolCalls ? { toolCalls } : {}),
        usage: toUsage(response.usage?.prompt_tokens, response.usage?.completion_tokens),
        finishReason: toFinishReason(response.choices[0]?.finish_reason),
        raw: response
      }
  }

  protected override async *doJsonStream(req: JsonRequest): AsyncIterable<JsonStreamChunk> {
      req.signal.throwIfAborted()
      let partial = ''
      let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      const stream = await createChatCompletion(this.client, req, true)
      for await (const chunk of stream) {
        req.signal.throwIfAborted()
        const choice = chunk.choices[0]
        if (!choice) continue
        if (choice.delta?.content) {
          partial += choice.delta.content
          yield { kind: 'partial', data: safePartialJson(partial) }
        }
        if (choice.delta?.tool_calls) {
          for (const call of choice.delta.tool_calls) {
            if (!call.function?.name || !call.id) continue
            yield {
              kind: 'tool_call',
              call: {
                id: call.id,
                name: call.function.name,
                arguments: parseToolArgs(call.function.arguments)
              }
            }
          }
        }
        if (chunk.usage) {
          usage = toUsage(chunk.usage.prompt_tokens, chunk.usage.completion_tokens)
        }
      }
      const data = parseJson(partial || '{}')
      yield { kind: 'finish', data, usage, finishReason: 'stop' }
  }
}

type ChatRequest = TextRequest | JsonRequest
export type OpenAiClient = {
  chat: {
    completions: {
      create(payload: unknown, options?: { signal?: AbortSignal }): Promise<any>
    }
  }
}

function toClientOptions(options: OpenAiFactoryOptions): ClientOptions {
  const { client: _client, harnessLogger: _harnessLogger, telemetry: _telemetry, harnessTimeoutMs: _harnessTimeoutMs, ...clientOptions } = options
  return clientOptions
}

function mapTextResponse(response: any): TextResponse {
  const toolCalls = extractToolCalls(response)
  return {
    content: response.choices[0]?.message?.content ?? '',
    ...(toolCalls ? { toolCalls } : {}),
    usage: toUsage(response.usage?.prompt_tokens, response.usage?.completion_tokens),
    finishReason: toFinishReason(response.choices[0]?.finish_reason),
    raw: response
  }
}

function extractToolCalls(response: any): ToolCallSpec[] | undefined {
  const toolCalls = response.choices[0]?.message?.tool_calls
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
    return undefined
  }

  return toolCalls
    .filter((call: any) => call?.id && call?.function?.name)
    .map((call: any) => ({
      id: String(call.id),
      name: String(call.function.name),
      arguments: parseToolArgs(call.function.arguments)
    }))
}

async function createChatCompletion(client: any, req: ChatRequest, stream: boolean): Promise<any> {
  const messages = toOpenAiMessages(req.messages)
  const providerOptions = {
    ...(req.defaults?.providerOptions ?? {}),
    ...(req.call?.providerOptions ?? {})
  } as Record<string, unknown> & { requestOptions?: Record<string, unknown> }
  const { requestOptions, ...bodyOptions } = providerOptions

  return client.chat.completions.create({
    model: req.model,
    messages,
    stream,
    tools: toTools(req.tools),
    temperature: req.call?.temperature ?? req.defaults?.temperature,
    max_tokens: req.call?.maxTokens ?? req.defaults?.maxTokens,
    top_p: req.call?.topP ?? req.defaults?.topP,
    stop: req.call?.stopSequences ?? req.defaults?.stopSequences,
    response_format: toResponseFormat(req),
    ...bodyOptions
  }, { ...requestOptions, signal: req.signal })
}

function toResponseFormat(req: ChatRequest): unknown {
  if (!('schema' in req)) return undefined
  return {
    type: 'json_schema',
    json_schema: {
      name: 'harness_response',
      strict: false,
      schema: req.schema
    }
  }
}

function toOpenAiMessages(messages: ModelMessage[]): any[] {
  return messages.map((message) => {
    if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
      return {
        role: 'assistant',
        content: typeof message.content === 'string' ? message.content : '',
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          type: 'function',
          function: {
            name: call.name,
            arguments: JSON.stringify(call.arguments)
          }
        }))
      }
    }

    if (typeof message.content === 'string' || message.role === 'tool') {
      if (message.role === 'tool') {
        return {
          role: 'tool',
          tool_call_id: message.toolCallId,
          content: message.content
        }
      }
      return { role: message.role, content: message.content }
    }

    return {
      role: message.role,
      content: message.content.map((part) => {
        if (part.kind === 'text') {
          return { type: 'text', text: part.text }
        }
        return {
          type: 'image_url',
          image_url: {
            url: `data:${part.mimeType};base64,${part.dataBase64}`
          }
        }
      })
    }
  })
}

function toTools(tools: TextRequest['tools'] | JsonRequest['tools']): any[] | undefined {
  if (!tools || tools.length === 0) {
    return undefined
  }

  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }))
}

function parseToolArgs(argumentsText: string | undefined): JsonValue {
  if (!argumentsText) return {}
  try {
    return JSON.parse(argumentsText)
  } catch {
    return { _raw: argumentsText }
  }
}

function parseJson(content: string): JsonValue {
  try {
    return JSON.parse(content)
  } catch {
    return { _raw: content }
  }
}

function safePartialJson(content: string): JsonValue {
  try {
    return JSON.parse(content)
  } catch {
    return { _partial: content }
  }
}

function toUsage(inputTokens?: number, outputTokens?: number): TokenUsage {
  const input = inputTokens ?? 0
  const output = outputTokens ?? 0
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output
  }
}

function toFinishReason(value: unknown): TextResponse['finishReason'] {
  switch (value) {
    case 'stop':
    case 'length':
    case 'tool_calls':
    case 'content_filter':
      return value
    default:
      return 'error'
  }
}
