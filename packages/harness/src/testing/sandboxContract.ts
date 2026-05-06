import { describe, expect, it } from 'vitest'
import { OperationCancelledError, OperationTimeoutError, SandboxNoExecutorError } from '../errors/index.js'
import type { Sandbox } from '../sandbox/index.js'

export function sandboxContract(make: () => Sandbox | Promise<Sandbox>, opts: { executor: 'available' | 'unavailable' }): void {
  describe(`sandboxContract (${opts.executor})`, () => {
    it('open returns expected executor', async () => {
      const sb = await make()
      const session = await sb.open({ sessionId: 's1', runId: 'r1' })
      expect(session.executor).toBe(opts.executor)
    })

    it('read/write/list/stat/exists/remove roundtrip', async () => {
      const sb = await make()
      const session = await sb.open({ sessionId: 's1', runId: 'r1' })
      await session.write('/workspace/a.txt', 'hello')
      expect(await session.readText('/workspace/a.txt')).toBe('hello')
      expect(await session.exists('/workspace/a.txt')).toBe(true)
      const list = await session.list('/workspace')
      expect(list.some((e) => e.path === '/workspace/a.txt')).toBe(true)
      const stat = await session.stat('/workspace/a.txt')
      expect(stat.kind).toBe('file')
      await session.remove('/workspace/a.txt')
      expect(await session.exists('/workspace/a.txt')).toBe(false)
    })

    it('mount works', async () => {
      const sb = await make()
      const session = await sb.open({ sessionId: 's1', runId: 'r1' })
      await session.mount(new Map([['SKILL.md', 'abc']]), '/skills/foo')
      expect(await session.readText('/skills/foo/SKILL.md')).toBe('abc')
    })

    it('rejects relative paths', async () => {
      const sb = await make()
      const session = await sb.open({ sessionId: 's1', runId: 'r1' })
      await expect(session.write('relative.txt', 'x')).rejects.toThrow()
    })

    it('exec availability semantics', async () => {
      const sb = await make()
      const session = await sb.open({ sessionId: 's1', runId: 'r1' })
      if (opts.executor === 'unavailable') {
        await expect(session.exec('echo hi')).rejects.toBeInstanceOf(SandboxNoExecutorError)
      } else {
        const result = await session.exec('echo hi')
        expect(result.stdout).toBe('hi\n')
        expect(result.stderr).toBe('')
        expect(result.exitCode).toBe(0)
        expect(result.durationSeconds).toBeGreaterThanOrEqual(0)
      }
    })

    if (opts.executor === 'available') {
      it('exec honors stdin, env, and cwd options', async () => {
        const sb = await make()
        const session = await sb.open({ sessionId: 's1', runId: 'r1' })
        const result = await session.exec('printf "$GREETING:"; printf "$PWD"; printf ":"; cat', {
          cwd: '/workspace',
          env: { GREETING: 'hello' },
          stdin: 'input'
        })
        expect(result.stdout).toBe('hello:/workspace:input')
        expect(result.exitCode).toBe(0)
      })

      it('exec honors timeoutMs', async () => {
        const sb = await make()
        const session = await sb.open({ sessionId: 's1', runId: 'r1' })
        await expect(session.exec('sleep 1', { timeoutMs: 10 })).rejects.toBeInstanceOf(OperationTimeoutError)
      })

      it('exec honors pre-aborted signals', async () => {
        const sb = await make()
        const session = await sb.open({ sessionId: 's1', runId: 'r1' })
        const controller = new AbortController()
        controller.abort()
        await expect(session.exec('echo hi', { signal: controller.signal })).rejects.toBeInstanceOf(OperationCancelledError)
      })
    }
  })
}
