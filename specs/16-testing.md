# Testing

**Purpose.** Specifies the test framework, the port contract test suites every adapter must pass, coverage gates, and the fakes shipped under `@purista/harness/testing`.

## Framework

- Vitest `^2`. Node test environment (`environment: 'node'`).
- Coverage provider: `v8`. Reporters: `text`, `lcov`, `json-summary`.
- Each package has `vitest.config.ts` extending a shared base config available under `@purista/harness/testing` (re-exported from the testing subpath).

## Coverage gates (CI-enforced)

| Package              | Statements | Branches | Functions | Lines |
|----------------------|------------|----------|-----------|-------|
| `@purista/harness`   | ≥85%       | ≥80%     | ≥85%      | ≥85%  |
| `@purista/harness-openai` | ≥80%  | ≥75%     | ≥80%      | ≥80%  |

CI fails if any gate is unmet.

## `@purista/harness/testing` exports

```ts
// Fakes
export class FakeModelProvider implements ModelProvider     // configurable scripted responses
export class FakeStateStore extends InMemoryStateStore       // exposes inspection helpers
export class FakeSandbox implements Sandbox                  // deterministic FS+exec; configurable executor flag
export class FakeLogger implements Logger                    // captures log records in memory

// Contract suites — each is a Vitest test factory
export function stateStoreContract(make: () => StateStore | Promise<StateStore>): void
export function sandboxContract(
  make: () => Sandbox | Promise<Sandbox>,
  opts: { executor: 'available' | 'unavailable' }
): void
export function modelProviderContract(
  make: () => ModelProvider,
  opts: { capabilities: ModelCapability[] }
): void
export function loggerContract(make: () => Logger): void

// Helpers
export function makeHarness(): HarnessBuilder<{}>            // alias for defineHarness(); returns a fresh builder
export function recordEvents(iter: AsyncIterable<RunEvent>): Promise<RunEvent[]>
```

There is no `streamContract` — streaming is internal to the harness; see "Streaming generator" in the core test catalog below.

## Port contract test catalogs

Each contract suite calls `make()` per test for isolation. Required tests:

### StateStore

1. `getSession` returns undefined for unknown id.
2. `upsertSession` then `getSession` returns the record.
3. `appendMessages` is order-preserving across calls.
4. `listMessages` honors `limit`, `before` (exclusive).
5. `appendMessages` is atomic — partial writes not observable on concurrent reads.
6. `clearMessages` removes every message for the session and is atomic.
7. `createRun` then `getRun` returns the record.
8. `finishRun` updates only the listed fields.
9. `listRuns` returns runs for a session ordered by `startedAt` descending then `id` descending; `listMessages` returns ascending by `(timestamp, id)`.
10. `appendEvents` and `listEvents` round-trip; `after` cursor is exclusive.
11. Backend failure surfaces as `StateError`.

### Sandbox

1. `open()` returns a `SandboxSession` whose `executor` matches the contract option.
2. `read`/`write`/`list`/`stat`/`exists`/`remove` round-trip a file at an absolute POSIX path.
3. `mount(files, '/skills/foo')` makes every entry visible under `/skills/foo/`.
4. Relative paths throw `SandboxError{reason:'invalid_path'}`.
5. When `executor === 'available'`: `exec('echo hi')` returns `{stdout:'hi\n', exitCode:0}`; `timeoutMs` honored; `signal` honored.
6. When `executor === 'unavailable'`: `exec(...)` throws `SandboxNoExecutorError`.

### ModelProvider

1. Each claimed method exists on the provider.
2. `text`/`json` honor `signal`.
3. `tools[]` round-trips into `toolCalls` on response when a scripted tool-use case is configured (FakeModelProvider provides scripted mode).
4. `usage` is populated.
5. Provider maps a "context length exceeded" response to `ModelError{meta.reason:'context_length_exceeded'}`.

### Logger

1. Each level method emits a record at that level.
2. `child(bindings)` merges bindings; child-scope shadows parent.
3. `time` is RFC3339.

## Core test catalog (non-port)

The harness package additionally has integration tests:

- `defineHarness` builder validation: every `HarnessConfigError` path, thrown synchronously by the originating builder method.
- Built-in tools: `bash`/`read`/`write`/`edit`/`glob`/`grep`/`list` round-trip against a sandbox; alias dispatch (PascalCase → canonical) verified; `bash` auto-disabled when `executor === 'unavailable'`; `grep` falls back to read+match.
- Permissions: `'allow'` proceeds; `'deny'` produces a `PERMISSION_DENIED` tool result message and run continues; `'ask'` invokes the hook; hook failure denies and increments `harness.permission.denials`; read-only built-ins cannot be denied.
- Builder ordering: out-of-order or repeated calls (`.tools()` before `.models()`, two `.agents()` calls, `.build()` without models) fail at the type level (verified via `tsd` or equivalent type tests).
- Default agent loop: tool-use round trip, iteration cap triggers `AgentLoopBudgetError`, output validation, abort propagation.
- MCP tools: fake stdio and HTTP MCP servers cover `tools/list`, `tools/call`, auth failure, schema validation failure, malformed response, process death, timeout, cancellation, SDK dynamic import behavior, and shutdown cleanup.
- Workflow: parallel agent calls, abort propagates to all.
- Session: serial concurrency rule throws `SessionBusyError` synchronously on overlap; `clearHistory` / `replaceHistory` reject with `SessionBusyError` when a run is in flight; `replaceHistory` validation failure throws `ValidationError{where:'session_history'}`.
- `SessionMemory` round-trip: `write('foo', value)` then `read('foo')` returns the value; `list()` returns the keys; non-serializable value throws `ValidationError{where:'memory_value'}`; the model can read the same `/memory/foo.json` file via the built-in `read` tool.
- History window: `historyWindow=undefined` passes all messages; `historyWindow=0` keeps only system messages; `historyWindow=N` keeps the most recent `N` non-system messages plus all system messages.
- Streaming generator (replaces the deleted Stream contract suite):
  1. `stream()` yields `run.started` first and `run.finished` last.
  2. Slow consumers do not pace the producer; bounded queues emit sanitized overflow notifications when non-terminal live events are dropped.
  3. Events emitted before consumer attaches are not replayed.
  4. Consumer `take()` throwing logs `STREAM_SUBSCRIBER_FAILED` and removes the subscription; the run continues.
  5. Per-run total ordering matches the rules in [12-streaming](./12-streaming.md).
  6. Persistence: every emitted event is written to `state.appendEvents`; `appendEvents` failure increments `harness.events.persist_errors` without failing the run.
- Public API surface: actual exports of `@purista/harness` (main entry) and `@purista/harness/testing` match [13-public-api](./13-public-api.md) symbol lists.
- Error catalog: every class is exported; every `code`/`category`/`retriable` matches [15-error-catalog](./15-error-catalog.md).
- OTel: every span name and metric in [14-otel-conventions](./14-otel-conventions.md) is emitted at least once across the integration tests; verified via an in-memory tracer/meter.

## Fixtures

- A small skill fixture lives at `packages/harness/src/testing/fixtures/skills/example-skill/SKILL.md` (with a couple of supporting files under `scripts/`).
- MCP fixtures live under `packages/harness/src/testing/fixtures/mcp/**` and must run without external network, credentials, or real draw.io services. Real MCP integration tests are opt-in only and skipped unless their documented environment variables are present.
- Used by the agents and sandbox contract suites to verify mount-at-`/skills/<name>/` behavior and frontmatter parsing.

## Cross-references

- [04-state-queue-stream](./04-state-queue-stream.md), [05-sandbox](./05-sandbox.md), [06-models](./06-models.md).
- [12-streaming](./12-streaming.md), [13-public-api](./13-public-api.md), [14-otel-conventions](./14-otel-conventions.md), [15-error-catalog](./15-error-catalog.md).
- [17-implementation-plan](./17-implementation-plan.md).
