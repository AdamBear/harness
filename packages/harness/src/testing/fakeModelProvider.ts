import type {
  EmbeddingRequest,
  EmbeddingResponse,
  ModelProvider,
  ObjectRequest,
  ObjectResponse,
  ObjectStreamChunk,
  RerankRequest,
  RerankResponse,
  TextRequest,
  TextResponse,
  TextStreamChunk
} from '../ports/model-provider.js'
import type { JsonValue } from '../models/json.js'

type ScriptedResponse =
  | { method: 'text'; response: TextResponse }
  | { method: 'object'; response: ObjectResponse }
  | { method: 'embed'; response: EmbeddingResponse }
  | { method: 'rerank'; response: RerankResponse }

/** Deterministic model provider for harness tests and examples. */
export class FakeModelProvider implements ModelProvider {
  private queue: ScriptedResponse[] = []
  private textStreamQueue: TextStreamChunk[][] = []
  private objectStreamQueue: ObjectStreamChunk[][] = []

  public readonly requests: Array<TextRequest | ObjectRequest | EmbeddingRequest | RerankRequest> = []
  public readonly id = 'fake'
  public readonly genAiSystem = 'fake'

  enqueueObject(response: ObjectResponse): void { this.queue.push({ method: 'object', response }) }
  enqueueText(response: TextResponse): void { this.queue.push({ method: 'text', response }) }
  enqueueEmbedding(response: EmbeddingResponse): void { this.queue.push({ method: 'embed', response }) }
  enqueueRerank(response: RerankResponse): void { this.queue.push({ method: 'rerank', response }) }
  enqueueTextStream(chunks: TextStreamChunk[]): void { this.textStreamQueue.push(chunks) }
  enqueueObjectStream(chunks: ObjectStreamChunk[]): void { this.objectStreamQueue.push(chunks) }

  /** Backward-compatible helper for older tests during the object migration. */
  enqueue(response: ObjectResponse): void { this.enqueueObject(response) }

  async text(req: TextRequest): Promise<TextResponse> {
    this.requests.push(req)
    const next = this.queue.shift()
    if (next?.method === 'text') return next.response
    if (next) this.queue.unshift(next)
    return { content: '', usage: emptyUsage(), toolCalls: [], finishReason: 'stop' }
  }

  async *textStream(req: TextRequest): AsyncIterable<TextStreamChunk> {
    this.requests.push(req)
    for (const chunk of this.textStreamQueue.shift() ?? [{ kind: 'finish', usage: emptyUsage(), finishReason: 'stop' }]) {
      yield chunk
    }
  }

  async object<T extends JsonValue = JsonValue>(req: ObjectRequest<T>): Promise<ObjectResponse<T>> {
    this.requests.push(req)
    const next = this.queue.shift()
    if (next?.method === 'object') return next.response as ObjectResponse<T>
    if (next) this.queue.unshift(next)
    return { object: '' as T, usage: emptyUsage(), toolCalls: [], finishReason: 'stop' }
  }

  async *objectStream<T extends JsonValue = JsonValue>(req: ObjectRequest<T>): AsyncIterable<ObjectStreamChunk<T>> {
    this.requests.push(req)
    for (const chunk of this.objectStreamQueue.shift() ?? [{ kind: 'finish', object: '' as T, usage: emptyUsage(), finishReason: 'stop' }]) {
      yield chunk as ObjectStreamChunk<T>
    }
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResponse> {
    this.requests.push(req)
    const next = this.queue.shift()
    if (next?.method === 'embed') return next.response
    if (next) this.queue.unshift(next)
    const inputCount = Array.isArray(req.input) ? req.input.length : 1
    return {
      embeddings: Array.from({ length: inputCount }, (_, index) => ({ index, vector: [0] })),
      usage: emptyUsage()
    }
  }

  async rerank(req: RerankRequest): Promise<RerankResponse> {
    this.requests.push(req)
    const next = this.queue.shift()
    if (next?.method === 'rerank') return next.response
    if (next) this.queue.unshift(next)
    return {
      results: req.documents.map((document, index) => ({
        id: document.id,
        index,
        score: req.documents.length - index,
        ...(document.metadata ? { metadata: document.metadata } : {})
      })).slice(0, req.topN ?? req.documents.length)
    }
  }
}

function emptyUsage(): { inputTokens: number; outputTokens: number; totalTokens: number } {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
}
