import { stateStoreContract } from '../testing/stateStoreContract.js'
import { InMemoryStateStore } from '../state/in-memory.js'

stateStoreContract(() => new InMemoryStateStore())
