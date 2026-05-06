import type { JsonValue } from './types.js'

export class HarnessError extends Error {
  code: string
  category: string
  retriable: boolean
  meta?: Record<string, JsonValue>

  constructor(message: string, opts: { code: string; category: string; retriable: boolean; meta?: Record<string, JsonValue> }) {
    super(message)
    this.name = new.target.name
    this.code = opts.code
    this.category = opts.category
    this.retriable = opts.retriable
    this.meta = opts.meta
  }
}

export class HarnessConfigError extends HarnessError { constructor(message: string, meta?: Record<string, JsonValue>) { super(message, { code: 'HARNESS_CONFIG_ERROR', category: 'config', retriable: false, meta }) } }
export class ValidationError extends HarnessError { constructor(message: string, meta?: Record<string, JsonValue>) { super(message, { code: 'VALIDATION_ERROR', category: 'validation', retriable: false, meta }) } }
export class PermissionDeniedError extends HarnessError { constructor(message: string, meta?: Record<string, JsonValue>) { super(message, { code: 'PERMISSION_DENIED', category: 'permission', retriable: false, meta }) } }
export class SandboxError extends HarnessError { constructor(message: string, meta?: Record<string, JsonValue>) { super(message, { code: 'SANDBOX_ERROR', category: 'sandbox', retriable: false, meta }) } }
export class SandboxNoExecutorError extends HarnessError { constructor() { super('Sandbox executor unavailable', { code: 'SANDBOX_NO_EXECUTOR', category: 'sandbox', retriable: false }) } }
export class ModelError extends HarnessError { constructor(message: string, meta?: Record<string, JsonValue>) { super(message, { code: 'MODEL_ERROR', category: 'model', retriable: true, meta }) } }
export class ToolError extends HarnessError { constructor(message: string, meta?: Record<string, JsonValue>) { super(message, { code: 'TOOL_ERROR', category: 'tool', retriable: true, meta }) } }
export class ToolNotFoundError extends HarnessError { constructor(tool: string) { super(`Tool not found: ${tool}`, { code: 'TOOL_NOT_FOUND', category: 'tool', retriable: false, meta: { tool } }) } }
export class SkillManifestError extends HarnessError { constructor(message: string, meta?: Record<string, JsonValue>) { super(message, { code: 'SKILL_MANIFEST_ERROR', category: 'config', retriable: false, meta }) } }
export class AgentLoopBudgetError extends HarnessError { constructor() { super('Agent maxSteps exceeded', { code: 'AGENT_LOOP_BUDGET', category: 'agent', retriable: false, meta: { reason: 'iterations_exceeded' } }) } }
export class SessionBusyError extends HarnessError { constructor(reason: string = 'run_in_flight') { super('Session is busy', { code: 'SESSION_BUSY', category: 'session', retriable: true, meta: { reason } }) } }
export class OperationTimeoutError extends HarnessError { constructor(scope: string) { super('Operation timed out', { code: 'OPERATION_TIMEOUT', category: 'harness', retriable: true, meta: { scope } }) } }
export class OperationCancelledError extends HarnessError { constructor(scope: string) { super('Operation cancelled', { code: 'OPERATION_CANCELLED', category: 'harness', retriable: false, meta: { scope } }) } }
export class InternalError extends HarnessError { constructor(message: string, meta?: Record<string, JsonValue>) { super(message, { code: 'INTERNAL_ERROR', category: 'internal', retriable: false, meta }) } }

export function serializeError(error: unknown): { code: string; category: string; retriable: boolean; message: string; meta?: Record<string, JsonValue> } {
  if (error instanceof HarnessError) {
    return { code: error.code, category: error.category, retriable: error.retriable, message: error.message, meta: error.meta }
  }
  return { code: 'INTERNAL_ERROR', category: 'internal', retriable: false, message: error instanceof Error ? error.message : String(error) }
}
