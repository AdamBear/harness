import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { startFakeHttpMcpServer } from '../../src/testing/fixtures/mcp/fake-http-server.js'

describe('fake MCP fixtures', () => {
  it('ships a deterministic fake stdio server path', () => {
    const path = fileURLToPath(new URL('../../src/testing/fixtures/mcp/fake-stdio-server.mjs', import.meta.url))
    expect(path.endsWith('/packages/harness/src/testing/fixtures/mcp/fake-stdio-server.mjs')).toBe(true)
  })

  it('starts and stops a deterministic local fake HTTP server', async () => {
    const server = await startFakeHttpMcpServer()
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/)
    await server.close()
  })
})
