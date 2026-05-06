Jaeger Tracing

Jaeger receives OpenTelemetry traces from the example through the OTLP HTTP
endpoint. The default local exporter endpoint is `http://localhost:4318/v1/traces`.

Clarification: prior drafts used the phrase "without enabling telemetry content capture" which caused ambiguity. The correct intent is:

- The example's default instrumentation and OTLP exporter emit spans without requiring additional "capture" feature flags or special instrumentation toggles.
- However, emitting spans from the application is not the same as visualizing them in an external UI. To surface spans and links in Jaeger (or any collector-backed UI), a collector/backend must be running and the exporter must be pointed at it.

In short: the example's instrumentation is enabled by default (no extra capture flags needed), but an external collector is required to view spans in Jaeger's UI and to resolve cross-system links.

## Expected Trace Shape

A workflow run should make request, session, workflow, agent, model, and tool
activity visible when the example's OTLP exporter is pointed at a collector.

## Linked Concepts

- [[agent-harness]] (the harness emits the spans described here)
- [[workflow-observation]]
- [[adapters-overview]]

## Source References

- `jaeger-notes`

## Open Questions

- Which spans should expose links in the UI when Jaeger is not running?
