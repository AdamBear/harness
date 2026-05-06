import type { JsonValue } from '../models/json.js'
import type { DurableRunLease, DurableRuntime, RunCheckpoint } from './durable.js'

const STEP_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/

/** Durable workflow context that exposes explicit checkpoint boundaries. */
export interface DurableWorkflowContext {
  /** Current durable run lease. */
  readonly lease: DurableRunLease
  /**
   * Runs a JSON-serializable durable step and commits its output as a checkpoint.
   *
   * @example
   * ```ts
   * const prepared = await ctx.step('prepare-inputs', async () => ({ ok: true }))
   * ```
   */
  step<T extends JsonValue>(stepId: string, fn: () => Promise<T>): Promise<T>
}

/** Error thrown when a durable step id is invalid or duplicated. */
export class DurableStepError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = 'DurableStepError'
  }
}

/** Creates a durable workflow context bound to an acquired runtime lease. */
export function createDurableWorkflowContext(runtime: DurableRuntime, lease: DurableRunLease): DurableWorkflowContext {
  const completed = new Set<string>()

  return {
    lease,
    async step<T extends JsonValue>(stepId: string, fn: () => Promise<T>): Promise<T> {
      validateStepId(stepId)
      if (completed.has(stepId)) {
        throw new DurableStepError(`Duplicate durable step id "${stepId}".`)
      }
      completed.add(stepId)

      const output = await fn()
      assertJsonSerializable(output, stepId)
      const sequence = (lease.checkpoint?.sequence ?? 0) + completed.size
      const checkpoint: RunCheckpoint = {
        runId: lease.runId,
        sessionId: lease.sessionId,
        leaseId: lease.leaseId,
        workerId: lease.workerId,
        stepId,
        input: lease.start.input,
        attempt: lease.attempt,
        sequence,
        output
      }
      await runtime.commitCheckpoint(checkpoint)
      return output
    }
  }
}

function validateStepId(stepId: string): void {
  if (!STEP_ID_PATTERN.test(stepId)) {
    throw new DurableStepError(`Invalid durable step id "${stepId}".`)
  }
}

function assertJsonSerializable(value: JsonValue, stepId: string): void {
  try {
    JSON.stringify(value)
  } catch (error) {
    throw new DurableStepError(`Durable step "${stepId}" returned a non-serializable value.`)
  }
}
