import { z } from 'zod'
import { defineHarness } from '../src/harness/defineHarness.js'
import type { ModelProvider } from '../src/ports/model-provider.js'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Expect<T extends true> = T
type IsAny<T> = 0 extends 1 & T ? true : false

const provider: ModelProvider = {
  id: 'type-test-provider',
  genAiSystem: 'type-test',
  async json() {
    return {
      data: 'ok',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      finishReason: 'stop'
    }
  }
}

const harness = defineHarness()
  .models({
    assistant: { provider, model: 'type-test-model', capabilities: ['json'] }
  })
  .agents(({ agent }) => ({
    planner: agent({
      model: 'assistant',
      input: z.object({ task: z.string(), priority: z.number() }),
      output: z.object({ plan: z.string(), accepted: z.boolean() }),
      instructions: (ctx) => {
        type Input = typeof ctx.input
        const _inputIsNotAny: IsAny<Input> extends true ? 'any' : 'ok' = 'ok'
        const _inputExact: Expect<Equal<Input, { task: string; priority: number }>> = true
        return `Plan ${ctx.input.task} at priority ${ctx.input.priority}.`
      },
      handler: async (ctx) => {
        type Input = typeof ctx.input
        const _inputIsNotAny: IsAny<Input> extends true ? 'any' : 'ok' = 'ok'
        const _inputExact: Expect<Equal<Input, { task: string; priority: number }>> = true
        return { plan: ctx.input.task, accepted: ctx.input.priority > 0 }
      }
    })
  }))
  .workflows(({ workflow }) => ({
    prepare: workflow({
      input: z.object({ task: z.string() }),
      output: z.object({ plan: z.string(), accepted: z.boolean() }),
      handler: async (ctx) => {
        type Input = typeof ctx.input
        const _inputIsNotAny: IsAny<Input> extends true ? 'any' : 'ok' = 'ok'
        const _inputExact: Expect<Equal<Input, { task: string }>> = true

        const plan = await ctx.agents.planner({ task: ctx.input.task, priority: 1 })
        type PlanOutput = typeof plan
        const _agentOutputExact: Expect<Equal<PlanOutput, { plan: string; accepted: boolean }>> = true

        return plan
      }
    }),
    invalid_output: workflow({
      input: z.object({ task: z.string() }),
      output: z.object({ plan: z.string(), accepted: z.boolean() }),
      // @ts-expect-error workflow handlers must return the sibling output schema type
      handler: async (ctx) => ctx.input.task
    })
  }))
  .build()

type PrepareInput = typeof harness.$infer.workflows.prepare.input
type PrepareOutput = typeof harness.$infer.workflows.prepare.output
type PlannerInput = typeof harness.$infer.agents.planner.input
type PlannerOutput = typeof harness.$infer.agents.planner.output

const _workflowInputExact: Expect<Equal<PrepareInput, { task: string }>> = true
const _workflowOutputExact: Expect<Equal<PrepareOutput, { plan: string; accepted: boolean }>> = true
const _agentInputExact: Expect<Equal<PlannerInput, { task: string; priority: number }>> = true
const _agentOutputExact: Expect<Equal<PlannerOutput, { plan: string; accepted: boolean }>> = true

async function invokeWorkflow() {
  const session = await harness.getSession('type-test')
  const agentOutput = await session.agents.planner.prompt({ task: 'ship typing', priority: 1 })
  const _agentInvokeOutputExact: Expect<Equal<typeof agentOutput, { plan: string; accepted: boolean }>> = true

  // @ts-expect-error agent prompt input must match the sibling input schema
  await session.agents.planner.prompt({ task: 'missing priority' })

  const output = await session.workflows.prepare.prompt({ task: 'ship typing' })
  const _outputExact: Expect<Equal<typeof output, { plan: string; accepted: boolean }>> = true

  // @ts-expect-error workflow prompt input must match the sibling input schema
  await session.workflows.prepare.prompt({ topic: 'wrong key' })
}
