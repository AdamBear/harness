import { z } from 'zod'
import { expect, it } from 'vitest'
import { defineHarness, inMemorySandbox, InMemoryStateStore, StateError, type FinishRunPatch, type PersistedRunEvent } from '../../src/index.js'
import type { RunRecord } from '../../src/models/state.js'

class CreateRunFailingStateStore extends InMemoryStateStore {
  public readonly appendedEvents: PersistedRunEvent[] = []
  public readonly finishRunCalls: Array<{ runId: string; patch: FinishRunPatch }> = []

  public override async createRun(_record: RunRecord): Promise<void> {
    throw new StateError('createRun failed', { op: 'createRun', reason: 'injected_failure' })
  }

  public override async appendEvents(runId: string, events: PersistedRunEvent[]): Promise<void> {
    this.appendedEvents.push(...events.map((event) => ({ ...event, runId })))
  }

  public override async finishRun(runId: string, patch: FinishRunPatch): Promise<void> {
    this.finishRunCalls.push({ runId, patch })
  }
}

it('does not emit or finish a run when createRun fails', async () => {
  const state = new CreateRunFailingStateStore()
  const harness = defineHarness()
    .state(state)
    .sandbox(inMemorySandbox())
    .models({
      fake: {
        provider: {
          id: 'fake',
          genAiSystem: 'fake',
          async json() {
            return { data: 'should not run', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }
          }
        },
        model: 'fake',
        capabilities: ['json']
      }
    })
    .agents({ assistant: { model: 'fake', instructions: 'Return text.', builtinTools: false } })
    .workflows({
      wf: {
        input: z.string(),
        output: z.string(),
        handler: async (ctx) => ctx.agents.assistant(ctx.input)
      }
    })
    .build()

  const session = await harness.getSession('s1')
  await expect(session.workflows.wf.prompt('hello')).rejects.toBeInstanceOf(StateError)
  expect(state.appendedEvents).toEqual([])
  expect(state.finishRunCalls).toEqual([])
})
