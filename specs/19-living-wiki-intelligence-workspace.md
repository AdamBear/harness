# Living Wiki Intelligence Workspace And MCP Refactor

**Purpose.** Defines the implementation contract for turning
`examples/living-wiki-jaeger` from a feature demo into a practical research
intelligence workspace. The refactor must demonstrate direct agents, optional
workflows, skills, MCP tools, human-in-the-loop review, rich artifacts,
structured reports, visual knowledge maps, SSE observation, and Jaeger tracing
as one coherent application.

This spec supersedes the `MCP support` non-goal in
[18-living-wiki-jaeger-example](./18-living-wiki-jaeger-example.md) for this
refactor wave. Existing requirements from spec 18 remain in force unless this
document explicitly changes them.

## Current MCP Status

MCP stdio and streamable HTTP tools are canonical executable harness tools in
this refactor. The runtime owns process/request lifecycle, schema validation,
error mapping, tracing, logging, cancellation, and shutdown.

Current repository state:

- public MCP tool config shapes exist for `mcp_stdio` and `mcp_http`;
- `McpProtocolError` and `McpAuthError` map MCP-specific failures;
- TypeScript tools and MCP tools share the same harness tool execution surface;
- draw.io workflows can use a configured MCP server or fall back to local
  artifact generation.

## Product Direction

The example becomes a local research intelligence workspace:

```text
upload sources -> ingest claims -> review proposed edits -> update wiki ->
ask direct agent questions -> run research workflows -> generate visual artifacts
```

The application must feel like a real tool for maintaining and reasoning over a
linked knowledge base, not a gallery of isolated framework features.

## Repository Boundaries

The refactor keeps a clear frontend/backend/runtime split.

Required ownership:

| Area | Files | Owns |
|---|---|---|
| Harness MCP runtime | `packages/harness/src/tools/mcp/**`, `packages/harness/src/agents/**`, `packages/harness/src/sessions/**` | executable MCP transports, schema validation, lifecycle, telemetry, model tool exposure |
| Example backend | `examples/living-wiki-jaeger/src/backend/**` | Express API, local file data, workflow definitions, direct agent routes, artifact storage, example tools |
| Example frontend | `examples/living-wiki-jaeger/src/frontend/**` | React UI, AI Elements chat, markdown/Mermaid rendering, graph, drawers, review forms |
| Example skills | `examples/living-wiki-jaeger/skills/**` | skill manifests and instruction content used by agents |
| Docs | `docs/**`, `examples/living-wiki-jaeger/README.md` | usage, operations, scenarios, MCP setup, migration guide |

No frontend file may import from `src/backend/**`. Shared API shapes used by
frontend and backend must live in `src/backend/schemas.ts` only if they are
server-owned and emitted through HTTP; otherwise add a dedicated
`src/shared/**` folder before implementation starts.

## Workflow Model

The example must include three flagship workflows. They share a common
`plan -> reason -> reflect -> judge` orchestration pattern so implementation
agents can build reusable workflow helpers and UI rendering primitives.

### Common Workflow Phases

All flagship workflows emit phase metadata with this shape:

```ts
type WorkflowPhase = 'plan' | 'retrieve' | 'reason' | 'reflect' | 'judge' | 'human_review' | 'publish'

interface WorkflowPhaseStatus {
  phase: WorkflowPhase
  status: 'pending' | 'running' | 'completed' | 'blocked' | 'failed'
  agentId?: string
  summary?: string
  startedAt?: string
  finishedAt?: string
}
```

The UI renders phases in the run inspector drawer and may summarize them in the
chat tool section. It must not render every phase as a separate assistant
message.

### Shared Output Contracts

```ts
interface EvidenceItem {
  id: string
  title: string
  sourceType: 'wiki_page' | 'uploaded_source' | 'artifact' | 'mcp_result'
  reference: string
  quoteOrSummary: string
  confidence: 'low' | 'medium' | 'high'
}

interface ReviewRequest {
  id: string
  runId: string
  title: string
  reason: string
  questions: ReviewQuestion[]
  defaultDecision: 'approve' | 'revise' | 'reject'
}

interface ReviewQuestion {
  id: string
  label: string
  kind: 'single_choice' | 'multi_choice' | 'free_text' | 'approval'
  options?: Array<{ id: string; label: string; recommended?: boolean }>
  required: boolean
}

interface ReviewDecision {
  reviewRequestId: string
  decision: 'accept_all' | 'reject_all' | 'accept_selected' | 'choose_alternative' | 'custom_guidance'
  answers: Record<string, string | string[] | boolean>
  acceptedChangeIds?: string[]
  selectedAlternativeIds?: string[]
  guidance?: string
}

interface JudgeRubric {
  score: number
  maxScore: number
  verdict: 'approved' | 'needs_human_review' | 'revise' | 'rejected'
  criteria: Array<{
    id: string
    label: string
    score: number
    maxScore: number
    rationale: string
  }>
}

interface ResearchArtifact {
  id: string
  kind: 'markdown' | 'mermaid' | 'svg' | 'drawio_xml' | 'json_panel'
  title: string
  mimeType: string
  contentRef: string
  createdAt: string
  generatedByRunId: string
}
```

The `ReviewRequest`, `ReviewDecision`, `JudgeRubric`, and `ResearchArtifact`
contracts must be represented as Zod schemas in the example backend before the
frontend depends on them.

## Contract Changes

### Direct Agent Invocation

This spec amends [11-sessions](./11-sessions.md) for the refactor wave.

The session facade must expose direct agent invocation in addition to workflows:

```ts
interface Session<S> {
  readonly agents: { readonly [K in keyof S['agents']]: AgentInvoker<S, K> }
  readonly workflows: { readonly [K in keyof S['workflows']]: WorkflowInvoker<S, K> }
}

interface AgentInvoker<S, K extends keyof S['agents']> {
  prompt(input: AgentInput<S, K>, opts?: InvokeOptions): Promise<AgentOutput<S, K>>
  stream(input: AgentInput<S, K>, opts?: InvokeOptions): AsyncIterable<RunEvent>
}
```

Direct agent runs use the same per-session serial lock, timeout handling,
history window, state persistence, message persistence, and SSE event contract
as workflow runs.

Differences:

- `RunRecord.kind` is `'agent'`.
- `RunRecord.target` is the agent id.
- input validation uses `ValidationError{where:'agent_input'}`.
- output validation uses `ValidationError{where:'agent_output'}`.
- the outer span is `harness.session.prompt`;
- the child span is `harness.agent.run`;
- `harness.workflow.id` is absent.

The direct agent API is for one-agent conversational tasks. Multi-agent
orchestration remains workflow-owned.

### Direct Agent And Workflow Invocation Boundaries

| User action | Invocation |
|---|---|
| Ask a wiki question in chat | `POST /api/agents/wiki_answerer` |
| Upload or ingest a source | workflow endpoint for source ingest |
| Submit review decision | `POST /api/reviews/:runId/decision` |
| Generate decision memo | workflow endpoint for decision memo |
| Run architecture review | workflow endpoint for architecture review |
| Run wiki quality audit | workflow endpoint for wiki audit |
| Generate draw.io diagram as part of report | workflow/tool step |
| Explicitly ask direct chat to make a diagram | direct agent may request an artifact only if its output contains a typed artifact request |

Direct agents and workflows must stream the same `RunEvent` types. Frontend code
must not maintain two incompatible stream adapters.

## Flagship Workflows

### Decision Memo Workflow

Primary user prompt:

```text
Should we adopt <proposal>? Use the wiki and uploaded sources to produce a
decision memo with evidence, risks, counterarguments, diagrams, and a final
recommendation.
```

Required agents:

- `memo_planner`: turns the question into evaluation criteria, required
  evidence, assumptions, and retrieval tasks.
- `memo_retriever`: retrieves wiki pages, uploaded source snippets, and existing
  artifacts. Multiple retrievers may run in parallel.
- `memo_reasoner`: writes the argument, options, tradeoffs, and recommendation.
- `memo_reflector`: attacks the draft for unsupported claims, missing
  alternatives, and weak citations.
- `memo_judge`: scores the result with `JudgeRubric`.
- `artifact_designer`: creates Mermaid and optional draw.io diagram requests.
- `memo_publisher`: stores the final memo and artifact references.

Required output:

```ts
interface DecisionMemoOutput {
  markdown: string
  recommendation: 'adopt' | 'pilot' | 'defer' | 'reject'
  citedEvidence: EvidenceItem[]
  risks: string[]
  counterarguments: string[]
  openQuestions: string[]
  nextActions: string[]
  judge: JudgeRubric
  artifacts: ResearchArtifact[]
  reviewRequest?: ReviewRequest
  panelSpec: unknown
}
```

Human review is required when `judge.verdict` is `needs_human_review`,
`revise`, or `rejected`. If approved, the workflow publishes the memo. If
revised, it resumes at `plan` or `reason` depending on the decision guidance.

### Architecture Review Board Workflow

Primary user prompt:

```text
Review this RFC/source as an architecture board. Decide whether it is ready,
needs changes, or should be rejected.
```

Required behavior:

- ingest an uploaded RFC or wiki page;
- plan the review across API, data, operations, security, migration, and
  observability concerns;
- retrieve related wiki pages and prior decisions;
- reason about risks and missing sections;
- reflect against the repository specs and docs where available;
- judge readiness with a rubric;
- return a review packet and optional approval request.

Required output:

```ts
interface ArchitectureReviewOutput {
  markdown: string
  readiness: 'approved' | 'changes_requested' | 'rejected'
  blockingIssues: string[]
  nonBlockingIssues: string[]
  requiredFollowUps: string[]
  citedEvidence: EvidenceItem[]
  judge: JudgeRubric
  artifacts: ResearchArtifact[]
  reviewRequest?: ReviewRequest
  panelSpec: unknown
}
```

### Wiki Quality Audit Workflow

Primary user prompt:

```text
Audit the wiki for stale pages, orphan concepts, contradictions, weak
citations, and merge opportunities.
```

Required behavior:

- plan audit criteria;
- inspect pages and graph relationships;
- reason about cleanup suggestions;
- reflect on risk of destructive edits;
- judge which changes are safe;
- request human approval before applying edits;
- highlight affected graph nodes and clusters.

Required output:

```ts
interface WikiQualityAuditOutput {
  markdown: string
  proposedChanges: Array<{
    id: string
    kind: 'create_page' | 'update_page' | 'merge_pages' | 'add_citation' | 'mark_stale'
    title: string
    rationale: string
    targetRefs: string[]
    risk: 'low' | 'medium' | 'high'
  }>
  citedEvidence: EvidenceItem[]
  judge: JudgeRubric
  graphHighlights: GraphHighlight[]
  reviewRequest: ReviewRequest
  panelSpec: unknown
}
```

The audit workflow must never mutate wiki pages before a human decision is
submitted through the review decision endpoint.

## Direct Agent Chat

The main chat invokes `session.agents.wiki_answerer.stream(...)` directly.

Required behavior:

- answer questions from current wiki pages and sources;
- stream run events and show model/tool progress;
- show exactly one pending state: `Thinking`;
- render tool calls as one collapsible tool section, not duplicate messages;
- collapse tool details once answer text starts streaming or when the run
  finishes;
- render markdown, tables, code blocks, links, wiki links, and Mermaid diagrams.

Direct chat must not trigger workflow-only review cards unless the direct agent
returns a typed `ReviewRequest`.

## Source Ingest With Human Review

The source ingest flow is a human-in-the-loop workflow.

Workflow shape:

1. User uploads or selects a source.
2. `source_extractor` agent reads the source and proposes new pages, page
   updates, claims, citations, contradictions, and open questions.
3. Workflow emits or returns a `ReviewRequest`.
4. UI shows the review form only when the workflow requires it.
5. User accepts, rejects, chooses alternatives, or provides custom guidance.
6. Approved decision starts or resumes follow-up work that applies edits through
   tools and appends a log entry.

The review UI must not be permanently visible in chat.

### Review Request And Decision Contract

Source ingest and wiki audit workflows use the same review contract.

```ts
interface ProposedPageChange {
  id: string
  kind: 'create_page' | 'update_page' | 'merge_pages' | 'add_citation' | 'mark_stale'
  targetPageId?: string
  title: string
  beforeMarkdown?: string
  afterMarkdown?: string
  rationale: string
  citations: CitationChange[]
  risk: 'low' | 'medium' | 'high'
}

interface CitationChange {
  id: string
  pageId: string
  sourceRef: string
  claim: string
  operation: 'add' | 'update' | 'remove'
}

interface Contradiction {
  id: string
  claimA: string
  claimB: string
  refs: string[]
  severity: 'low' | 'medium' | 'high'
}

interface ReviewOutcome {
  reviewRequestId: string
  runId: string
  status: 'applied' | 'rejected' | 'revision_started'
  appliedChangeIds: string[]
  followUpRunId?: string
  logEntryId: string
}
```

Allowed decision behavior:

- `accept_all`: applies every proposed low/medium/high-risk change.
- `reject_all`: applies nothing and appends a rejection log entry.
- `accept_selected`: applies only `acceptedChangeIds`.
- `choose_alternative`: applies selected alternatives identified by
  `selectedAlternativeIds`.
- `custom_guidance`: starts a follow-up run at `plan` for source ingest and
  wiki audit, or at `reason` for decision memo and architecture review.

`POST /api/reviews/:runId/decision` is the canonical resume entrypoint. It
starts follow-up work itself; implementations must not add a second public
`apply_reviewed_ingest` endpoint. The endpoint is idempotent for
`(runId, reviewRequestId)`.

## Knowledge Graph Explorer

The map view is a practical analysis surface.

Required behavior:

- use Three.js for the primary graph view;
- graph nodes are wiki pages and source concepts;
- graph edges are wiki links, source citations, and generated relationships;
- clicking a node opens the page/source;
- latest run metadata can highlight cited pages, changed pages, contradiction
  clusters, orphan pages, and recommended merges;
- graph side panel uses `json-renderer` for stats and recommended actions.

Graph contract:

```ts
interface GraphNode {
  id: string
  label: string
  kind: 'page' | 'source' | 'concept' | 'artifact'
  ref: string
}

interface GraphEdge {
  id: string
  source: string
  target: string
  kind: 'wiki_link' | 'citation' | 'derived_relationship' | 'artifact_reference'
  weight: number
}

interface GraphHighlight {
  nodeIds: string[]
  edgeIds: string[]
  kind: 'cited' | 'changed' | 'contradiction' | 'orphan' | 'merge_candidate'
  label: string
}
```

The graph response includes:

```ts
interface GraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  highlights: GraphHighlight[]
  latestRunId?: string
  panelSpec: unknown
}
```

Stable graph ids:

- page nodes: `page:<pageId>`;
- uploaded source nodes: `source:<sourceId>`;
- concept nodes: `concept:<slug>`;
- artifact nodes: `artifact:<artifactId>`;
- edges: `<kind>:<sourceNodeId>:<targetNodeId>`.

Click routing:

- `page` opens the document view;
- `source` opens source details or ingest log;
- `artifact` opens the artifact preview;
- `concept` filters the graph and document list.

## Markdown, Mermaid, And Rich Rendering

Markdown rendering must support:

- GitHub-flavored markdown;
- tables;
- fenced code blocks;
- wiki links;
- Mermaid code fences via lazy-loaded `beautiful-mermaid`;
- safe Mermaid fallback when rendering fails.

`json-renderer` panels are allowed only when returned by direct agents or
workflows as typed panel specs. They must be rendered as rich chat/document
artifacts, not hard-coded demo cards.

## draw.io / Graphics Via MCP

When MCP support exists, the example includes an optional draw.io graphics
integration.

Target behavior:

- configure a draw.io-capable MCP server as an MCP tool;
- agent emits diagram intent or structured diagram data;
- MCP tool returns SVG, PNG data URL, or draw.io XML;
- UI shows the graphic in chat and document/artifact views;
- artifacts are saved under local example data, not embedded only in chat;
- generated graphics are referenced from the final report.

If no draw.io MCP server is configured, the app must degrade gracefully and use
Mermaid/Three.js only.

### Artifact Manifest And Rendering Contract

Artifacts are stored by manifest plus content file.

```ts
interface ArtifactManifest {
  artifactId: string
  kind: 'markdown' | 'mermaid' | 'svg' | 'drawio_xml' | 'json_panel'
  title: string
  contentType: string
  storagePath: string
  createdByRunId: string
  sourcePageIds: string[]
  digest: string
  createdAt: string
  renderMode: 'inline' | 'document' | 'download'
}
```

Rules:

- Mermaid is stored as source text. Rendered SVG may be cached as a separate
  `svg` artifact, but source text remains canonical.
- SVG content is sanitized before rendering and capped at 1 MB by default.
- draw.io XML is rendered as a preview when possible and otherwise offered as a
  document/artifact attachment.
- PNG data URLs from MCP are accepted only when the decoded payload is at or
  below the configured artifact size limit.
- Artifact ids are generated by the backend. Clients cannot choose filesystem
  paths.
- Artifact paths are always below the example data directory.

## MCP Runtime Support

Full MCP support belongs in `@purista/harness`, not the example.

The public shapes in [07-tools](./07-tools.md) are executable:

- `kind: 'mcp_stdio'`
- `kind: 'mcp_http'`

### MCP Public Contract Reconciliation

This spec amends [07-tools](./07-tools.md), [13-public-api](./13-public-api.md),
[14-otel-conventions](./14-otel-conventions.md), and
[15-error-catalog](./15-error-catalog.md) where they describe conflicting MCP
behavior.

Locked decisions:

- MCP runners are executable in this wave.
- `@modelcontextprotocol/sdk` is loaded through dynamic import by MCP runner
  modules. TS-only harnesses must not import or require the SDK at runtime.
- Public `McpAuth` is:

```ts
type McpAuth =
  | { kind: 'none' }
  | { kind: 'bearer'; token: string }
  | { kind: 'oauth2'; accessToken: string }
  | { kind: 'api_key'; header: string; value: string }
  | { kind: 'basic'; username: string; password: string }
```

- Async bearer token functions are not public API in this wave.
- `inputAdapter` and `outputAdapter` are supported on both stdio and HTTP tools.
- `McpProtocolError.meta.phase` is `'connect' | 'list' | 'call'`.
- Schema discovery failures before the model call use phase `'list'`.
- Transport connection failures use phase `'connect'`.
- Tool envelope failures and process death during a call use phase `'call'`.

### MCP Tool Definition Contract

The existing public config remains source-compatible. Implementation may add
optional fields only when they have safe defaults.

Required resolved MCP tool shape:

```ts
interface ResolvedMcpTool {
  localToolId: string
  kind: 'mcp_stdio' | 'mcp_http'
  description: string
  upstreamToolName: string
  inputSchema: unknown
  outputSchema?: unknown
  timeoutMs: number
  serverKey: string
}
```

For stdio tools, `serverKey` includes the local tool id and session sandbox key.
Shared MCP server pooling is explicitly out of scope until a shared server
config is specified. Two local tool ids pointing at the same command or URL get
independent runners.

### MCP Runtime Initialization Semantics

No network, process, or MCP SDK work happens during `.tools(...)` or
`.build()`.

For an agent that allowlists MCP tools, the harness initializes those MCP tool
schemas immediately before the first model call of the run. Initialization:

1. creates or reuses the local MCP runner for the local tool id and sandbox;
2. for stdio, runs optional `install.command` inside the sandbox before first use;
3. calls `tools/list`;
4. validates the upstream tool exists;
5. caches the discovered schema in memory for the life of that runner;
6. builds `ModelToolSpec` entries.

If initialization fails, the model call is skipped and the run fails with the
mapped MCP error. Schema cache is in-memory only and is refreshed after runner
respawn. Upstream schema changes during a live process are not detected until
respawn.

### MCP Call Envelope And Output Normalization

The runner calls the SDK tool call method for the configured upstream tool name.
Model-facing output is normalized before it is persisted or sent as a tool
result.

Normalization rules:

- `structuredContent` is preferred when present and JSON-compatible.
- otherwise text content blocks are joined with `\n`;
- image/resource blocks become `{ contentType, data? , uri? }` objects;
- mixed content becomes `{ content: [...] }`;
- `isError: true` throws `ToolError` with `tool_kind` set to the MCP kind;
- output JSON Schema validation runs after normalization and before
  `outputAdapter`;
- `outputAdapter` receives the validated normalized value and returns the final
  model-facing tool output.

### MCP Transport Details

Stdio behavior:

- `command` and `args` are executed through the current `SandboxSession.exec`.
- stdio MCP never uses host-side child process spawning directly.
- if `SandboxSession.executor === 'unavailable'`, stdio MCP fails with
  `SandboxNoExecutorError`.
- optional `install.command` runs through the same sandbox before first use.
- `args` default to `[]`.
- `env` is passed to the sandbox executor; sandbox adapters decide which host
  environment is inherited.
- startup/connect timeout uses `defaults.toolTimeoutMs`.
- stderr is logged at debug level only when content capture is enabled;
  otherwise it is redacted.
- shutdown cancels in-flight calls and clears runner state. There is no
  host-owned stdio child process to kill.
- process exit before initialize maps to phase `'connect'`;
- process exit during `tools/list` maps to phase `'list'`;
- process exit during `tools/call` maps to phase `'call'`.

HTTP behavior:

- transport is MCP streamable HTTP through the SDK;
- no custom HTTP/SSE fallback is required beyond SDK support;
- user headers are applied first, auth headers second, so auth wins;
- redirects, TLS, and proxy behavior follow Node fetch defaults;
- `401` and `403` map to `McpAuthError`;
- other non-2xx transport failures map to `McpProtocolError` unless the SDK
  exposes a more precise MCP protocol error.

### Stdio Runner

Required behavior:

- execute stdio exchanges through the sandbox executor;
- run optional install/bootstrap commands inside the sandbox before first use;
- initialize the MCP protocol for each sandbox-owned exchange;
- call `tools/list` before exposing the tool to the model;
- verify configured `tool` exists;
- validate input and output with JSON Schema;
- enforce `defaults.toolTimeoutMs`;
- abort calls on run cancellation;
- serialize concurrent calls to the same stdio runner;
- start a fresh sandbox-owned exchange on the next call after process death;
- cancel in-flight calls on `harness.shutdown()`;
- never log full payload content unless telemetry content capture is explicitly
  enabled.

### HTTP Runner

Required behavior:

- support streamable HTTP MCP transport where the SDK provides it;
- support auth: none, bearer static token, OAuth2 access token, API key header,
  and basic auth;
- validate input/output with JSON Schema;
- enforce timeout and cancellation;
- map auth/protocol failures to MCP error classes.

### JSON Schema Validation

The harness must include a local JSON Schema validator for MCP schemas.

Required behavior:

- support the JSON Schema draft 2020-12 subset documented in
  [07-tools](./07-tools.md);
- unsupported keywords warn once per `(toolId, keyword)`;
- validation failure throws `ValidationError{where:'mcp_input'|'mcp_output'}`;
- do not convert MCP schemas to Zod.

Additional locked behavior:

- `additionalProperties:false` rejects unknown object keys.
- omitted `additionalProperties` allows unknown object keys.
- `type` arrays are supported for nullable fields such as `['string','null']`.
- unknown `format` values warn once and otherwise pass.
- nested unsupported keyword warnings include a JSON pointer path.
- malformed schemas discovered from MCP map to
  `McpProtocolError{phase:'list'}`.
- `ValidationError.meta.issues` contains
  `{ path: string; message: string; keyword?: string }[]`.

### Agent Tool Exposure

MCP tools must appear to the model like any other `ModelToolSpec`:

- name: local harness tool id;
- description: local description plus safe upstream tool summary when available;
- parameters: upstream input schema after adapter shape is known.

Agents allow MCP tools through the same `tools` allowlist used for TS tools.
When an MCP tool is not allowlisted, the failure is `ToolNotFoundError` with
`where:'agent_allowlist'`.

### Lifecycle And Shutdown

The harness build result must expose a shutdown path that closes MCP stdio
processes. If the existing harness object lacks a public shutdown method, the
MCP implementation must add one without breaking existing callers. Shutdown is
idempotent.

Shutdown behavior:

- no new MCP calls may start after shutdown begins;
- in-flight MCP calls receive cancellation;
- MCP runners close before state and sandbox adapters are closed;
- close failures are aggregated and exposed from shutdown as `{ errors }` when
  the existing shutdown surface supports a result, or logged and rethrown as the
  first error when it does not;
- repeated shutdown calls return without side effects.

### Telemetry

MCP calls must use the existing tool span shape with:

- `gen_ai.tool.type = 'mcp_stdio' | 'mcp_http'`
- `gen_ai.tool.name = <local tool id>`
- `harness.mcp.server`
- `harness.mcp.tool`
- `harness.mcp.transport`
- `harness.run.id`
- `harness.session.id`
- `harness.agent.id`
- optional `harness.workflow.id`

Do not record MCP request/response bodies by default.

Logs use these fields when available:

- `provider: 'mcp'`;
- `toolId`;
- `mcpTransport`;
- `mcpServer`;
- `mcpTool`;
- `phase`;
- `status`.

Auth headers, token values, API keys, and configured env values are always
redacted. `tool.started` and `tool.finished` events follow the existing content
capture rule: payloads are redacted when `captureContent=false`.

### Errors

Required mappings:

| Failure | Error |
|---|---|
| unknown MCP tool | `ToolNotFoundError` |
| invalid MCP input/output | `ValidationError` |
| server connection failure | `McpProtocolError{phase:'connect'}` |
| tools/list failure | `McpProtocolError{phase:'list'}` |
| protocol/call envelope failure | `McpProtocolError{phase:'call'}` |
| stdio process death | `McpProtocolError{phase:'call'}` |
| HTTP auth failure | `McpAuthError` |
| timeout | `OperationTimeoutError` |
| abort | `OperationCancelledError` |

## Backend API Changes

Required API additions:

| Method | Route | Behavior |
|---|---|---|
| `GET` | `/api/graph` | Returns graph nodes, edges, panel spec, and latest highlights. |
| `POST` | `/api/agents/:agentId` | Starts a direct agent run. |
| `POST` | `/api/reviews/:runId/decision` | Submits a human review decision and starts/resumes follow-up work. |
| `GET` | `/api/artifacts/:artifactId` | Returns generated Mermaid/draw.io/SVG artifacts. |
| `POST` | `/api/artifacts` | Stores an approved generated artifact. |

Existing workflow endpoints remain.

Review decisions must be idempotent per `(runId, reviewRequestId)`. Replaying
the same decision returns the existing follow-up result instead of applying
changes twice.

### Backend Request And Response Schemas

```ts
interface AgentRunRequest {
  input: unknown
  sessionId?: string
  stream?: boolean
}

interface AgentRunResponse {
  runId: string
  sessionId: string
  output?: unknown
}

interface ReviewDecisionResponse {
  runId: string
  outcome: ReviewOutcome
}

interface ArtifactCreateRequest {
  kind: ArtifactManifest['kind']
  title: string
  contentType: string
  content: string
  sourcePageIds?: string[]
  renderMode?: ArtifactManifest['renderMode']
}

interface ArtifactResponse {
  manifest: ArtifactManifest
  content: string
}

interface ApiErrorResponse {
  error: {
    code: string
    message: string
    details?: unknown
  }
}
```

Required error responses:

| Case | Status | Code |
|---|---:|---|
| unknown agent/workflow/artifact | 404 | `NOT_FOUND` |
| invalid request body | 400 | `VALIDATION_ERROR` |
| stale or already superseded review request | 409 | `STALE_REVIEW_REQUEST` |
| invalid review decision for request | 400 | `INVALID_REVIEW_DECISION` |
| unsupported artifact kind | 400 | `UNSUPPORTED_ARTIFACT_TYPE` |
| artifact render failure | 422 | `ARTIFACT_RENDER_FAILED` |
| MCP optional tool unavailable | 503 | `MCP_UNAVAILABLE` |
| session already running | 409 | `SESSION_BUSY` |

`POST /api/agents/:agentId` streams SSE when `stream:true` or when the client
uses the existing stream route convention. The SSE payload is the existing
`RunEvent` contract with no frontend-specific event type fork.

## Example Environment And Optional Integration Behavior

Default example startup must not require OpenAI, draw.io MCP, or Jaeger.

Optional environment:

| Variable | Enables |
|---|---|
| `OPENAI_API_KEY` | real OpenAI model calls |
| `LIVING_WIKI_DRAWIO_MCP_COMMAND` | draw.io MCP stdio integration |
| `LIVING_WIKI_DRAWIO_MCP_ARGS` | optional stdio args |
| `LIVING_WIKI_DRAWIO_MCP_URL` | draw.io MCP HTTP integration |
| `LIVING_WIKI_DRAWIO_MCP_AUTH_TOKEN` | bearer token for HTTP integration |
| Jaeger variables from runbook | trace export |

When optional integration variables are absent, tests and local startup use fake
providers for model calls, disabled MCP fallback for draw.io, and no-op
telemetry when no trace exporter is configured.

## Frontend Requirements

### Layout

- concise, work-focused color theme;
- no decorative gradient/orb backgrounds;
- document and chat default to a 50:50 split after the sidebar;
- split is user-resizable;
- page itself does not scroll;
- sidebar, document, chat, graph, and drawers scroll independently;
- inspector remains an on-demand drawer.

### Chat

- AI Elements-style message, tool, and prompt components;
- multiline prompt with autofocus;
- auto-scroll to latest message while the user is at the bottom;
- tools collapsed once answer text starts or run finishes;
- one visible pending label: `Thinking`;
- `json-renderer` rich panels appear only when returned by a run;
- review forms appear only for active review requests.

### Document View

- markdown renderer supports GitHub-flavored markdown, wiki links, and Mermaid;
- edit mode actions are `Cancel` and `Save`;
- normal mode actions include `Map` and `Edit`;
- generated artifacts can be embedded or referenced from documents.

## Skills

Required skills:

- `wiki-curator`: compact linked wiki maintenance.
- `research-brief-writer`: report structure, citation style, Mermaid guidance,
  open-question handling, and confidence language.
- `diagram-designer`: converts research structure into Mermaid or draw.io-ready
  artifact instructions.
- `decision-memo-planner`: defines evaluation criteria, evidence needs, and
  decision options.
- `reflective-critic`: reviews drafts for missing evidence, contradictions,
  unsupported claims, and bias.
- `judge-rubric`: produces structured `JudgeRubric` output.

Skills must remain mounted through the harness skill system. They must not be
inlined directly into workflow handlers.

## Tests

Required harness tests:

- MCP stdio happy path with a fake MCP server.
- MCP stdio process death and respawn.
- MCP HTTP happy path with fake server.
- MCP auth failure mapping.
- MCP input/output validation failure.
- timeout/cancellation propagation.
- MCP tools appear in model tool specs.
- shutdown closes stdio processes.
- MCP SDK is not imported for harnesses that only use TS tools.

Required example tests:

- direct agent API run;
- workflow run;
- source ingest review request rendering and decision submission;
- decision memo workflow happy path;
- architecture review workflow happy path;
- wiki quality audit workflow blocks mutation until review approval;
- graph route and Three.js component smoke test;
- markdown Mermaid rendering fallback;
- draw.io MCP disabled fallback;
- fake draw.io MCP artifact creation when configured;
- artifact path traversal rejection.

### Test Fixtures And Acceptance Matrix

Required fixture ownership:

| Fixture | Owner path |
|---|---|
| fake model outputs for direct chat and workflows | `examples/living-wiki-jaeger/src/backend/__fixtures__/**` |
| review request and decision payloads | `examples/living-wiki-jaeger/src/backend/__fixtures__/reviews/**` |
| decision memo output | `examples/living-wiki-jaeger/src/backend/__fixtures__/workflows/decision-memo.json` |
| architecture review output | `examples/living-wiki-jaeger/src/backend/__fixtures__/workflows/architecture-review.json` |
| wiki audit output | `examples/living-wiki-jaeger/src/backend/__fixtures__/workflows/wiki-audit.json` |
| graph payload | `examples/living-wiki-jaeger/src/frontend/__fixtures__/graph.json` |
| artifact manifests | `examples/living-wiki-jaeger/src/frontend/__fixtures__/artifacts/**` |
| Mermaid render failure | frontend renderer test fixture |
| fake draw.io MCP response | `packages/harness/src/testing/fixtures/mcp/**` and example backend fixture |

Layered tests:

- harness MCP contract tests run without external MCP servers;
- backend route tests use fake providers and fixture payloads;
- workflow unit tests use fake model outputs;
- frontend component tests use fixture JSON and do not call backend routes;
- UI smoke tests verify layout, independent scrolling, graph canvas, chat
  pending state, and artifact rendering.

Manual verification:

1. Start Jaeger.
2. Start example with OpenAI.
3. Run direct chat.
4. Upload source and approve ingest review.
5. Generate decision memo.
6. Generate architecture review.
7. Generate wiki quality audit and approve one change.
8. Generate diagram artifact through configured draw.io MCP server.
9. Confirm Jaeger shows session, direct agent, workflow, model, TS tool, MCP
   tool, and artifact spans without content capture.

## Documentation Requirements

Update docs for:

- direct agent vs workflow execution;
- MCP tool configuration and security;
- draw.io MCP example configuration;
- human-in-the-loop workflow pattern;
- plan/reason/reflect/judge workflow pattern;
- decision memo, architecture review, and wiki audit scenarios;
- artifact generation and storage;
- graph/visualization use case;
- operational notes for MCP child processes, timeouts, auth, shutdown, and
  observability.

### Documentation Inventory And Acceptance

| Page | Required additions |
|---|---|
| `docs/guides/mcp-tools.md` | MCP config, auth, stdio/HTTP setup, shutdown, fake tests, real integration env vars |
| `docs/reference/public-api.md` | direct agent invocation, MCP public types, shutdown behavior |
| `docs/reference/spec-conformance.md` | implementation status and remaining scoped follow-ups |
| `docs/operations/runbook.md` | MCP child process operations, Jaeger inspection, troubleshooting |
| `docs/guides/common-scenarios.md` | RAG, HITL, triage, parallel agents, plan/reason/reflect/judge, artifact generation |
| `examples/living-wiki-jaeger/README.md` | end-to-end app walkthrough and draw.io MCP optional setup |

Docs acceptance:

- every external integration has default skip behavior documented;
- every workflow has one concrete command or UI walkthrough;
- stale statements saying direct agent invocation is impossible are removed or
  scoped to older specs;
- stale statements about unsupported MCP runners are replaced with current
  implementation status after runtime tests pass.

## Implementation Readiness Rules

Planning must split this refactor into independently executable tickets with:

- explicit read scope;
- explicit write scope;
- no overlapping write scope unless one ticket is declared a follow-up
  integration ticket;
- concrete acceptance tests;
- default verification commands;
- opt-in external integration commands for real OpenAI or real draw.io MCP;
- no dependency on real MCP servers for default CI.

The first implementation wave must not require frontend agents to wait for real
MCP runtime completion. Frontend and backend example tickets must use fake
artifact fixtures and disabled MCP fallback until MCP runtime tests pass.

## Non-goals

This refactor still must not add:

- database persistence;
- authentication;
- multi-user sync;
- cloud deployment manifests;
- telemetry content capture by default;
- provider-specific model APIs in app code.

## Cross-references

- [07-tools](./07-tools.md) — MCP tool behavior.
- [09-agents](./09-agents.md) — default agent loop and tool use.
- [10-workflows](./10-workflows.md) — orchestration.
- [11-sessions](./11-sessions.md) — direct agents and workflows.
- [12-streaming](./12-streaming.md) — SSE observation.
- [14-otel-conventions](./14-otel-conventions.md) — spans and metrics.
- [18-living-wiki-jaeger-example](./18-living-wiki-jaeger-example.md) — current example baseline.
