# Living Wiki Jaeger Example

**Purpose.** Defines the complete implementation contract for
`examples/living-wiki-jaeger`: a runnable Hono + React/Vite example that shows
the full harness flow with OpenAI, typed tools, one local skill, typed agents,
typed workflows, sessions, SSE live observation, and Jaeger/OpenTelemetry
tracing.

The example is a local "living wiki" or memex application. It is an example of
the harness as lower-level enterprise agent infrastructure, not a hosted SaaS
product.

## Package

- Workspace path: `examples/living-wiki-jaeger`.
- Package name: `@purista/living-wiki-jaeger-example`.
- Package type: private ESM TypeScript package.
- Required scripts:
  - `dev` starts the API and web client together.
  - `dev:api` starts the Hono backend.
  - `dev:web` starts the Vite React client.
  - `build` builds the API and web client.
  - `typecheck` runs TypeScript without emitting files.
  - `test` runs unit and API/integration tests that do not call OpenAI.
  - `test:ui` runs browser/UI tests against the fake-provider mode.
  - `jaeger` starts Jaeger 2.17 in memory with Docker.

The example package MUST be included by the root `examples/*` workspace pattern
and MUST NOT require changes to root workspace discovery.

## Environment

The example reads environment variables from the repository-root `.env` file.
It MUST NOT read an example-local `.env` file.

Required for real OpenAI runs:

```env
OPENAI_API_KEY=
```

Defaults and optional configuration:

```env
OPENAI_MODEL=gpt-5-mini
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
```

Automated tests MUST use fake model providers and MUST NOT make OpenAI network
calls. Tests that need real OpenAI credentials are manual verification only and
MUST be skipped by default.

## Architecture

The backend is Hono. The frontend is React + Vite. The preferred local dev mode
is Vite serving the browser client and proxying `/api` and `/events` requests to
the Hono backend. If a single Hono + React stack is used, it MUST preserve the
same API, SSE, build, and test behavior.

Hono owns:

- harness creation
- OpenTelemetry setup
- workflow invocation
- run lookup and cancellation
- SSE live event streams
- file-backed source/wiki data access
- API input validation and error responses

React owns:

- the Obsidian-like app shell
- page/source viewing and editing
- workflow forms
- conversation and run-progress UI
- SSE subscription and reconnect state
- structured report rendering

The UI MUST use AI Elements for the conversation/run interaction surface, shadcn
components for layout and controls, and `json-renderer` for structured workflow
reports and generated panel specs.

## Data Model

All example data is local file data under `examples/living-wiki-jaeger/data`.

Required directories:

- `data/raw/sources`
- `data/wiki`

Required seed files:

- `data/wiki/index.md`
- `data/wiki/log.md`
- at least three concept pages under `data/wiki`
- at least three source markdown files under `data/raw/sources`

Slugs are lowercase URL-safe names matching:

```text
^[a-z0-9][a-z0-9-]{0,79}$
```

Every API and tool that accepts a slug MUST validate it before file access.
Resolved paths MUST stay inside the expected data directory after normalization.
Invalid slugs or escaped paths fail before reading or writing files.

Markdown page links use wiki-link syntax:

```text
[[page-slug]]
```

Backlink detection scans wiki markdown pages for that exact syntax.

## Harness Definition

The example MUST explicitly demonstrate this mental model in code:

```text
define -> harness -> agent -> workflow -> session -> invoke
```

The harness definition MUST include:

- `defineHarness`
- the OpenAI adapter from `@purista/harness-openai`
- typed tools with Zod input and output schemas
- one local skill mounted from `skills/wiki-curator`
- typed agents
- typed workflows
- session creation
- `prompt` execution
- live observation through SSE

The model registry MUST include alias `wiki_model`:

```ts
{
  provider: openai({ apiKey }),
  model: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
  capabilities: ['text', 'json', 'tool_use']
}
```

The default example config MUST keep telemetry privacy-safe. It MUST NOT set
`telemetry.captureContent` unless a developer explicitly edits the example for
diagnostics.

Logger and telemetry propagation MUST come from the harness context. Example
tools, sandbox/state usage, and providers MUST NOT require the user to pass
logger or telemetry objects into each adapter or tool manually.

## Tools

The example MUST define these typed tools. Each tool has a Zod input schema, a
Zod output schema, safe operational logging through the provided tool context,
and no direct OpenTelemetry setup of its own.

| Tool | Behavior |
|------|----------|
| `read_source` | Reads one source markdown file by slug from `data/raw/sources`. |
| `search_wiki` | Searches wiki page titles and content; returns ranked page refs and snippets. |
| `read_wiki_page` | Reads one wiki page by slug from `data/wiki`. |
| `write_wiki_page` | Creates or replaces one wiki page after slug/path validation. |
| `append_log` | Appends a timestamped operational entry to `data/wiki/log.md`. |
| `list_backlinks` | Lists wiki pages linking to a slug with `[[slug]]`. |
| `render_panel_spec` | Validates and returns a JSON-renderer-compatible panel spec. |

Tool outputs MUST be structured JSON. Tool errors MUST be safe to expose through
run events and API responses and MUST NOT include raw file content except where
the tool contract explicitly returns page/source content.

## Skill

The example MUST include `skills/wiki-curator/SKILL.md`.

The skill MUST instruct the agent to:

- keep pages compact and linked
- preserve source references
- separate claims from open questions
- avoid overwriting unrelated page content
- append meaningful updates to `log.md`
- prefer small page edits over large rewrites
- keep markdown output readable without custom extensions beyond wiki links

The skill is part of the example contract and MUST be mounted by the wiki agent.

## Agents

At minimum, define one typed agent, `wiki_curator`, using model alias
`wiki_model`, the `wiki-curator` skill, and the tools listed above.

The agent MUST have typed inputs and outputs for each workflow-facing use. It may
be implemented as one agent with workflow-specific schemas or as a small set of
focused agents, but all model calls MUST route through the harness model
registry and capability layer.

The agent loop MUST keep the default harness behavior: no custom planner, no
over-general orchestration, and no bypass of provider capability checks.

## Workflows

The example MUST implement these five typed workflows. Workflow handlers MUST
infer `ctx.input` without casts.

### `ingest_source`

Input:

```ts
{ sourceSlug: string }
```

Output:

```ts
{
  updatedPages: string[]
  extractedConcepts: string[]
  followUpQuestions: string[]
}
```

Behavior: reads the source, uses the agent and tools to extract concepts,
claims, links, and follow-up questions, writes or updates wiki pages, and appends
a log entry.

### `ask_wiki`

Input:

```ts
{ question: string }
```

Output:

```ts
{
  answer: string
  citedPages: string[]
  confidenceNotes: string[]
}
```

Behavior: searches and reads current wiki pages, answers the question in
markdown-safe text, and cites page slugs used for the answer.

### `lint_wiki`

Input:

```ts
{ scope?: 'all' | string[] }
```

Output:

```ts
{
  orphanPages: string[]
  missingBacklinks: Array<{ from: string; to: string }>
  weakClaims: Array<{ page: string; claim: string; reason: string }>
  staleNotes: Array<{ page: string; reason: string }>
  duplicateConcepts: Array<{ pages: string[]; reason: string }>
  panelSpec: unknown
}
```

Behavior: analyzes wiki pages and returns a structured report renderable through
`json-renderer`.

### `reconcile_contradiction`

Input:

```ts
{
  leftRef: string
  rightRef: string
  conflict: string
}
```

Output:

```ts
{
  summary: string
  changedPages: string[]
  unresolvedQuestions: string[]
}
```

Behavior: reads the conflicting refs, produces a reconciliation plan, updates
affected pages only through `write_wiki_page`, and appends a log entry.

### `generate_research_brief`

Input:

```ts
{
  pageSlugs: string[]
  goal: string
}
```

Output:

```ts
{
  markdown: string
  panelSpec: unknown
  citedPages: string[]
}
```

Behavior: generates a concise research brief from selected pages and returns a
JSON-renderer panel spec for the UI.

## API

Hono MUST expose these routes:

| Method | Route | Behavior |
|--------|-------|----------|
| `GET` | `/api/health` | Returns service status and current model name. |
| `GET` | `/api/pages` | Lists wiki pages with slug, title, and summary metadata. |
| `GET` | `/api/pages/:slug` | Returns one wiki page. |
| `PUT` | `/api/pages/:slug` | Replaces one wiki page after validation. |
| `GET` | `/api/sources` | Lists source markdown files. |
| `GET` | `/api/sources/:slug` | Returns one source markdown file. |
| `POST` | `/api/workflows/:workflowId` | Starts one typed workflow and returns `runId` plus initial status. |
| `GET` | `/api/runs/:runId` | Returns current run status, terminal result when available, and trace metadata when known. |
| `GET` | `/api/runs/:runId/events` | Streams sanitized live run events as SSE. |
| `POST` | `/api/runs/:runId/cancel` | Cancels an in-flight run. |

API errors MUST be JSON. Validation errors MUST identify the invalid field but
MUST NOT include confidential payload content.

## SSE

`GET /api/runs/:runId/events` is the primary live observation surface.

Required behavior:

- sends standard `text/event-stream` responses
- streams sanitized harness run events
- preserves delivered order for the subscribed run
- sends terminal status when available
- supports browser reconnect best-effort
- does not promise complete replay
- does not block workflow/model/tool execution on slow browser consumers
- treats persisted harness events as authoritative

The UI MUST handle these states:

- idle
- invoking workflow
- SSE connected
- SSE reconnecting
- completed
- failed
- cancelled
- overflow notice when emitted

## UI

The first screen MUST be the working application, not a landing page.

Required layout:

- Left sidebar: wiki tree, source list, workflow launcher.
- Center: markdown page/source viewer with edit mode for wiki pages.
- Right inspector: active run, SSE events, trace id/link, structured output,
  affected pages.
- Conversation panel: AI Elements messages, prompt input, tool-call/run
  progress display.

The UI MUST be dense, readable, and suited for repeated research work. It MUST
avoid marketing-page composition. Buttons and controls should use familiar icon
or shadcn patterns where available. Text MUST fit on mobile and desktop
viewports without overlapping adjacent UI.

## OpenTelemetry And Jaeger

The example MUST use standard OpenTelemetry packages. It MUST NOT implement a
custom tracing backend.

Required packages include:

- `@opentelemetry/sdk-node`
- an OTLP HTTP trace exporter
- `@opentelemetry/resources`
- `@opentelemetry/semantic-conventions`

The service name MUST be:

```text
purista-living-wiki-example
```

The default exporter endpoint is:

```text
http://localhost:4318/v1/traces
```

The `jaeger` npm script MUST wrap this exact command:

```bash
docker run --rm --name jaeger -p 16686:16686 -p 4317:4317 -p 4318:4318 -p 5778:5778 -p 9411:9411 cr.jaegertracing.io/jaegertracing/jaeger:2.17.0
```

Traces MUST show this flow when a workflow is invoked:

```text
Hono request -> session/invoke -> workflow -> agent -> model provider -> tools -> state/sandbox where used
```

The UI MUST expose a trace id or Jaeger link for the active run when trace
metadata is available. Missing Jaeger must not prevent local app usage.

## Documentation

The example MUST include `examples/living-wiki-jaeger/README.md` covering:

- setup
- root `.env` usage
- `OPENAI_API_KEY`
- default `gpt-5-mini` model
- Jaeger startup
- development commands
- all five workflows
- UI usage
- privacy-safe telemetry defaults
- fake-provider test behavior
- manual OpenAI verification

The root `.env.example` MUST include the OpenAI and OTel keys documented in this
spec.

The root docs or examples index MUST link to the example after it is
implemented.

## Tests

Required automated tests:

- slug and path traversal protection
- tool schemas and file IO behavior
- all five workflows using a fake model provider
- API workflow start, run lookup, SSE subscription, and cancellation
- UI happy path with fake backend/provider
- default tests prove no OpenAI network call is made

Required manual verification:

1. `npm run jaeger --workspace @purista/living-wiki-jaeger-example`
2. start the example with root `.env` containing `OPENAI_API_KEY`
3. run each workflow with OpenAI `gpt-5-mini`
4. confirm Jaeger shows request, workflow, agent, model, and tool spans

The repository gate remains:

```bash
npm run lint
npm run typecheck
npm run test:types
npm test
npm run test:contracts
npm run test:integration
npm run test:failure
npm run build
```

Generated build output MUST be removed after verification when it is not tracked.

## Non-goals

This example MUST NOT add:

- a database
- authentication
- multi-user sync
- MCP support in the original spec 18 baseline; executable MCP support is
  superseded by [19-living-wiki-intelligence-workspace](./19-living-wiki-intelligence-workspace.md).
- durable event replay beyond the harness persisted event behavior
- a new model provider adapter
- production deployment manifests
- telemetry content capture by default

## Cross-references

- [02-harness-config](./02-harness-config.md) — harness builder and defaults.
- [07-tools](./07-tools.md) — typed tool behavior.
- [08-skills](./08-skills.md) — skill loading and mounting.
- [09-agents](./09-agents.md) — default agent loop.
- [10-workflows](./10-workflows.md) — typed workflow handlers.
- [11-sessions](./11-sessions.md) — session invoke semantics.
- [12-streaming](./12-streaming.md) — bounded live observation and event privacy.
- [14-otel-conventions](./14-otel-conventions.md) — span and metric conventions.
