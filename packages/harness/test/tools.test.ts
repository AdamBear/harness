import { expect, it } from 'vitest'
import { inMemorySandbox } from '../src/sandbox/index.js'
import { invokeBuiltinTool } from '../src/tools/index.js'
import { SandboxNoExecutorError } from '../src/errors/index.js'

it('dispatches alias and enforces bash availability', async () => {
  const session = await inMemorySandbox().open({ sessionId: 's1', runId: 'r1' })
  await expect(invokeBuiltinTool('Bash', { command: 'echo hi' }, session)).rejects.toBeInstanceOf(SandboxNoExecutorError)
})

it('grep falls back to read+match when executor unavailable', async () => {
  const session = await inMemorySandbox().open({ sessionId: 's1', runId: 'r1' })
  await session.write('/workspace/a.txt', 'hello\nworld\nhello again')
  const result = await invokeBuiltinTool('grep', { pattern: 'hello', path: '/workspace', maxResults: 10 }, session) as { matches: Array<{ path: string }> }
  expect(result.matches.length).toBe(2)
  expect(result.matches.every((m) => m.path === '/workspace/a.txt')).toBe(true)
})
