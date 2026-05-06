# Architecture

**Purpose.** Describes the layering, dependency direction, and package layout. Implementation agents must respect the dependency rules; violations are bugs.

## Layering

```
   ┌────────────────────────────────────────────┐
   │  User code (defineHarness().…build())      │
   └────────────────────────────────────────────┘
                       │
   ┌────────────────────────────────────────────┐
   │  Public API   (factories, types, errors)   │
   └────────────────────────────────────────────┘
                       │
   ┌────────────────────────────────────────────┐
   │  Orchestrators (Sessions, Runs, Loops)     │
   └────────────────────────────────────────────┘
        │           │            │           │
   ┌────────┐  ┌─────────┐  ┌──────────┐  ┌──────┐
   │ Agents │  │ Workflows│  │ Models   │  │ Tools│
   └────────┘  └─────────┘  └──────────┘  └──────┘
                       │
   ┌────────────────────────────────────────────┐
   │  Foundation ports (state, sandbox, model   │
   │  provider) + built-in logger + telemetry   │
   └────────────────────────────────────────────┘
                       │
   ┌────────────────────────────────────────────┐
   │  In-memory implementations (in-package)    │
   └────────────────────────────────────────────┘
```

Streaming is an internal concern of the harness; there is no separate `Stream` port and no separate stream package.

## Dependency direction

- Higher layers may import lower layers; the reverse is forbidden.
- All layers may import error types and the logger interface.
- Non-core packages follow the convention `@purista/harness-{addon}`. The harness is published independently from the wider PuristaJS framework so it can be consumed standalone or composed inside [PuristaJS](https://purista.dev).
- The provider package (`@purista/harness-openai`) MUST NOT depend on harness internals; it depends only on `@purista/harness` for port interfaces and types.
- Provider packages MUST NOT depend on each other (no provider-to-provider imports). v1 ships only one provider, but the rule is locked for forward compatibility.
- The harness package is the only package that may depend on `@modelcontextprotocol/sdk` (peer dep, scoped to the MCP tool runners).

## Package layout

```
packages/
  harness/                 # @purista/harness
    src/
      index.ts             # public surface (see 13-public-api.md)
      testing/index.ts     # exposed as @purista/harness/testing subpath export
    package.json           # exports map: "." and "./testing"
  harness-openai/          # @purista/harness-openai
    src/
      index.ts
    package.json
examples/
  quickstart/              # private, not published; minimal entry point
  ...                      # other spec-approved private examples
```

Exactly two published packages. Private example workspaces are allowed under
`examples/` when backed by specs. No `services/` or `apps/` package is part of
v1. Workspace tool is locked to npm workspaces.

The `harness` package contains:
- core harness (`defineHarness` chainable builder, `Harness`, `Session`)
- types and errors
- structured JSON logger (built-in, no external deps)
- OpenTelemetry deep integration (peer dep `@opentelemetry/api`)
- in-memory `StateStore` (default, only state implementation in v1)
- two default `Sandbox` factories: `inMemorySandbox()` (files-only) and `bashSandbox()` (wraps `just-bash` peer dep)
- built-in tools (bash, read, write, edit, glob, grep, list) operating on the sandbox
- custom TS tools
- MCP stdio + MCP http tools (peer dep `@modelcontextprotocol/sdk`)
- testing utilities (port contract test factories, fake provider, fake sandbox), exposed via the `./testing` subpath, never via the main entry

## Dependency table

| Package             | Harness deps             | Peer deps                                                                  |
|---------------------|--------------------------|----------------------------------------------------------------------------|
| `@purista/harness`        | (none beyond peer)       | `typescript@>=5.4`, `zod@^4`, `@opentelemetry/api@^1`, `@opentelemetry/semantic-conventions@^1`, `@modelcontextprotocol/sdk@^1` (optional, only required when MCP tools are used; `peerDependenciesMeta.optional = true`), `just-bash@^0` (optional, only required when `bashSandbox()` is used; `peerDependenciesMeta.optional = true`), `vitest@^2` (peer of `@purista/harness/testing`) |
| `@purista/harness-openai` | `@purista/harness`       | `typescript@>=5.4`, `openai@^4`                                            |

Dev deps for every package: `typescript@>=5.4`, `vitest@^2`, `@types/node`. No others.

Additional providers (Anthropic, etc.) are out of scope for v1.

## Module shape inside the harness package

```
src/
  index.ts              # public API barrel (see 13-public-api.md)
  testing/
    index.ts            # subpath @purista/harness/testing
  errors/               # error catalog (see 15-error-catalog.md)
  logger/               # Logger interface + default JSON logger
  telemetry/            # OTel shims, attribute keys, span/metric helpers
  ulid/                 # internal ULID utility
  ports/                # state, sandbox, model-provider
  state/in-memory/      # default StateStore impl
  sandbox/in-memory/    # inMemorySandbox() — files-only
  sandbox/bash/         # bashSandbox() — wraps just-bash peer dep
  models/               # alias registry, capability gate
  tools/builtin/        # bash, read, write, edit, glob, grep, list + alias dispatch
  tools/                # ts tool runner, tool registry, MCP stdio + http runners
  skills/               # SKILL.md frontmatter loader, mount-at-/skills/<name>
  sessions/             # session impl, run lifecycle, internal streaming generator
  agents/               # default loop, agent registry
  workflows/            # workflow registry
  harness/              # defineHarness, config schema, wiring
```

## Build & module format

- ESM only. `"type": "module"` in every package.
- Output: `dist/index.js` + `dist/index.d.ts`. `dist/testing/index.js` + `dist/testing/index.d.ts` for the testing subpath. No CJS dual build.
- Target: `ES2022`. `module: NodeNext`.
- No bundling; ship raw `.js` + `.d.ts` files.

## Cross-references

- [00-overview](./00-overview.md)
- [02-harness-config](./02-harness-config.md)
- [13-public-api](./13-public-api.md)
- [17-implementation-plan](./17-implementation-plan.md)
