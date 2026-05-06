import type { JsonValue } from '../models/json.js'

/**
 * Model capabilities declared by aliases in `.models(...)`.
 */
export type ModelCapability =
  /** Synchronous plain text generation. */
  'text'
  /** Streaming plain text generation. */
  | 'text_stream'
  /** Synchronous structured JSON generation. */
  | 'json'
  /** Streaming structured JSON generation. */
  | 'json_stream'
  /** Function/tool calling support. */
  | 'tool_use'
  /** Image input understanding. */
  | 'vision_input'

/** Default generation parameters applied per alias. */
export interface ModelDefaults {
  temperature?: number
  maxTokens?: number
  topP?: number
  stopSequences?: string[]
  providerOptions?: Record<string, unknown>
}

/** Per-call generation overrides. */
export interface ModelCallOptions {
  temperature?: number
  maxTokens?: number
  topP?: number
  stopSequences?: string[]
  providerOptions?: Record<string, unknown>
}

/** Tool call envelope emitted by model adapters. */
export interface ToolCallSpec {
  id: string
  name: string
  arguments: JsonValue
}

/** Multimodal message content part. */
export type ContentPart =
  /** Plain text input content. */
  | { kind: 'text'; text: string }
  /** Inline image content encoded as base64 data. */
  | { kind: 'image'; mimeType: string; dataBase64: string }

/** Message schema shared across provider adapters. */
export type ModelMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | ContentPart[]; toolCalls?: ToolCallSpec[] }
  | { role: 'tool'; toolCallId: string; content: string }

/** Base request shape for all model-provider methods. */
export interface BaseRequest {
  model: string
  messages: ModelMessage[]
  defaults?: ModelDefaults | undefined
  call?: ModelCallOptions | undefined
  signal: AbortSignal
  traceparent?: string | undefined
}

/** Token usage accounting normalized across providers. */
export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

/** Normalized finish reasons from model providers. */
export type FinishReason =
  /** Natural model stop sequence. */
  'stop'
  /** Token budget reached. */
  | 'length'
  /** Model requested tool calls. */
  | 'tool_calls'
  /** Provider content filter interrupted generation. */
  | 'content_filter'
  /** Provider or adapter error fallback. */
  | 'error'

/** Tool declaration exposed to model adapters. */
export interface ModelToolSpec {
  name: string
  description: string
  parameters: JsonValue
}

/** Request for text/text-stream model methods. */
export interface TextRequest extends BaseRequest {
  tools?: ModelToolSpec[] | undefined
}

/** Response from synchronous text generation. */
export interface TextResponse {
  content: string
  toolCalls?: ToolCallSpec[]
  usage: TokenUsage
  finishReason: FinishReason
  raw?: unknown
}

/** Stream chunk from text-stream generation. */
export type TextStreamChunk =
  | { kind: 'delta'; text: string }
  | { kind: 'tool_call'; call: ToolCallSpec }
  | { kind: 'finish'; usage: TokenUsage; finishReason: FinishReason }

/** Request for json/json-stream model methods. */
export interface JsonRequest extends BaseRequest {
  schema: JsonValue
  tools?: ModelToolSpec[] | undefined
}

/** Response from synchronous JSON generation. */
export interface JsonResponse {
  data: JsonValue
  toolCalls?: ToolCallSpec[]
  usage: TokenUsage
  finishReason: FinishReason
  raw?: unknown
}

/** Stream chunk from json-stream generation. */
export type JsonStreamChunk =
  | { kind: 'partial'; data: JsonValue }
  | { kind: 'tool_call'; call: ToolCallSpec }
  | { kind: 'finish'; data: JsonValue; usage: TokenUsage; finishReason: FinishReason }

/** Provider adapter interface implemented by packages such as `@purista/harness-openai`. */
export interface ModelProvider {
  readonly id: string
  readonly genAiSystem: string
  text?(req: TextRequest): Promise<TextResponse>
  textStream?(req: TextRequest): AsyncIterable<TextStreamChunk>
  json?(req: JsonRequest): Promise<JsonResponse>
  jsonStream?(req: JsonRequest): AsyncIterable<JsonStreamChunk>
  close?(): Promise<void>
}

/** Alias entry used in harness model configuration. */
export interface ModelAlias {
  provider: ModelProvider
  model: string
  capabilities: readonly ModelCapability[]
  defaults?: ModelDefaults
  providerOptions?: Record<string, unknown>
}
