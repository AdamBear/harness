import type { FeedbackRecord, FeedbackTarget } from '../ports/feedback.js'

/** Minimal in-memory feedback recorder for tests and examples. */
export function createInMemoryFeedbackRecorder() {
  const records: FeedbackRecord[] = []

  return {
    record(input: Omit<FeedbackRecord, 'id' | 'createdAt'> & { id?: string; createdAt?: string }): FeedbackRecord {
      const record: FeedbackRecord = {
        ...input,
        id: input.id ?? `feedback_${records.length + 1}`,
        createdAt: input.createdAt ?? new Date().toISOString()
      }
      records.push(record)
      return record
    },
    list(target?: FeedbackTarget): readonly FeedbackRecord[] {
      if (!target) {
        return [...records]
      }
      return records.filter((record) => JSON.stringify(record.target) === JSON.stringify(target))
    },
    clear(): void {
      records.splice(0, records.length)
    }
  }
}
