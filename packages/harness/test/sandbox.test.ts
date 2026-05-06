import { describe } from 'vitest'
import { bashSandbox, inMemorySandbox } from '../src/sandbox/index.js'
import { sandboxContract } from '../src/testing/sandboxContract.js'

describe('inMemorySandbox', () => {
  sandboxContract(() => inMemorySandbox(), { executor: 'unavailable' })
})

describe('bashSandbox', () => {
  sandboxContract(() => bashSandbox(), { executor: 'available' })
})
