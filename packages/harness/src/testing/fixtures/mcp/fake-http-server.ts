import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import * as z from 'zod/v4'

export interface FakeHttpMcpServer {
  url: string
  close(): Promise<void>
}

export interface FakeHttpMcpServerOptions {
  requiredHeaders?: Record<string, string>
}

export async function startFakeHttpMcpServer(options: FakeHttpMcpServerOptions = {}): Promise<FakeHttpMcpServer> {
  const transports = new Map<string, StreamableHTTPServerTransport>()
  const server = createServer(async (req, res) => {
    if (!headersMatch(req, options.requiredHeaders ?? {})) {
      res.writeHead(401, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'unauthorized' }))
      return
    }
    if (req.url !== '/mcp') {
      res.writeHead(404).end()
      return
    }
    if (req.method === 'GET') {
      res.writeHead(405, { allow: 'POST' }).end('Method Not Allowed')
      return
    }
    if (req.method !== 'POST' && req.method !== 'DELETE') {
      res.writeHead(405, { allow: 'POST, DELETE' }).end('Method Not Allowed')
      return
    }
    await handleMcpRequest(req, res, transports)
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Fake MCP server did not bind to a TCP port.')

  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    close: async () => {
      await Promise.allSettled([...transports.values()].map((transport) => transport.close()))
      await closeServer(server)
    }
  }
}

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse, transports: Map<string, StreamableHTTPServerTransport>): Promise<void> {
  const parsedBody = req.method === 'POST' ? await readJson(req) : undefined
  const sessionId = req.headers['mcp-session-id']
  let transport = typeof sessionId === 'string' ? transports.get(sessionId) : undefined

  if (!transport && parsedBody !== undefined && isInitializeRequest(parsedBody)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (id) => { if (transport) transports.set(id, transport) }
    })
    await createFakeMcpServer().connect(transport as never)
  }

  if (!transport) {
    res.writeHead(400, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'missing or invalid MCP session' }))
    return
  }

  await transport.handleRequest(req, res, parsedBody)
}

function createFakeMcpServer(): McpServer {
  const server = new McpServer({ name: 'purista-fake-http-mcp', version: '0.0.0' })
  server.registerTool('echo', {
    description: 'Echoes a message as structured content.',
    inputSchema: {
      message: z.string(),
      delayMs: z.number().optional()
    },
    outputSchema: {
      echo: z.string()
    }
  }, async ({ message, delayMs }) => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
    const structuredContent = { echo: message }
    return {
      content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
      structuredContent
    }
  })
  return server
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : undefined
}

function headersMatch(req: IncomingMessage, required: Record<string, string>): boolean {
  return Object.entries(required).every(([name, value]) => req.headers[name.toLowerCase()] === value)
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}
