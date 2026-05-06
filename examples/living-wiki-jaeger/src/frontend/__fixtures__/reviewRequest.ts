import type { ReviewRequest } from '../components/review/ReviewRequestPanel.js'

export const reviewRequestFixture: ReviewRequest = {
  id: 'review_fixture_1',
  runId: 'run_fake_1',
  title: 'Review generated wiki changes',
  reason: 'The workflow proposed edits that need human approval before publishing.',
  defaultDecision: 'revise',
  questions: [
    {
      id: 'publish',
      label: 'Publish the proposed wiki changes?',
      kind: 'single_choice',
      required: true,
      options: [
        { id: 'publish', label: 'Publish changes', recommended: true },
        { id: 'revise', label: 'Revise first' },
        { id: 'reject', label: 'Reject changes' }
      ]
    },
    {
      id: 'guidance',
      label: 'Revision guidance',
      kind: 'free_text',
      required: false
    }
  ]
}
