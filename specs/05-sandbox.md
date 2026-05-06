# Sandbox

The Sandbox port abstracts an isolated filesystem and shell execution backend. v1 ships an in-memory file system and a `just-bash`-backed bash emulator (https://github.com/vercel-labs/just-bash). Future adapters will provide Docker, microVM, and cloud-sandbox isolation behind the same port.

## Port interface

```ts
interface Sandbox {
  configureHarnessContext?(context: HarnessAdapterContext): void
  open(opts: { sessionId: string; runId: string; signal?: AbortSignal }): Promise<SandboxSession>
}

interface SandboxSession {
  // Filesystem (always available)
  read(path: string): Promise<Uint8Array>
  readText(path: string, encoding?: 'utf-8'): Promise<string>
  write(path: string, data: Uint8Array | string): Promise<void>
  remove(path: string, opts?: { recursive?: boolean }): Promise<void>
  list(path: string, opts?: { recursive?: boolean; glob?: string }): Promise<DirEntry[]>
  stat(path: string): Promise<FileStat>
  exists(path: string): Promise<boolean>
  mount(files: ReadonlyMap<string, Uint8Array | string>, atPath: string): Promise<void>

  // Execution (may not be available — see executor)
  readonly executor: 'available' | 'unavailable'
  exec(command: string, opts?: ExecOptions): Promise<ExecResult>

  close(): Promise<void>
}

interface ExecOptions {
  cwd?: string
  env?: Record<string, string>
  stdin?: string
  timeoutMs?: number
  signal?: AbortSignal
}
interface ExecResult { stdout: string; stderr: string; exitCode: number; durationSeconds: number }
interface DirEntry { name: string; path: string; kind: 'file' | 'directory'; size?: number }
interface FileStat { kind: 'file' | 'directory'; size: number; modifiedAt: string }
```

Sandbox adapters may implement `configureHarnessContext(...)` to inherit the
harness logger, telemetry shim, and defaults. Users configure these once on the
harness, not separately on every sandbox adapter.

## Locked behaviors

- **No capability enum.** The Sandbox port replaces the previous `SandboxCapability` enum entirely. Each backend (just-bash, Docker, microVM, cloud) declares its own policy internally; the harness trusts the backend.
- **Path semantics.** All paths are POSIX style, absolute (must start with `/`). Implementations validate and normalize. Relative paths throw `SandboxError{reason:'invalid_path'}`.
- **Reserved paths inside the sandbox** (locked, conventions enforced by the harness, not the backend):
  - `/skills/<id>/...` — skill mounts; read-only by convention.
  - `/memory/<key>.json` — session memory KV.
  - `/workspace/` — free model scratch; default `cwd` for `exec`.
- **Timeouts.** `exec` honors `opts.timeoutMs` (default `defaults.toolTimeoutMs`); on timeout throws `OperationTimeoutError{scope:'sandbox_run'}`.
- **`executor === 'unavailable'`.** Indicates this sandbox session has no shell executor (default fallback when `just-bash` peer dep is missing). Calling `exec` throws `SandboxNoExecutorError`. The built-in tool registry must check this and disable `bash` automatically; see [07-tools](./07-tools.md) §"Built-in tools".

## Default sandbox

The harness ships **two** default sandbox factories in core. Both are exported from `@purista/harness`.

1. `inMemorySandbox()` — files-only (`executor: 'unavailable'`). Pure TS, no peer deps. `read`/`write`/`list`/`stat`/`mount` work; `exec` throws `SandboxNoExecutorError`.
2. `bashSandbox(opts?)` — wraps the `just-bash` peer dep. Full bash emulator + in-memory POSIX FS. `executor: 'available'`. Optional `opts`:
   - `network?: { allow?: string[]; deny?: string[] }` — default deny all. Maps to just-bash network config.
   - `executionLimits?: { wallClockMs?: number; memoryMb?: number }` — passed through to just-bash.
   - `python?: false` (default) | `true` — enable just-bash python3 builtin if peer dep allows.

If `just-bash` is not installed and the user calls `bashSandbox()`, throw `HarnessConfigError{reason:'just_bash_not_installed'}` synchronously at construction time.

### Auto-detect

If the user calls `.sandbox()` with no argument or omits `.sandbox()` entirely, the harness auto-detects: tries `bashSandbox()` first, falls back to `inMemorySandbox()` on import failure. This auto-detect is locked in [02-harness-config](./02-harness-config.md) §`.sandbox(...)`.

## Adapters (future, not v1)

Future packages like `@purista/harness-sandbox-docker`, `@purista/harness-sandbox-e2b`, `@purista/harness-sandbox-microvm` will implement the same `Sandbox` port. Out of scope for v1.

## Cross-references

- [08-skills](./08-skills.md) — skill mount paths.
- [07-tools](./07-tools.md) — built-in tools layer over the Sandbox.
- [09-agents](./09-agents.md) — agent loop mounts skills at session start.
- [13-public-api](./13-public-api.md) — exported types.
