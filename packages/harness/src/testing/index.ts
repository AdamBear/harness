import { defineHarness } from '../harness/defineHarness.js'

export { FakeModelProvider } from './fakeModelProvider.js'
export { sandboxContract } from './sandboxContract.js'
export { stateStoreContract } from './stateStoreContract.js'

/** Returns a fresh harness builder for tests. */
export function makeHarness() {
  return defineHarness()
}
