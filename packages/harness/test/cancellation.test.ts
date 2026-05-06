import { z } from 'zod'
import { describe, expect, it } from 'vitest'

import { defineHarness, inMemorySandbox } from '../src/index.js'
import { OperationCancelledError, OperationTimeoutError } from '../src/errors/index.js'

describe('harness cancellation propagation', () => {
  it('propagates invoke aborts into model calls', async () => {
    const controller = new AbortController()
    const model = {
      id: 'fake',
      genAiSystem: 'fake',
      async json(req: { signal: AbortSignal }) {
        return new Promise((_resolve, reject) => {
          req.signal.addEventListener('abort', () => reject(req.signal.reason), { once: true })
        })
      }
    }
    const harness = defineHarness()
      .sandbox(inMemorySandbox())
      .models({ fast: { provider: model, model: 'fake', capabilities: ['json'] } })
      .tools({})
      .skills({})
      .agents({ a1: { model: 'fast', input: z.string(), output: z.string(), instructions: 'x', builtinTools: false } })
      .workflows({ wf: { input: z.string(), output: z.string(), handler: async (ctx) => ctx.agents.a1(ctx.input) } })
      .build()

    const session = await harness.getSession('s1')
    const promise = session.workflows.wf.prompt('x', { signal: controller.signal })
    controller.abort()
    await expect(promise).rejects.toBeInstanceOf(OperationCancelledError)
  })

  it('maps pre-aborted invoke signals to OperationCancelledError', async () => {
    const controller = new AbortController()
    controller.abort()
    const harness = defineHarness()
      .sandbox(inMemorySandbox())
      .models({ fake: { provider: { id: 'fake', genAiSystem: 'fake' }, model: 'fake', capabilities: [] } })
      .tools({})
      .skills({})
      .agents({})
      .workflows({ wf: { input: z.string(), output: z.string(), handler: async () => 'never' } })
      .build()

    const session = await harness.getSession('s1')
    await expect(session.workflows.wf.prompt('x', { signal: controller.signal })).rejects.toBeInstanceOf(OperationCancelledError)
  })

  it('enforces run timeout when workflow cooperates with the run signal', async () => {
    const harness = defineHarness()
      .defaults({ runTimeoutMs: 5 })
      .sandbox(inMemorySandbox())
      .models({ fake: { provider: { id: 'fake', genAiSystem: 'fake' }, model: 'fake', capabilities: [] } })
      .tools({})
      .skills({})
      .agents({})
      .workflows({
        wf: {
          input: z.string(),
          output: z.string(),
          handler: async (ctx) => {
            await new Promise((resolve) => setTimeout(resolve, 20))
            ctx.signal.throwIfAborted()
            return 'never'
          }
        }
      })
      .build()

    const session = await harness.getSession('s1')
    await expect(session.workflows.wf.prompt('x')).rejects.toBeInstanceOf(OperationTimeoutError)
  })
})
