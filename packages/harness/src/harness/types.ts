import { z } from 'zod'
import type { Logger } from '../logger/index.js'
import type { TelemetryShim } from '../telemetry/index.js'
import type { HarnessAdapterContext } from '../ports/harness-context.js'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface ExecOptions { cwd?: string; env?: Record<string, string>; stdin?: string; timeoutMs?: number; signal?: AbortSignal }
export interface ExecResult { stdout: string; stderr: string; exitCode: number; durationSeconds: number }
export interface DirEntry { name: string; path: string; kind: 'file' | 'directory'; size?: number }
export interface FileStat { kind: 'file' | 'directory'; size: number; modifiedAt: string }

export interface SandboxSession {
  read(path: string): Promise<Uint8Array>
  readText(path: string, encoding?: 'utf-8'): Promise<string>
  write(path: string, data: Uint8Array | string): Promise<void>
  remove(path: string, opts?: { recursive?: boolean }): Promise<void>
  list(path: string, opts?: { recursive?: boolean; glob?: string }): Promise<DirEntry[]>
  stat(path: string): Promise<FileStat>
  exists(path: string): Promise<boolean>
  mount(files: ReadonlyMap<string, Uint8Array | string>, atPath: string): Promise<void>
  readonly executor: 'available' | 'unavailable'
  exec(command: string, opts?: ExecOptions): Promise<ExecResult>
  close(): Promise<void>
}

export interface Sandbox { open(opts: { sessionId: string; runId: string; signal?: AbortSignal }): Promise<SandboxSession> }

export type BuiltinToolName = 'bash' | 'read' | 'write' | 'edit' | 'glob' | 'grep' | 'list'

export interface ToolCallSpec { id: string; name: string; arguments: JsonValue }
export interface ModelToolSpec { name: string; description: string; parameters: JsonValue }
export interface ModelMessage { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; toolCalls?: ToolCallSpec[]; toolCallId?: string }
export interface TokenUsage { inputTokens: number; outputTokens: number; totalTokens: number }
export interface JsonResponse { data?: JsonValue; toolCalls?: ToolCallSpec[]; usage: TokenUsage }

export interface ModelProvider {
  json(req: { model: string; instructions: string; messages: ModelMessage[]; tools: ModelToolSpec[]; outputSchema: JsonValue; signal: AbortSignal }): Promise<JsonResponse>
}

export interface ModelAlias { provider: ModelProvider; model: string; capabilities?: ReadonlyArray<'json' | 'tool_use'> }

export interface ToolHandlerContext { signal: AbortSignal; sandbox: SandboxSession; logger: Logger; telemetry: TelemetryShim; runId: string; sessionId: string; agentId: string; toolId: string }

export interface TsToolDefinition<I extends z.ZodTypeAny = z.ZodTypeAny, O extends z.ZodTypeAny = z.ZodTypeAny> {
  kind?: 'ts'
  description: string
  input: I
  output: O
  handler: (ctx: ToolHandlerContext, input: z.infer<I>) => Promise<z.infer<O>>
  configureHarnessContext?: (context: HarnessAdapterContext) => void
}
export interface SkillDefinition { directory: string }

export interface SessionMemory {
  read<T = unknown>(key: string): Promise<T | undefined>
  write(key: string, value: JsonValue): Promise<void>
  delete(key: string): Promise<void>
  list(): Promise<string[]>
}
export interface ConversationHistory { list(opts?: { limit?: number; before?: string }): Promise<Message[]> }

export type PermissionMode = 'allow' | 'ask' | 'deny'
export interface PermissionPolicy { mode: PermissionMode; allow?: readonly string[]; deny?: readonly string[] }
export interface AgentPermissions { bash?: PermissionMode | PermissionPolicy; write?: PermissionMode | PermissionPolicy; edit?: PermissionMode | PermissionPolicy }
export interface PermissionContext { toolName: string; input: unknown; agentId: string; runId: string; sessionId: string }
export type PermissionDecision = 'allow' | 'deny'
export type OnPermission = (ctx: PermissionContext) => Promise<PermissionDecision>

export interface AgentContextMinimal<S extends { models: Record<string, unknown>; tools: Record<string, unknown>; skills: Record<string, unknown>; agents: Record<string, unknown>; workflows: Record<string, unknown> }, I> { input: I; sessionId: string; runId: string; history: ConversationHistory; memory: SessionMemory }
export interface ResolvedSkill { name: string; description: string; version?: string; directory: string }

export interface AgentDefinition<S extends { models: Record<string, unknown>; tools: Record<string, unknown>; skills: Record<string, unknown>; agents: Record<string, unknown>; workflows: Record<string, unknown> }, I extends z.ZodTypeAny = z.ZodTypeAny, O extends z.ZodTypeAny = z.ZodTypeAny> {
  input?: I
  output?: O
  model: keyof S['models'] & string
  instructions: string | ((ctx: AgentContextMinimal<S, z.infer<I>>) => string)
  tools?: readonly (keyof S['tools'] & string)[]
  builtinTools?: readonly BuiltinToolName[] | false
  skills?: readonly (keyof S['skills'] & string)[]
  permissions?: AgentPermissions
  onPermission?: OnPermission
  maxSteps?: number
}

export interface WorkflowContext<S extends { agents: Record<string, unknown> }, I> {
  input: I
  agents: { [K in keyof S['agents']]: (input: unknown, opts?: InvokeOptions) => Promise<unknown> }
  signal: AbortSignal
  runId: string
  sessionId: string
}

export interface WorkflowDefinition<S extends { agents: Record<string, unknown> }, I extends z.ZodTypeAny = z.ZodTypeAny, O extends z.ZodTypeAny = z.ZodTypeAny> {
  input?: I
  output?: O
  handler: (ctx: WorkflowContext<S, z.infer<I>>) => Promise<z.infer<O>>
}

export interface HarnessDefaults { toolTimeoutMs?: number; runTimeoutMs?: number; historyWindow?: number }
export interface HarnessOptions { defaults?: HarnessDefaults }

export interface InvokeOptions { signal?: AbortSignal; timeoutMs?: number; historyWindow?: number }

export type RunEvent =
  | { type: 'run.started'; runId: string; at: string }
  | { type: 'run.finished'; runId: string; at: string; output?: JsonValue; error?: SerializedError }
  | { type: 'agent.started'; runId: string; agentId: string; at: string }
  | { type: 'agent.finished'; runId: string; agentId: string; at: string; output?: JsonValue; error?: SerializedError }
  | { type: 'tool.started'; runId: string; agentId: string; toolId: string; callId: string; input: JsonValue }
  | { type: 'tool.finished'; runId: string; agentId: string; toolId: string; callId: string; output?: JsonValue; error?: SerializedError }
  | { type: 'model.message'; runId: string; agentId: string; message: Message }

export interface SerializedError { code: string; category: string; retriable: boolean; message: string; meta?: Record<string, JsonValue> }

export interface Message {
  id: string
  sessionId: string
  runId?: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ToolCallSpec[]
  toolResults?: Array<{ toolCallId: string; output?: JsonValue; error?: SerializedError }>
  timestamp: string
}

export interface Harness<S extends { workflows: Record<string, unknown> }> { getSession(id: string): Promise<Session<S>>; shutdown(): Promise<{ errors: Error[] }>; readonly $infer: Record<string, never> }
export interface Session<S extends { workflows: Record<string, unknown> }> {
  id: string
  workflows: { readonly [K in keyof S['workflows']]: { prompt(input: unknown, opts?: InvokeOptions): Promise<unknown>; stream(input: unknown, opts?: InvokeOptions): AsyncIterable<RunEvent> } }
  memory: SessionMemory
  history: ConversationHistory
  clearHistory(): Promise<void>
  replaceHistory(messages: ReadonlyArray<Omit<Message, 'id' | 'timestamp'>>): Promise<void>
  close(): Promise<void>
}
