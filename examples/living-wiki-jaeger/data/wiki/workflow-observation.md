# Workflow Observation

The application observes workflow runs through the API and run-specific SSE
streams. Browser clients should treat persisted harness events as authoritative
and handle reconnecting, completed, failed, cancelled, and overflow states.

## Linked Concepts

- [[agent-harness]]
- [[jaeger-tracing]]
- [[source-grounding]]

## Source References

- `harness-flow`
- `jaeger-notes`

## Open Questions

- How much structured report detail should remain visible after a run finishes?
