Harness Flow

Summary

The living wiki example defines the enterprise harness lifecycle as lower-level infrastructure. Intended mental model:

```
define -> harness -> agent -> workflow -> session -> invoke
```

Key points

- The model registry owns provider selection and resolution.
- Workflows call typed agents and tools through harness capability boundaries rather than reaching into provider SDKs directly.
- Keeping provider-specific behavior inside the harness exposes stable, typed capabilities to workflows.

Linked concepts: [[agent-harness]], [[workflow-observation]]

Source References

- `harness-flow` (original source notes)
