import { describe, expect, it } from 'vitest'

import {
  collectAdapterCapabilities,
  validateAdapterCapabilities,
  type AdapterCapabilities,
  type AdapterCapability
} from '../ports/capabilities.js'

/** Test adapter descriptor with a stable diagnostic id. */
export interface FakeCapabilityAdapter extends AdapterCapabilities {
  readonly id: string
}

/** Creates a fake adapter capability descriptor for tests. */
export function fakeCapabilityAdapter(
  capabilities: readonly AdapterCapability[],
  opts: { id?: string } = {}
): FakeCapabilityAdapter {
  return {
    id: opts.id ?? 'fake',
    capabilities
  }
}

/** Shared contract for adapters that expose harness capabilities. */
export function adapterCapabilitiesContract(make: () => AdapterCapabilities | Promise<AdapterCapabilities>): void {
  describe('adapterCapabilitiesContract', () => {
    it('declares a stable capability list', async () => {
      const adapter = await make()
      const capabilities = collectAdapterCapabilities([adapter])

      expect(capabilities).toEqual(adapter.capabilities)
      expect(validateAdapterCapabilities(adapter.capabilities, capabilities).ok).toBe(true)
    })
  })
}
