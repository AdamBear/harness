# OpenTelemetry conventions

**Purpose.** Authoritative enumeration of every span, metric, attribute key, and event emitted by the harness, plus the per-log fields. Implementation agents MUST emit exactly these names.

Aligned with OpenTelemetry semantic conventions for Generative AI as of the **stable v1.30 / experimental v1.30** revision (2025). See <https://opentelemetry.io/docs/specs/semconv/gen-ai/>.

## Tracer / meter

- Tracer name (locked): `'@purista/harness'`.
- Meter name (locked): `'@purista/harness'`.
- Tracer and meter version: `HARNESS_VERSION`.

## Attribute value types

All attribute values are one of:

| Type     | Notes                                              |
|----------|----------------------------------------------------|
| string   | UTF-8                                              |
| integer  | 64-bit; used for counts, indexes, token counts     |
| double   | floating point; durations in seconds, sampling     |
| boolean  | `true`/`false`                                     |
| string[] | string array; used for `gen_ai.response.finish_reasons` |

Undefined values are dropped before being passed to OTel.

## Span name mapping (locked)

| Harness span                | Span name                                       | Source convention |
|-----------------------------|-------------------------------------------------|-------------------|
| Outermost session prompt    | `harness.session.prompt`                        | custom |
| Workflow run                | `harness.workflow.run`                          | custom |
| Agent run                   | `invoke_agent {agent.name}`                     | GenAI conv |
| Model call                  | `{operation_name} {request.model}` e.g. `chat gpt-4o` | GenAI conv |
| Tool call                   | `execute_tool {tool.name}`                      | GenAI conv |
| Sandbox `exec`              | `harness.sandbox.exec`                          | custom |
| State op                    | `harness.state.op`                              | custom |

For GenAI-conv spans, attach BOTH the GenAI attributes (canonical) and the internal correlation attributes (`harness.run.id`, `harness.session.id`, `harness.workflow.id`).

## Common correlation attributes

Every harness span carries (when applicable) `harness.session.id`, `harness.run.id`, `harness.workflow.id`. Spans inside an agent additionally carry `harness.agent.id`. Every span receives `harness.name = HarnessOptions.name` (string) when set.

## Span attributes

### `harness.session.prompt`

| Key                    | Type    |
|------------------------|---------|
| `harness.session.id`   | string  |
| `harness.run.id`       | string  |
| `harness.workflow.id`  | string  |

### `harness.workflow.run`

Adds:

| Key                    | Type    |
|------------------------|---------|
| `harness.workflow.id`  | string  |

### `invoke_agent {agent.name}` (GenAI conv)

| Key                          | Type    |
|------------------------------|---------|
| `gen_ai.agent.name`          | string — the agent key |
| `gen_ai.agent.id`            | string — the run id |
| `gen_ai.agent.description`   | string — first 200 chars of `instructions` if a string; otherwise omitted |
| `harness.agent.id`           | string  |
| `harness.agent.model`        | string — alias key |
| `harness.agent.has_handler`  | boolean |

### `{operation_name} {request.model}` (GenAI conv — model call)

`operation_name` is one of `chat`, `text_completion`, `embeddings`. The default loop uses `chat`.

| Key                                  | Type     |
|--------------------------------------|----------|
| `gen_ai.system`                      | string — provider-declared (e.g. `'openai'`, `'anthropic'`, `'azure.ai.openai'`). The harness asserts the provider sets this. |
| `gen_ai.operation.name`              | string — `'chat' \| 'text_completion' \| 'embeddings'` |
| `gen_ai.request.model`               | string — alias's `model` field |
| `gen_ai.response.model`              | string — when known |
| `gen_ai.request.temperature`         | double — when set |
| `gen_ai.request.max_tokens`          | integer — when set |
| `gen_ai.request.top_p`               | double — when set |
| `gen_ai.request.frequency_penalty`   | double — when present in `providerOptions` |
| `gen_ai.request.presence_penalty`    | double — when present in `providerOptions` |
| `gen_ai.response.id`                 | string — when known |
| `gen_ai.response.finish_reasons`     | string[] |
| `gen_ai.usage.input_tokens`          | integer |
| `gen_ai.usage.output_tokens`         | integer |
| `harness.model.alias`                | string  |
| `harness.model.method`               | string — `'text' \| 'text_stream' \| 'json' \| 'json_stream'` |

### `execute_tool {tool.name}` (GenAI conv)

| Key                              | Type    |
|----------------------------------|---------|
| `gen_ai.tool.name`               | string — canonical tool name. Built-in canonical names: `bash`, `read`, `write`, `edit`, `glob`, `grep`, `list`. Aliases (`Bash`, `Read`, `Write`, `Edit`, `Glob`, `Grep`, `LS`, `List`) are normalized to canonical before emission. |
| `gen_ai.tool.call.id`            | string — `tc_<ulid>` |
| `gen_ai.tool.type`               | string — one of `'builtin'`, `'ts'`, `'mcp_stdio'`, `'mcp_http'`. |
| `harness.tool.id`                | string  |
| `harness.mcp.server`             | string — MCP local server/tool identity; set only for MCP tools. |
| `harness.mcp.tool`               | string — upstream MCP tool name; set only for MCP tools. |
| `harness.mcp.transport`          | string — `'stdio'|'http'`; set only for MCP tools. |
| `harness.permission.mode`        | string — `'allow'\|'ask'\|'deny'`; set when the call was permission-gated |
| `harness.permission.decision`    | string — `'allow'\|'deny'`; set when the call was permission-gated |

### `harness.sandbox.exec`

| Key                                | Type    |
|------------------------------------|---------|
| `harness.session.id`               | string  |
| `harness.run.id`                   | string  |
| `harness.exec.exit_code`           | integer |
| `harness.exec.duration`            | double — seconds |

### `harness.state.op`

| Key                          | Type    |
|------------------------------|---------|
| `harness.state.op_name`      | string  |
| `harness.session.id`         | string (when applicable) |
| `harness.run.id`             | string (when applicable) |

Persistence-of-events happens inline in the run lifecycle (no dedicated span). Failures are tracked via the `harness.events.persist_errors` counter.

Spans use status `OK` on success and `ERROR` on failure; on failure, `recordException(err)` is called with the thrown error.

## GenAI events on `chat` span

Per the GenAI conv, the harness emits these span events on the `chat`/`text_completion`/`embeddings` span:

- `gen_ai.system.message` — body `{role:'system', content}` per system message present.
- `gen_ai.user.message` — body `{role:'user', content}`.
- `gen_ai.assistant.message` — body `{role:'assistant', content, tool_calls?}`.
- `gen_ai.tool.message` — body `{role:'tool', id, content}`.
- `gen_ai.choice` — body `{index, finish_reason, message: {role:'assistant', content?, tool_calls?}}`.

### Privacy gate (`telemetry.captureContent`)

The harness config option `telemetry.captureContent` controls content visibility:

- `false` (default): events are still emitted, but `content`, `tool_calls.arguments`, and `tool_results.content` fields are replaced with `null`.
- `true`: full content is included.

This matches the GenAI conv guidance.

## Errors (all spans)

On span failure, the harness sets:

| Key                                | Type    |
|------------------------------------|---------|
| `error.type`                       | string — the `HarnessError.code`, e.g. `'MODEL_ERROR'`. (Per OTel `error.type` convention.) |
| `harness.error.code`               | string — same value as `error.type`, kept for backward correlation in custom spans |
| `harness.error.category`           | string  |
| `harness.error.retriable`          | boolean |

`error.type` is set on every failing span — both GenAI-conv spans and harness-only spans.

## Metrics

Per the GenAI conv, durations are seconds (double); token counts are units of `{token}`. All metrics carry `harness.session.id` and `harness.run.id` where applicable.

### Canonical GenAI metrics

| Instrument                          | Type      | Unit       | Attributes                                                                                  |
|-------------------------------------|-----------|------------|---------------------------------------------------------------------------------------------|
| `gen_ai.client.token.usage`         | Histogram | `{token}`  | `gen_ai.system`, `gen_ai.operation.name`, `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.token.type` (`'input'\|'output'`) |
| `gen_ai.client.operation.duration`  | Histogram | `s`        | `gen_ai.system`, `gen_ai.operation.name`, `gen_ai.request.model`, `gen_ai.response.model`, `error.type` (when error) |

`gen_ai.client.token.usage` is the canonical token-count instrument; `gen_ai.client.operation.duration` is the canonical model-call duration. There are no harness-emitted `tokens.*` counters or `*_ms` histograms for model calls — token counts and latencies flow only through the GenAI-conv instruments above.

### Harness-only metrics (kept)

| Instrument                          | Type      | Unit | Attributes                                                                  |
|-------------------------------------|-----------|------|-----------------------------------------------------------------------------|
| `harness.tool.duration`             | Histogram | `s`  | `gen_ai.tool.name`, `gen_ai.tool.type`, `harness.run.id`, `harness.session.id` |
| `harness.run.duration`              | Histogram | `s`  | `harness.workflow.id`, `harness.session.id`, `error.type` (when error)      |
| `harness.run.errors`                | Counter   | `1`  | `harness.workflow.id`, `error.type`                                         |
| `harness.events.persist_errors`     | Counter   | `1`  | `harness.session.id`, `harness.run.id`                                      |
| `harness.permission.denials`        | Counter   | `1`  | `gen_ai.tool.name`, `harness.agent.id`, `harness.session.id`                |

Naming convention: harness-only durations use `_duration` suffix and unit `s` (seconds, double), aligned with OTel semconv. No `_ms` instruments exist.

## Log fields

Every harness-emitted log line carries (when applicable):

| Field             | Source                            |
|-------------------|-----------------------------------|
| `harness`         | `HarnessOptions.name`             |
| `session_id`      | active session                    |
| `run_id`          | active run                        |
| `agent_id`        | active agent                      |
| `workflow_id`     | active workflow                   |
| `tool_id`         | active tool                       |
| `trace_id`        | active OTel trace                 |
| `span_id`         | active OTel span                  |
| `duration_seconds` | when emitted alongside an operation finish; double, seconds. Logger field naming aligns with OTel conv (no `_ms` suffixes). |

Plus standard `level`, `time`, `msg`, and any user-supplied `fields`.

## Cross-references

- [03-foundation](./03-foundation.md) — telemetry shim API.
- [09-agents](./09-agents.md), [10-workflows](./10-workflows.md), [12-streaming](./12-streaming.md).
