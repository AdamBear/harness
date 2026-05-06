import type { JsonRequest, JsonResponse, ModelProvider } from '../ports/model-provider.js'

export class FakeModelProvider implements ModelProvider {
  private queue: JsonResponse[] = []
  public requests: JsonRequest[] = []

  public readonly id = 'fake'
  public readonly genAiSystem = 'fake'

  enqueue(response: JsonResponse): void { this.queue.push(response) }

  async json(req: JsonRequest): Promise<JsonResponse> {
    this.requests.push(req)
    const next = this.queue.shift()
    if (!next) {
      return { data: '', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, toolCalls: [], finishReason: 'stop' }
    }
    return next
  }
}
