import { Check, GitPullRequestArrow, RotateCcw, X } from 'lucide-react'
import { useMemo, useState } from 'react'

type ReviewQuestion = {
  id: string
  label: string
  kind: 'single_choice' | 'multi_choice' | 'free_text' | 'approval'
  options?: Array<{ id: string; label: string; recommended?: boolean }>
  required: boolean
}

export type ReviewRequest = {
  id: string
  runId: string
  title: string
  reason: string
  questions: ReviewQuestion[]
  defaultDecision: 'approve' | 'revise' | 'reject'
}

export type ReviewDecisionPayload = {
  reviewRequestId: string
  decision: 'accept_all' | 'reject_all' | 'accept_selected' | 'choose_alternative' | 'custom_guidance'
  answers: Record<string, string | string[] | boolean>
  guidance?: string
}

export function isReviewRequest(value: unknown): value is ReviewRequest {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<ReviewRequest>
  return typeof record.id === 'string'
    && typeof record.runId === 'string'
    && typeof record.title === 'string'
    && typeof record.reason === 'string'
    && Array.isArray(record.questions)
}

export function ReviewRequestPanel(props: {
  request: ReviewRequest
  submitting?: boolean
  onSubmit: (decision: ReviewDecisionPayload) => void
  onAnswer?: (questionId: string, value: string | string[] | boolean) => void
}) {
  const defaults = useMemo(() => defaultAnswers(props.request.questions), [props.request.questions])
  const [answers, setAnswers] = useState<Record<string, string | string[] | boolean>>(defaults)
  const [guidance, setGuidance] = useState('')
  const [decision, setDecision] = useState<ReviewDecisionPayload['decision']>(() => {
    if (props.request.defaultDecision === 'reject') return 'reject_all'
    if (props.request.defaultDecision === 'revise') return 'custom_guidance'
    return 'accept_all'
  })

  return (
    <section className="review-card" aria-label="Human review request">
      <header>
        <span><GitPullRequestArrow size={15} /> {props.request.title}</span>
        <em>{props.request.defaultDecision}</em>
      </header>
      <p>{props.request.reason}</p>
      <div className="review-options">
        {props.request.questions.map((question) => (
          <ReviewQuestionControl
            key={question.id}
            question={question}
            value={answers[question.id]}
            setValue={(value, opts) => {
              setAnswers((current) => ({ ...current, [question.id]: value }))
              if (opts?.submit !== false) props.onAnswer?.(question.id, value)
            }}
          />
        ))}
      </div>
      <textarea value={guidance} onChange={(event) => setGuidance(event.target.value)} placeholder="Optional guidance for follow-up work..." />
      <div className="review-actions">
        <button type="button" onClick={() => setDecision('accept_all')} aria-pressed={decision === 'accept_all'}><Check size={14} /> Approve</button>
        <button type="button" onClick={() => setDecision('custom_guidance')} aria-pressed={decision === 'custom_guidance'}><RotateCcw size={14} /> Revise</button>
        <button type="button" onClick={() => setDecision('reject_all')} aria-pressed={decision === 'reject_all'}><X size={14} /> Reject</button>
        <button
          type="button"
          disabled={props.submitting}
          onClick={() => props.onSubmit({
            reviewRequestId: props.request.id,
            decision,
            answers,
            ...(guidance.trim() ? { guidance: guidance.trim() } : decision === 'custom_guidance' ? { guidance: 'Revision requested from review controls.' } : {})
          })}
        >
          Submit
        </button>
      </div>
    </section>
  )
}

function ReviewQuestionControl(props: {
  question: ReviewQuestion
  value: string | string[] | boolean | undefined
  setValue: (value: string | string[] | boolean, opts?: { submit?: boolean }) => void
}) {
  const question = props.question
  if (question.kind === 'free_text') {
    return (
      <label className="review-question">
        <span>{question.label}</span>
        <textarea
          value={typeof props.value === 'string' ? props.value : ''}
          onChange={(event) => props.setValue(event.target.value, { submit: false })}
          onBlur={(event) => props.setValue(event.target.value, { submit: true })}
        />
      </label>
    )
  }

  if (question.kind === 'approval') {
    return (
      <label className="review-check">
        <input type="checkbox" checked={Boolean(props.value)} onChange={(event) => props.setValue(event.target.checked)} />
        <span>{question.label}</span>
      </label>
    )
  }

  if (question.kind === 'multi_choice') {
    const values = Array.isArray(props.value) ? props.value : []
    return (
      <fieldset className="review-fieldset">
        <legend>{question.label}</legend>
        {(question.options ?? []).map((option) => (
          <label key={option.id}>
            <input
              type="checkbox"
              checked={values.includes(option.id)}
              onChange={(event) => props.setValue(event.target.checked ? [...values, option.id] : values.filter((value) => value !== option.id))}
            />
            <span>{option.label}{option.recommended ? ' (recommended)' : ''}</span>
          </label>
        ))}
      </fieldset>
    )
  }

  return (
    <fieldset className="review-fieldset">
      <legend>{question.label}</legend>
      {(question.options ?? []).map((option) => (
        <label key={option.id}>
          <input
            type="radio"
            name={question.id}
            checked={props.value === option.id}
            onChange={() => props.setValue(option.id)}
          />
          <span>{option.label}{option.recommended ? ' (recommended)' : ''}</span>
        </label>
      ))}
    </fieldset>
  )
}

function defaultAnswers(questions: ReviewQuestion[]) {
  const answers: Record<string, string | string[] | boolean> = {}
  for (const question of questions) {
    if (question.kind === 'approval') answers[question.id] = true
    else if (question.kind === 'multi_choice') answers[question.id] = question.options?.filter((option) => option.recommended).map((option) => option.id) ?? []
    else answers[question.id] = question.options?.find((option) => option.recommended)?.id ?? ''
  }
  return answers
}
