# @purista/harness

Self-hosted enterprise agent harness for typed tools, agents, workflows, state,
sandboxing, streaming, and OpenTelemetry instrumentation.

## Install

```bash
npm install @purista/harness
```

Optional peer dependencies:

- `@modelcontextprotocol/sdk` enables MCP stdio/http tools.
- `just-bash` enables the exec-capable bash sandbox.
- `@opentelemetry/api` connects harness spans to an existing OpenTelemetry
  context.

## Package Format

This package is ESM-only and ships compiled JavaScript plus TypeScript
declarations from `dist/`. Source files, tests, source maps, and local configs
are not included in the published package.
