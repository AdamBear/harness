Adapters architecture review — compact

Summary
- Reviewed module boundaries, adapter responsibilities, tracing, MCP/tooling for artifacts, and runtime concerns.

Findings (high level)
- Module boundary: adapters should be thin, side-effecting boundary layers with a small, well-documented interface exposed to Core/Service modules. Keep protocol and serialization inside adapters; Core sees typed calls not HTTP/AMQP details.
- API surface: prefer explicit sync/async variants, idempotent operations, uniform error types and retry semantics.
- Data contracts: publish schemas (OpenAPI/Protobuf/Avro) and schema evolution rules. Use a schema registry for messages.
- Tracing/observability: instrument adapters with OpenTelemetry; propagate trace/correlation IDs and attach adapter metadata (adapter.type, target, outcome). Emit metrics (latency, success-rate, retries) and health checks.
- Operations: include connection pooling, circuit-breakers, backoff, timeouts, bulkheads. Expose per-adapter config via config service or MCP.
- Security: centralize secrets (vault), validate inputs, verify webhooks, least-privilege credentials, rotate keys, rate-limits and quotas.
- Migration & versioning: version adapters and their artifacts separately; support multi-version side-by-side; use canaries/feature flags for rollout.
- MCP/tooling & artifact generation: generate client SDKs, OpenAPI/Protobuf, Docker images, and NPM/PyPI packages; publish artifacts to registry with semantic versions and changelogs.

Recommendations (concrete)
- Make adapters implement a typed interface: Connect(ctx, Request) -> Response | AdapterError. Document retries and idempotency per method.
- Standardize error model (code, transient boolean, message, details) and map external errors to it.
- Require OpenTelemetry spans around every adapter call; tag spans with adapter.name, adapter.type, external.endpoint, and retry_count.
- Add MCP pipeline step to produce: spec (OpenAPI/proto), client SDKs, container image, and a lightweight adapter health sidecar. Include automated contract tests against a sandbox/mock.
- For migrations, include DB migration hooks in DB-adapter and support dry-run + backfill via CDC if needed.

Follow-ups
- Create a template adapter repo with tracing/metrics, config, tests, and CI steps (artifact generation + contract tests).
- Define schema-evolution policy and publish to [[schema-registry-guidelines]].

See also: [[adapters-overview]], [[modules-and-adapters-diagram]], [[integration-flow]].
