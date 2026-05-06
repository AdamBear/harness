/**
 * Canonical JSON value type used across harness ports and persistence models.
 */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }
