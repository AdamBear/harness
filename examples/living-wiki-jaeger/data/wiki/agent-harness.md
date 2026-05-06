# Agent Harness

The harness is the typed runtime boundary for the example. It demonstrates the
flow `define -> harness -> agent -> workflow -> session -> invoke` and keeps
provider-specific behavior behind the model registry.

The harness emits OpenTelemetry spans in the shape documented in [[jaeger-tracing]] so local runs can be verified with a Jaeger-compatible collector. This mirrors the example's default OTLP/HTTP exporter configuration and does not require adding extra telemetry capture flags beyond the example's instrumentation.

## Linked Concepts

- [[workflow-observation]] explains how runs are watched through API and SSE.
- [[source-grounding]] defines how page claims stay connected to source notes.
- [[jaeger-tracing]] documents the expected trace shape the harness emits for local verification.

## Source References

- `harness-flow`

## Open Questions

- Which run events should be elevated into the right inspector by default?
