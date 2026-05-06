import { expect, it } from 'vitest'
import { createDurableWorkflowContext, DurableStepError, inMemoryDurableRuntime } from '../src/index.js'

async function createContext() {
  const runtime = inMemoryDurableRuntime()
  const lease = await runtime.startRun({
    runId: 'run-step',
    sessionId: 'session-step',
    workerId: 'worker-step',
    stepId: 'initial',
    input: { prompt: 'hello' }
  })
  return { runtime, lease, ctx: createDurableWorkflowContext(runtime, lease) }
}

it('checkpoints explicit durable steps', async () => {
  const { runtime, ctx } = await createContext()

  const output = await ctx.step('prepare-inputs', async () => ({ ok: true }))
  const checkpoint = await runtime.loadCheckpoint('run-step')

  expect(output).toEqual({ ok: true })
  expect(checkpoint?.stepId).toBe('prepare-inputs')
  expect(checkpoint?.output).toEqual({ ok: true })
})

it('rejects duplicate and invalid durable step ids', async () => {
  const { ctx } = await createContext()

  await ctx.step('once', async () => 'ok')
  await expect(ctx.step('once', async () => 'again')).rejects.toBeInstanceOf(DurableStepError)
  await expect(ctx.step('bad step id', async () => 'bad')).rejects.toBeInstanceOf(DurableStepError)
})

it('rejects non-serializable durable step output deterministically', async () => {
  const { ctx } = await createContext()
  const circular: Record<string, unknown> = {}
  circular.self = circular

  await expect(ctx.step('circular', async () => circular as never)).rejects.toBeInstanceOf(DurableStepError)
})
