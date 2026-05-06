import type { JsonValue } from '../models/json.js'

/** Harness-native target that optional feedback can attach to. */
export type FeedbackTarget =
  | { kind: 'run'; runId: string }
  | { kind: 'message'; sessionId: string; messageId: string }
  | { kind: 'tool_call'; runId: string; callId: string }
  | { kind: 'agent_invocation'; runId: string; agentId: string }

/** Optional feedback signal associated with a harness-native target. */
export interface FeedbackRecord {
  id: string
  target: FeedbackTarget
  source: 'user' | 'application' | 'deterministic_rule' | 'evaluator' | 'human_review'
  label: string
  score?: number
  comment?: string
  metadata?: Record<string, JsonValue>
  createdAt: string
}
