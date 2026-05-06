import { SpanStatusCode } from '@opentelemetry/api'
import { expect, it } from 'vitest'

import { runTelemetryFlowHarness } from './telemetryFlowHarness.js'

it('emits a traceable session workflow agent model tool flow', async () => {
  const { session, telemetry } = await runTelemetryFlowHarness()

  await expect(session.workflows.wf.prompt('find the policy')).resolves.toEqual({ answer: 'Policy says yes.' })

  const sessionSpan = telemetry.spans.find((span) => span.name === 'harness.session.prompt')
  const workflowSpan = telemetry.spans.find((span) => span.name === 'harness.workflow.run')
  const agentSpan = telemetry.spans.find((span) => span.name === 'invoke_agent responder')
  const modelSpans = telemetry.spans.filter((span) => span.name === 'chat fake')
  const toolSpan = telemetry.spans.find((span) => span.name === 'execute_tool policy_lookup')

  expect(sessionSpan).toBeDefined()
  expect(workflowSpan?.parentId).toBe(sessionSpan?.id)
  expect(agentSpan?.parentId).toBe(workflowSpan?.id)
  expect(modelSpans.at(0)?.parentId).toBe(agentSpan?.id)
  expect(toolSpan?.parentId).toBe(agentSpan?.id)
  expect(modelSpans.at(1)?.parentId).toBe(agentSpan?.id)
  expect(toolSpan?.attrs).toMatchObject({
    'harness.session.id': 'telemetry-session',
    'harness.workflow.id': 'wf',
    'harness.agent.id': 'responder',
    'gen_ai.tool.name': 'policy_lookup'
  })
  expect(modelSpans.at(0)?.attrs).toMatchObject({
    'harness.model.alias': 'fast',
    'gen_ai.system': 'fake',
    'gen_ai.request.model': 'fake'
  })
  expect(modelSpans.at(1)?.attrs['gen_ai.usage.total_tokens']).toBe(3)
})

it('marks failing spans with standard OTel error status and safe error attributes', async () => {
  const { session, telemetry } = await runTelemetryFlowHarness({ failTool: true })

  await expect(session.workflows.wf.prompt('find the policy')).resolves.toEqual({ answer: 'Policy says yes.' })

  const failed = telemetry.spans.filter((span) => span.status?.code === SpanStatusCode.ERROR)
  expect(failed.map((span) => span.name)).toEqual(['execute_tool policy_lookup'])
  const toolSpan = telemetry.spans.find((span) => span.name === 'execute_tool policy_lookup')
  expect(toolSpan?.attrs).toMatchObject({
    'error.type': 'TOOL_ERROR',
    'harness.error.code': 'TOOL_ERROR',
    'harness.error.category': 'tool',
    'harness.error.retriable': false
  })
})
