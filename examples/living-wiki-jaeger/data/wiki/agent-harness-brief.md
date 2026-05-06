# Agent Harness — Decision Brief

Goal: decide how the harness uses agents, tools, tracing, and reviews so teams
can implement consistent behavior across providers.

Summary

- The harness is the typed runtime boundary for the example and mediates the
  flow: define -> harness -> agent -> workflow -> session -> invoke.
- It keeps provider-specific behavior behind the model registry and exposes a
  stable runtime interface for agents and tools.

Core decisions

1. Agents and tools

- Agents run inside the harness boundary and call tools through typed tool
  interfaces (inputs, outputs, error semantics).
- Tools should be registered in a model/implementation registry so the harness
  can swap provider implementations without changing agent logic.
- Recommendation: require explicit tool schemas and runtime validation to avoid
  silent failures.

2. Tracing and telemetry

- The harness must emit canonical spans for request, session, workflow, agent,
  model, and tool activities so run shape is visible for local verification and
  remote tracing (Jaeger).
- When Jaeger is not available, persist run events in the harness API and
  provide UI links that open traces only if a tracing backend is present.
- Recommendation: adopt the expected trace shape in [[jaeger-tracing]] and
  ensure spans surface enough metadata (ids, timestamps, event types) to map
  events to persisted run records.

3. Run observation and persistence

- Persist harness events as authoritative run history; clients should treat
  these persisted events as the single source of truth and handle reconnects
  and state transitions (completed, failed, cancelled, overflow).
- Recommendation: expose SSE per-run streams and provide an inspector that
  surfaces persisted events and trace links. See [[workflow-observation]].

4. Source grounding and reviews

- Automated agent outputs that assert facts must include source references or be
  marked as provisional. Edits to wiki pages or canonical notes should preserve
  source slugs and list unresolved items under Open Questions.
- Recommendation: require a manual review step before turning automated
  summaries into canonical source text. See [[source-grounding]].

Operational checklist (short)

- Emit canonical spans for: request, session, workflow, agent, model, tool.
- Persist run events and expose SSE streams per run.
- Register tools with explicit schemas and runtime validation.
- Require source references and a review step for automated claims.

Open questions

- Which run events should be elevated into the inspector by default? (see
  [[agent-harness]] Open Questions)
- Which spans should expose UI links when Jaeger is not running? (see
  [[jaeger-tracing]] Open Questions)

Sources

- [[agent-harness]], [[workflow-observation]], [[source-grounding]],
  [[jaeger-tracing]]

