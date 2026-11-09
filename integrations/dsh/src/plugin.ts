/** Explicit task operations and authorized continuity in one operator-selected Workspace. */

import { randomUUID } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import type { TaskHistoryPage, WorkspaceScope } from '@acmi/contracts'
import { createScopeAuthority } from '@acmi/core'
import { renderObserver } from '@acmi/observer'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'
import Schema from '@deepseek-ai/schemastery'
import { appendPluginRecord, SESSION_FORMAT_VERSION, type Session } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import { DSH_VERSION } from './harness.ts'
import { encodeSegment, generationLogFilename, projectDir, type JsonlCompression } from './journal-format.ts'
import { acmiProjection, taskIdSchema, type AcmiSessionState, type TaskId } from './records.ts'
import { openDshJournal, type DshJournal } from './scoped-read.ts'
import { createDshStorageAdapter } from './storage.ts'

export type HistoryRequest = { readonly limit: number; readonly cursor?: string }
  & ({ readonly taskId: string } | { readonly unresolved: true })

export interface AcmiHistory {
  query(caller: Session, request: HistoryRequest, signal?: AbortSignal): Promise<TaskHistoryPage>
  render(caller: Session, request: HistoryRequest, signal?: AbortSignal): Promise<string>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    acmiHistory: AcmiHistory
  }
}

/** Cordis plugin name. */
export const name = 'acmi'

/** Durable domain, Session journal, replay, and tool registration providers. */
export const inject = ['agents', 'storageDomain', 'sessions', 'sessionPersistence', 'sessionProjections', 'tools']

/** Scope supplied by the deployment, not by a tool caller. */
export interface Config {
  /** Absolute directory that must equal the Session's original working directory. */
  workspaceRoot: string
  /** Canonical, marked journal root for the host's stock dsh JSONL writer. */
  journalRoot: string
  /** Must match the host's native writer. */
  compression: JsonlCompression
  /** Mount only trusted host read services, without model-facing tools. */
  readOnly?: boolean
}

/** Cordis configuration schema. */
export const Config: Schema<Config> = Schema.object({
  workspaceRoot: Schema.string().required(), journalRoot: Schema.string().required(),
  compression: Schema.union(['none', 'zstd']).required(), readOnly: Schema.boolean(),
})

export function assertDshVersion(actual: string): void {
  if (actual !== DSH_VERSION) throw new Error(`ACMI_DSH_VERSION: expected dsh ${DSH_VERSION}`)
}

const LIST_LIMIT = 20
const titleSchema = z.string().max(160).trim().min(1)
const objectiveSchema = z.string().max(1024).trim().min(1)
const taskSchema = z.strictObject({
  workspaceRoot: z.string().refine(isAbsolute),
  title: titleSchema,
  objective: objectiveSchema.optional(),
  sessionId: z.string().min(1),
  sessionCreatedAt: z.number().int().nonnegative(),
  stepStartSeq: z.number().int().nonnegative().nullable().default(null),
  callId: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
})

const registry = defineDomain({
  name: 'acmi_tasks',
  version: 1,
  tables: { tasks: domainTable<TaskId, z.infer<typeof taskSchema>>(taskSchema) },
})

type CreationIdentity = Pick<z.infer<typeof taskSchema>, 'workspaceRoot' | 'sessionId' | 'sessionCreatedAt' | 'stepStartSeq' | 'callId'>

function creationKey(task: CreationIdentity): string {
  return JSON.stringify([task.workspaceRoot, task.sessionId, task.sessionCreatedAt, task.stepStartSeq, task.callId])
}

const taskSummary = {
  type: 'object', additionalProperties: false,
  properties: {
    task_id: { type: 'string', required: true },
    title: { type: 'string', required: true },
  },
} as const

const bindingSummary = {
  type: 'object', additionalProperties: false,
  properties: {
    task_id: { type: 'string', required: true },
    binding_revision: { type: 'integer', required: true },
    effective_from_seq: { type: 'integer', required: true },
  },
} as const

function renderJson(_args: object, value: object): [{ type: 'text'; text: string }] {
  return [{ type: 'text', text: JSON.stringify(value) }]
}

function summarize(binding: NonNullable<AcmiSessionState['binding']>) {
  return { task_id: binding.taskId, binding_revision: binding.revision, effective_from_seq: binding.effectiveFromSeq }
}

/**
 * Load and validate the registry before contributing tools. The owner drains
 * accepted operations before closing storage.
 * @param ctx - owning Cordis context.
 * @param config - trusted workspace scope.
 * @returns after setup settles; the scoped service remains unavailable until its backend is ready.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  assertDshVersion(getDshRuntimeVersion())
  if (SESSION_FORMAT_VERSION !== 4 || typeof ctx.sessionPersistence?.stat !== 'function'
    || typeof ctx.sessions?.flush !== 'function' || typeof ctx.tools?.register !== 'function'
    || typeof ctx.sessionProjections?.register !== 'function' || typeof ctx.agents?.turnBoundaryOf !== 'function'
    || typeof ctx.storageDomain?.open !== 'function') throw new Error('ACMI_DSH_CAPABILITY')
  const journal = await openDshJournal(config.journalRoot, config.workspaceRoot, config.compression)
  return activate(ctx, config, journal)
}

async function activate(ctx: Context, config: Config, journal: DshJournal) {
  const root = config.workspaceRoot
  const backend = ctx.sessionPersistence.identity
  const lifetime = new AbortController()
  const authority = createScopeAuthority()
  const scopeBySession = new WeakMap<Session, WorkspaceScope>()
  let tail = Promise.resolve()
  const projection = config.readOnly === true ? undefined : await ctx.sessionProjections.register(acmiProjection)
  const opening = ctx.storageDomain.open(registry)
  ctx.effect(() => async () => {
    lifetime.abort(new Error('ACMI plugin disposed'))
    await tail
    await opening.then(domain => domain.close(), () => undefined)
  }, 'ACMI registry and tool operations')
  const tasks = (await opening).table('tasks')
  const byCreation = new Map<string, TaskId>()
  for (const [id, task] of tasks.entries()) {
    if (taskIdSchema.safeParse(id).data !== id) throw new Error('ACMI registry contains an invalid task ID')
    const key = creationKey(task)
    if (byCreation.has(key)) throw new Error('ACMI registry contains duplicate creation identities')
    byCreation.set(key, id)
  }

  async function requireWorkspace(session: Session | undefined): Promise<Session> {
    const cwd = session?.header.cwd
    if (session === undefined || cwd !== root || ctx.sessions.get(session.id) !== session
      || ctx.sessionPersistence.identity !== backend || await realpath(root).catch(() => undefined) !== root) {
      throw new Error('ACMI_HISTORY_SCOPE')
    }
    return session
  }

  // Keep the registry check, journal barrier and index publication ordered with disposal.
  function enqueue<T>(cancellation: AbortSignal | undefined, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const signal = cancellation === undefined ? lifetime.signal : AbortSignal.any([cancellation, lifetime.signal])
    const pending = tail.then(async () => {
      signal.throwIfAborted()
      return operation(signal)
    })
    tail = pending.then(() => undefined, () => undefined)
    return pending
  }

  function run<T>(exec: ToolRunContext, operation: (session: Session, signal: AbortSignal) => Promise<T>): Promise<T> {
    return enqueue(exec.signal, async (signal) => {
      const session = await requireWorkspace(exec.agent?.session)
      await requireDurableJournal(session, signal)
      signal.throwIfAborted()
      return operation(session, signal)
    })
  }

  async function requireDurableJournal(session: Session, signal: AbortSignal): Promise<void> {
    const inspected = await journal.inspect(session.id, signal)
    if (inspected?.header.createdAt !== session.header.createdAt) throw new Error('ACMI_DSH_JOURNAL_NOT_READY')
    const persisted = await ctx.sessionPersistence.stat(session.id, { signal })
    const expected = join(projectDir(config.journalRoot, root), encodeSegment(session.id), generationLogFilename(4, config.compression))
    if (persisted?.location?.kind !== 'jsonl' || persisted.location.path !== expected
      || persisted.header.cwd !== root || persisted.header.createdAt !== session.header.createdAt) {
      throw new Error('ACMI_DSH_WRITER_MISMATCH')
    }
  }

  async function flush(session: Session): Promise<void> {
    if (!await ctx.sessions.flush(session)) throw new Error('ACMI requires durable Session storage')
  }

  function requireTask(taskId: TaskId): void {
    if (tasks.get(taskId)?.workspaceRoot !== root) throw new Error('ACMI task not found in this workspace')
  }

  const storage = createDshStorageAdapter({
    authority, workspaceId: journal.partitionId, journal,
    tasks: () => Array.from(tasks.entries()).filter(([, task]) => task.workspaceRoot === root)
      .map(([taskId]) => ({ taskId, workspaceId: journal.partitionId, status: 'open' })),
  })
  async function withScope<T>(caller: Session, signal: AbortSignal, action: (scope: WorkspaceScope) => Promise<T>) {
    await requireWorkspace(caller)
    signal.throwIfAborted()
    let scope = scopeBySession.get(caller)
    if (scope === undefined) {
      scope = authority.grant(journal.partitionId)
      scopeBySession.set(caller, scope)
    }
    const result = await action(scope)
    await requireWorkspace(caller)
    signal.throwIfAborted()
    return result
  }
  function query(scope: WorkspaceScope, request: HistoryRequest, signal: AbortSignal) {
    return storage.queryTaskHistory({
      limit: request.limit,
      ...request.cursor === undefined ? {} : { cursor: request.cursor },
      selector: 'taskId' in request ? { taskId: taskIdSchema.parse(request.taskId) } : { kind: 'unresolved' },
    }, scope, { get cancelled() { return signal.aborted } })
  }
  const history: AcmiHistory = {
    query: (caller, request, signal) => enqueue(signal, active => withScope(caller, active, scope => query(scope, request, active))),
    render: (caller, request, signal) => enqueue(signal, active => withScope(caller, active, scope => renderObserver({
      authority, scope, workspaceId: journal.partitionId,
      readTimeline: async grant => (await query(grant, request, active)).rows.map(row => ({ row })),
    }))),
  }
  ctx.provide('acmiHistory', history)
  if (projection === undefined) return

  ctx.tools.register(defineTool({
    name: 'acmi_task_history',
    description: 'Read recent committed attribution metadata for a task, or unresolved events if no task ID is supplied. Does not bind or read message/tool content.',
    parameters: { task_id: { type: 'string', description: 'Optional existing ACMI task UUID.' } },
    output: { schema: { type: 'string' }, render: (_args, text) => [{ type: 'text', text }] },
    execute: async (args, exec) => {
      const session = await requireWorkspace(exec.agent?.session)
      const selection = args.task_id === undefined ? { unresolved: true } as const : { taskId: args.task_id }
      const result = await history.query(session, { ...selection, limit: LIST_LIMIT }, exec.signal)
      return JSON.stringify({ rows: result.rows, truncated: result.next !== undefined })
    },
  }))

  ctx.tools.register(defineTool({
    name: 'acmi_task_create',
    description: 'Create a new task and return its stable ID. This does not bind the task to this conversation.',
    parameters: {
      title: { type: 'string', required: true, description: 'Nonempty task title, at most 160 characters.' },
      objective: { type: 'string', description: 'Optional task objective, at most 1024 characters.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { ...taskSummary.properties, created: { type: 'boolean', required: true } },
      },
      render: renderJson,
    },
    execute: (args, exec) => run(exec, async (session, signal) => {
      const title = titleSchema.parse(args.title)
      const objective = objectiveSchema.optional().parse(args.objective)
      const identity = {
        workspaceRoot: root,
        sessionId: session.id,
        sessionCreatedAt: session.header.createdAt,
        stepStartSeq: ctx.agents.turnBoundaryOf(session).lastStepStartSeq,
        callId: exec.callId,
      }
      const key = creationKey(identity)
      let taskId = byCreation.get(key)
      const created = taskId === undefined
      if (taskId === undefined) {
        do { taskId = brandString<TaskId>(randomUUID()) } while (tasks.get(taskId) !== undefined)
        await tasks.put(taskId, { ...identity, title, ...(objective === undefined ? {} : { objective }), createdAt: Date.now() })
        byCreation.set(key, taskId)
      } else {
        const task = tasks.get(taskId)
        if (task === undefined) throw new Error('ACMI registry creation identity is missing its task')
        if (task.title !== title || task.objective !== objective) throw new Error('ACMI task create retry has different arguments')
      }
      signal.throwIfAborted()
      if (!projection.stateOf(session).created.includes(taskId)) {
        appendPluginRecord(session, 'plugin:acmi-probe/task-created', { sessionId: session.id, taskId })
      }
      await flush(session)
      return { task_id: taskId, title, created }
    }),
  }))

  ctx.tools.register(defineTool({
    name: 'acmi_task_bind',
    description: 'Explicitly bind subsequent work in this conversation to an existing task ID.',
    parameters: { task_id: { type: 'string', required: true, description: 'Task ID returned by task creation or listing.' } },
    output: { schema: bindingSummary, render: renderJson },
    execute: (args, exec) => run(exec, async (session) => {
      const taskId = taskIdSchema.parse(args.task_id)
      requireTask(taskId)
      const before = projection.stateOf(session).binding
      if (before?.taskId !== taskId) {
        appendPluginRecord(session, 'plugin:acmi-probe/task-binding', { sessionId: session.id, taskId, revision: (before?.revision ?? 0) + 1 })
      }
      const binding = projection.stateOf(session).binding
      if (binding?.taskId !== taskId) throw new Error('ACMI binding did not reach the Session projection')
      await flush(session)
      return summarize(binding)
    }),
  }))

  ctx.tools.register(defineTool({
    name: 'acmi_task_list',
    description: 'List up to 20 existing tasks in this workspace and show the current conversation binding.',
    parameters: {},
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          tasks: { type: 'array', items: taskSummary, required: true },
          binding: { oneOf: [bindingSummary, { type: 'null' }], required: true },
          truncated: { type: 'boolean', required: true },
        },
      },
      render: renderJson,
    },
    execute: (_args, exec) => run(exec, async (session) => {
      const binding = projection.stateOf(session).binding
      if (binding !== null) {
        requireTask(binding.taskId)
        await flush(session)
      }
      const recent = Array.from(tasks.entries())
        .filter(([, task]) => task.workspaceRoot === root)
        .sort(([a, left], [b, right]) => right.createdAt - left.createdAt || a.localeCompare(b))
      return {
        tasks: recent.slice(0, LIST_LIMIT).map(([task_id, task]) => ({ task_id, title: task.title })),
        binding: binding === null ? null : summarize(binding),
        truncated: recent.length > LIST_LIMIT,
      }
    }),
  }))
}
