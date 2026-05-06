import { describe, expect, it } from 'vitest'

import { ulid } from './index.js'

describe('ulid', () => {
  it('returns monotonically sortable ids', () => {
    const a = ulid()
    const b = ulid()
    const c = ulid()
    expect(a < b && b < c).toBe(true)
  })
})
