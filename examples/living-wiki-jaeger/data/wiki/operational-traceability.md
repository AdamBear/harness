# Operational traceability

Goal: ensure each workflow run can be reconstructed and attributed across
harness, agent, workflow, session, and model/tool activity.

## Key practices

- Authoritative event stream: persist harness events and have clients consume
  API/SSE; treat persisted events as the source of truth. See [[workflow-observation]].
- Trace capture: emit OTLP traces that expose request → session → workflow →
  agent → model/tool spans. Keep the trace shape minimal but linkable. See [[jaeger-tracing]].
- Source grounding: attach source references to page claims and preserve them
  during edits so run assertions remain auditable. See [[source-grounding]].
- Provider boundary: keep provider-specific behavior behind the model registry
  and use typed harness boundaries to avoid vendor leakage. See [[agent-harness]] and [[harness-flow]].

## Open questions

- Which run events should be elevated into inspectors by default?
- What data retention, redaction, and visibility policies should apply to
  persisted events?
- How should traces be surfaced in the UI when Jaeger or OTLP collectors are
  unavailable?

## Source references

- `harness-flow`
- `jaeger-notes`
