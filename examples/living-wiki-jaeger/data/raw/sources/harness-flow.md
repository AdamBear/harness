# Harness Flow Source

The living wiki example exists to show the enterprise harness lifecycle as
lower-level infrastructure. The intended mental model is:

```text
define -> harness -> agent -> workflow -> session -> invoke
```

The model registry owns provider selection. Workflows call typed agents and
tools through harness capability boundaries rather than reaching into provider
SDKs directly.

Seed references: [[agent-harness]], [[workflow-observation]].
