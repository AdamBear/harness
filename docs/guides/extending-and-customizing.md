# Extending And Customizing

Extend the harness by adding adapters, tools, skills, and workflows behind the
same session API.

## Extension Points

```mermaid
flowchart TD
  Harness["defineHarness"] --> Model["ModelProvider adapter"]
  Harness --> State["StateStore adapter"]
  Harness --> Sandbox["Sandbox adapter"]
  Harness --> Tools["TypeScript and MCP tools"]
  Harness --> Skills["Skill directories"]
  Harness --> Workflows["Workflow handlers"]
```

## Add A Model Provider Adapter

Implement `ModelProvider` or extend `BaseModelProvider`.

Adapter responsibilities:

- translate harness requests to the provider SDK;
- map content, tool calls, token usage, and finish reasons;
- pass through provider SDK options where possible;
- let `BaseModelProvider` handle timeout, cancellation, logging, tracing, and
  normalized errors.

## Add A State Store Adapter

Implement `StateStore` when sessions, runs, messages, and events must outlive
the process.

Durable adapters should pass the shared state-store contract tests.

## Add A Sandbox Adapter

Implement `Sandbox` and `SandboxSession` when you need stronger isolation,
containers, remote execution, or custom filesystem policy.

Sandbox sessions must make executor availability explicit:

- `executor: 'unavailable'` for file-only sessions;
- `executor: 'available'` when `exec(...)` is supported.

## Add TypeScript Tools

```ts
.tools({
  policy_lookup: {
    description: 'Look up a short policy by topic.',
    input: z.object({ topic: z.string() }),
    output: z.object({ text: z.string() }),
    handler: async (ctx, input) => {
      ctx.logger.info('Looking up policy.', { tool_id: ctx.toolId })
      return { text: `Policy for ${input.topic}` }
    }
  }
})
```

Rules:

- validate input and output with schemas;
- return JSON-compatible data;
- respect `ctx.signal`;
- use `ctx.sandbox` for sandboxed file/exec operations;
- avoid leaking secrets in logs.

## Add MCP Tools

Use [MCP Tools](./mcp-tools.md) for exact stdio/HTTP setup. Summary:

- `mcp_stdio` runs through the sandbox executor and supports `install`;
- `mcp_http` calls a remote MCP endpoint;
- both validate schemas and normalize outputs.

## Add Skills

A skill directory contains `SKILL.md` with frontmatter:

```md
---
name: incident-responder
description: Incident response writing guidance.
---

Use concise incident summaries with owner, impact, timeline, and next action.
```

Register it:

```ts
.skills({
  'incident-responder': { directory: './skills/incident-responder' }
})
```

Mount skills only on agents that need them.

## Add Workflows

Use workflows for orchestration:

```ts
.workflows(({ workflow }) => ({
  review_incident: workflow({
    input: z.object({ incident: z.string() }),
    output: z.object({ summary: z.string(), needsReview: z.boolean() }),
    handler: async (ctx) => {
      const summary = await ctx.agents.incident_writer({ incident: ctx.input.incident })
      return { ...summary, needsReview: true }
    }
  })
}))
```

Keep business sequencing in workflows. Keep reusable model behavior in agents.
