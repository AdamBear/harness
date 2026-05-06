import { describe, expect, it } from 'vitest'
import type { JsonResponse, ModelProvider } from '@purista/harness'
import { createQuickstartHarness } from './index.js'

class ExampleProvider implements ModelProvider {
  readonly id = 'example'
  readonly genAiSystem = 'example'

  async json(): Promise<JsonResponse> {
    return {
      data: { answer: 'A harness wires providers, agents, workflows, and sessions behind typed boundaries.' },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: 'stop'
    }
  }
}

describe('quickstart', () => {
  it('runs the typed quickstart workflow with an injected provider', async () => {
    const harness = createQuickstartHarness(new ExampleProvider())
    const session = await harness.getSession('quickstart-test')

    const output = await session.workflows.explain_quickstart.prompt({ topic: 'harnesses' })

    expect(output.answer).toContain('typed boundaries')
    await harness.shutdown()
  })
})
