import { describe, expect, it } from 'vitest'
import { SandboxError, SandboxNoExecutorError } from '../src/errors/index.js'
import { inMemorySandbox, type SnapshotCapableSandbox, type ResumeCapableSandbox, type HibernateCapableSandbox } from '../src/sandbox/index.js'
import { fakeSnapshotSandbox, sandboxSnapshotContract } from '../src/testing/sandboxSnapshot.js'

describe('fakeSnapshotSandbox', () => {
  sandboxSnapshotContract(() => fakeSnapshotSandbox())

  it('creates snapshot ids', async () => {
    const sandbox = fakeSnapshotSandbox()
    const session = await sandbox.open({ sessionId: 's1', runId: 'r1' })
    await session.write('/workspace/a.txt', 'hello')

    const snapshot = await sandbox.snapshot(session)

    expect(snapshot.snapshotId).toMatch(/^snapshot_/)
    expect(snapshot.metadata?.sessionId).toBe('s1')
  })

  it('resumes a usable session from a snapshot', async () => {
    const sandbox = fakeSnapshotSandbox()
    const session = await sandbox.open({ sessionId: 's1', runId: 'r1' })
    await session.write('/workspace/a.txt', 'hello')
    const snapshot = await sandbox.snapshot(session)

    const resumed = await sandbox.resume({ snapshotId: snapshot.snapshotId, sessionId: 's2', runId: 'r2' })

    await resumed.write('/workspace/b.txt', 'world')
    expect(await resumed.readText('/workspace/a.txt')).toBe('hello')
    expect(await resumed.readText('/workspace/b.txt')).toBe('world')
  })

  it('throws SandboxError for unknown snapshots', async () => {
    const sandbox = fakeSnapshotSandbox()

    await expect(sandbox.resume({ snapshotId: 'snapshot_missing', sessionId: 's1', runId: 'r1' }))
      .rejects.toBeInstanceOf(SandboxError)
  })

  it('hibernates by snapshotting and closing the active session', async () => {
    const sandbox = fakeSnapshotSandbox()
    const session = await sandbox.open({ sessionId: 's1', runId: 'r1' })
    await session.write('/workspace/a.txt', 'hello')

    const snapshot = await sandbox.hibernate(session)

    await expect(session.readText('/workspace/a.txt')).rejects.toBeInstanceOf(SandboxError)
    const resumed = await sandbox.resume({ snapshotId: snapshot.snapshotId, sessionId: 's2', runId: 'r2' })
    expect(await resumed.readText('/workspace/a.txt')).toBe('hello')
  })
})

describe('regular sandbox adapters', () => {
  it('remain valid without snapshot capabilities', async () => {
    const sandbox = inMemorySandbox()
    const session = await sandbox.open({ sessionId: 's1', runId: 'r1' })

    expect('snapshot' in sandbox).toBe(false)
    expect('resume' in sandbox).toBe(false)
    expect('hibernate' in sandbox).toBe(false)
    expect(session.executor).toBe('unavailable')
    await expect(session.exec('echo hi')).rejects.toBeInstanceOf(SandboxNoExecutorError)
  })

  it('allows adapters to opt into snapshot, resume, and hibernate independently', () => {
    const sandbox = fakeSnapshotSandbox()

    expect(sandbox).toMatchObject<SnapshotCapableSandbox & ResumeCapableSandbox & HibernateCapableSandbox>({
      snapshot: expect.any(Function),
      resume: expect.any(Function),
      hibernate: expect.any(Function)
    })
  })
})
