import { expect, it } from 'vitest'
import { createInMemoryFeedbackRecorder } from '../src/testing/index.js'

it('records optional feedback against harness-native ids', () => {
  const feedback = createInMemoryFeedbackRecorder()
  const target = { kind: 'run' as const, runId: 'run_1' }

  const record = feedback.record({
    target,
    source: 'deterministic_rule',
    label: 'invariant_failed',
    score: 0,
    metadata: { rule: 'must_include_summary' }
  })

  expect(record.id).toBe('feedback_1')
  expect(feedback.list(target)).toEqual([record])
  expect(feedback.list()).toEqual([record])
})
