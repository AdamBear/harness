import { describe, expect, it } from 'vitest'

import {
  InternalError,
  McpAuthError,
  ModelCapabilityError,
  ModelError,
  HarnessConfigError,
  HarnessError,
  StateError,
  ToolError,
  isHarnessError
} from './index.js'

describe('HarnessError', () => {
  it('serializes with toJSON', () => {
    const err = new HarnessConfigError('bad config', { reason: 'bad' })
    expect(err.toJSON()).toMatchObject({
      name: 'HarnessConfigError',
      code: 'HARNESS_CONFIG_ERROR',
      category: 'config',
      retriable: false,
      message: 'bad config',
      meta: { reason: 'bad' }
    })
  })

  it('isHarnessError narrows catalog errors', () => {
    expect(isHarnessError(new InternalError('x'))).toBe(true)
    expect(isHarnessError(new Error('x'))).toBe(false)
  })

  it('computes dynamic retriable flags', () => {
    expect(new ModelError('429', { provider: 'p', model: 'm', method: 'text', status: 429 }).retriable).toBe(true)
    expect(new ModelError('400', { provider: 'p', model: 'm', method: 'text', status: 400 }).retriable).toBe(false)
    expect(new McpAuthError('500', { tool_id: 't', auth_kind: 'bearer', status: 500 }).retriable).toBe(true)
    expect(new McpAuthError('401', { tool_id: 't', auth_kind: 'bearer', status: 401 }).retriable).toBe(false)
  })

  it('propagates retriable through ToolError when cause is HarnessError', () => {
    const cause = new StateError('failed', { op: 'appendMessages' })
    const err = new ToolError('tool failed', { tool_id: 'x', tool_kind: 'ts' }, cause)
    expect(err.retriable).toBe(true)
  })

  it('is instanceof Error with code and category', () => {
    const err: HarnessError = new ModelCapabilityError('cap', { alias: 'a', method: 'text', reason: 'missing_capability' })
    expect(err).toBeInstanceOf(Error)
    expect(err.code).toBe('MODEL_CAPABILITY_ERROR')
  })
})
