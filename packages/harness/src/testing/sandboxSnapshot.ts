import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SandboxError, SandboxNoExecutorError } from '../errors/index.js'
import type { DirEntry, ExecResult, FileStat } from '../harness/types.js'
import type {
  HibernateCapableSandbox,
  ResumeCapableSandbox,
  Sandbox,
  SandboxResumeOptions,
  SandboxSession,
  SnapshotCapableSandbox,
  SnapshotResult
} from '../sandbox/index.js'

type SnapshotSandbox = Sandbox<readonly ['sandbox.fs', 'sandbox.snapshot', 'sandbox.resume', 'sandbox.hibernate']> & SnapshotCapableSandbox & ResumeCapableSandbox & HibernateCapableSandbox
type FakeNode = { kind: 'file'; data: Uint8Array; modifiedAt: string } | { kind: 'directory'; modifiedAt: string }

function now(): string { return new Date().toISOString() }

function cloneNode(node: FakeNode): FakeNode {
  return node.kind === 'file'
    ? { kind: 'file', data: new Uint8Array(node.data), modifiedAt: node.modifiedAt }
    : { kind: 'directory', modifiedAt: node.modifiedAt }
}

function cloneFs(fs: ReadonlyMap<string, FakeNode>): Map<string, FakeNode> {
  return new Map([...fs.entries()].map(([key, node]) => [key, cloneNode(node)]))
}

function normalizePath(input: string): string {
  if (!input.startsWith('/')) throw new SandboxError('Invalid path', { reason: 'invalid_path' })
  const normalized = path.posix.normalize(input)
  if (!normalized.startsWith('/')) throw new SandboxError('Invalid path', { reason: 'invalid_path' })
  return normalized
}

class FakeSnapshotSandboxSession implements SandboxSession {
  readonly executor = 'unavailable' as const
  private closed = false
  private fs: Map<string, FakeNode>

  public constructor(
    public readonly sessionId: string,
    public readonly runId: string,
    fs?: ReadonlyMap<string, FakeNode>
  ) {
    this.fs = fs ? cloneFs(fs) : new Map([['/', { kind: 'directory', modifiedAt: now() }]])
  }

  public snapshotFs(): Map<string, FakeNode> {
    this.assertOpen()
    return cloneFs(this.fs)
  }

  private assertOpen(): void {
    if (this.closed) throw new SandboxError('Sandbox session is closed.', { reason: 'session_closed' })
  }

  private ensureParent(filePath: string): void {
    const parts = normalizePath(filePath).split('/').filter(Boolean)
    let current = '/'
    for (let i = 0; i < parts.length - 1; i += 1) {
      current = current === '/' ? `/${parts[i]}` : `${current}/${parts[i]}`
      if (!this.fs.has(current)) this.fs.set(current, { kind: 'directory', modifiedAt: now() })
    }
  }

  async read(filePath: string): Promise<Uint8Array> {
    this.assertOpen()
    const node = this.fs.get(normalizePath(filePath))
    if (!node || node.kind !== 'file') throw new SandboxError('File not found', { reason: 'fs_failed' })
    return new Uint8Array(node.data)
  }

  async readText(filePath: string): Promise<string> {
    return new TextDecoder().decode(await this.read(filePath))
  }

  async write(filePath: string, data: Uint8Array | string): Promise<void> {
    this.assertOpen()
    const p = normalizePath(filePath)
    this.ensureParent(p)
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
    this.fs.set(p, { kind: 'file', data: bytes, modifiedAt: now() })
  }

  async remove(filePath: string, opts?: { recursive?: boolean }): Promise<void> {
    this.assertOpen()
    const p = normalizePath(filePath)
    if (opts?.recursive) {
      for (const key of [...this.fs.keys()]) {
        if (key === p || key.startsWith(`${p}/`)) this.fs.delete(key)
      }
      return
    }
    this.fs.delete(p)
  }

  async list(rootPath: string, opts?: { recursive?: boolean; glob?: string }): Promise<DirEntry[]> {
    this.assertOpen()
    const root = normalizePath(rootPath)
    const out: DirEntry[] = []
    for (const [entryPath, node] of this.fs.entries()) {
      if (entryPath === root) continue
      if (!entryPath.startsWith(root === '/' ? '/' : `${root}/`)) continue
      const relative = root === '/' ? entryPath.slice(1) : entryPath.slice(root.length + 1)
      if (!opts?.recursive && relative.includes('/')) continue
      if (opts?.glob && !new RegExp(opts.glob.replaceAll('.', '\\.').replaceAll('*', '.*')).test(entryPath)) continue
      out.push({
        name: entryPath.split('/').at(-1) ?? '',
        path: entryPath,
        kind: node.kind,
        ...(node.kind === 'file' ? { size: node.data.byteLength } : {})
      })
    }
    return out.sort((a, b) => a.path.localeCompare(b.path))
  }

  async stat(filePath: string): Promise<FileStat> {
    this.assertOpen()
    const node = this.fs.get(normalizePath(filePath))
    if (!node) throw new SandboxError('Path not found', { reason: 'fs_failed' })
    return { kind: node.kind, size: node.kind === 'file' ? node.data.byteLength : 0, modifiedAt: node.modifiedAt }
  }

  async exists(filePath: string): Promise<boolean> {
    this.assertOpen()
    return this.fs.has(normalizePath(filePath))
  }

  async mount(files: ReadonlyMap<string, Uint8Array | string>, atPath: string): Promise<void> {
    this.assertOpen()
    const base = normalizePath(atPath)
    for (const [rel, data] of files.entries()) {
      const relNorm = rel.startsWith('/') ? rel.slice(1) : rel
      await this.write(`${base}/${relNorm}`, data)
    }
  }

  async exec(): Promise<ExecResult> {
    this.assertOpen()
    throw new SandboxNoExecutorError('Sandbox executor unavailable.', { session_id: this.sessionId })
  }

  async close(): Promise<void> {
    this.closed = true
  }
}

/** Deterministic in-memory sandbox fixture that implements snapshot/resume/hibernate. */
export function fakeSnapshotSandbox(): SnapshotSandbox {
  let nextSnapshot = 1
  const snapshots = new Map<string, { fs: Map<string, FakeNode>; metadata: Record<string, unknown> }>()

  function assertFakeSession(session: SandboxSession): FakeSnapshotSandboxSession {
    if (!(session instanceof FakeSnapshotSandboxSession)) {
      throw new SandboxError('Snapshot helper received an unknown session implementation.', { reason: 'invalid_session' })
    }
    return session
  }

  return {
    capabilities: ['sandbox.fs', 'sandbox.snapshot', 'sandbox.resume', 'sandbox.hibernate'],
    async open(opts: { sessionId: string; runId: string }) {
      return new FakeSnapshotSandboxSession(opts.sessionId, opts.runId)
    },
    async snapshot(session: SandboxSession): Promise<SnapshotResult> {
      const fakeSession = assertFakeSession(session)
      const snapshotId = `snapshot_${nextSnapshot}`
      nextSnapshot += 1
      const metadata = { sessionId: fakeSession.sessionId, runId: fakeSession.runId }
      snapshots.set(snapshotId, { fs: fakeSession.snapshotFs(), metadata })
      return { snapshotId, metadata }
    },
    async resume(opts: SandboxResumeOptions): Promise<SandboxSession> {
      const snapshot = snapshots.get(opts.snapshotId)
      if (!snapshot) {
        throw new SandboxError('Snapshot not found.', { reason: 'unknown_snapshot' })
      }
      return new FakeSnapshotSandboxSession(opts.sessionId, opts.runId, snapshot.fs)
    },
    async hibernate(session: SandboxSession): Promise<SnapshotResult> {
      const snapshot = await this.snapshot(session)
      await session.close()
      return snapshot
    }
  }
}

/** Contract tests for adapters that opt into sandbox snapshot/resume support. */
export function sandboxSnapshotContract(make: () => SnapshotSandbox | Promise<SnapshotSandbox>): void {
  describe('sandboxSnapshotContract', () => {
    it('creates snapshot ids', async () => {
      const sandbox = await make()
      const session = await sandbox.open({ sessionId: 'contract-s1', runId: 'contract-r1' })
      await session.write('/workspace/a.txt', 'hello')

      const snapshot = await sandbox.snapshot(session as SandboxSession)

      expect(snapshot.snapshotId).toEqual(expect.any(String))
      expect(snapshot.snapshotId.length).toBeGreaterThan(0)
    })

    it('resumes a usable session from a snapshot', async () => {
      const sandbox = await make()
      const session = await sandbox.open({ sessionId: 'contract-s1', runId: 'contract-r1' })
      await session.write('/workspace/a.txt', 'hello')
      const snapshot = await sandbox.snapshot(session as SandboxSession)

      const resumed = await sandbox.resume({ snapshotId: snapshot.snapshotId, sessionId: 'contract-s2', runId: 'contract-r2' })

      expect(await resumed.readText('/workspace/a.txt')).toBe('hello')
      await resumed.write('/workspace/b.txt', 'world')
      expect(await resumed.readText('/workspace/b.txt')).toBe('world')
    })

    it('throws SandboxError for unknown snapshots', async () => {
      const sandbox = await make()

      await expect(sandbox.resume({ snapshotId: 'snapshot_missing', sessionId: 'contract-s1', runId: 'contract-r1' }))
        .rejects.toBeInstanceOf(SandboxError)
    })

    it('hibernates by snapshotting and closing the active session', async () => {
      const sandbox = await make()
      const session = await sandbox.open({ sessionId: 'contract-s1', runId: 'contract-r1' })
      await session.write('/workspace/a.txt', 'hello')

      const snapshot = await sandbox.hibernate(session as SandboxSession)

      await expect(session.readText('/workspace/a.txt')).rejects.toBeInstanceOf(SandboxError)
      const resumed = await sandbox.resume({ snapshotId: snapshot.snapshotId, sessionId: 'contract-s2', runId: 'contract-r2' })
      expect(await resumed.readText('/workspace/a.txt')).toBe('hello')
    })
  })
}
