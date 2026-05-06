import type { Logger } from '../logger/index.js'
import type { TelemetryShim } from '../telemetry/index.js'

/** Harness-level context inherited by adapters registered with the harness. */
export interface HarnessAdapterContext {
  harnessName: string
  logger: Logger
  telemetry: TelemetryShim
  defaults: {
    agentMaxIterations: number
    runTimeoutMs: number
    toolTimeoutMs: number
    skillTimeoutMs: number
    modelTimeoutMs: number
    historyWindow?: number
  }
}

/** Optional structural hook implemented by adapter base classes. */
export interface HarnessContextConfigurable {
  configureHarnessContext(context: HarnessAdapterContext): void
}
