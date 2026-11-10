import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type { GraphAppendReceipt, GraphEventDraft, RuntimeCursor, RuntimeSessionRef, ScopeAuthority } from '@acmi/contracts'
import { boundedText, canonical, exactFields, isTaskId, runtimeIdentity } from '@acmi/core'
import { GraphStoreError, translateGraphError } from './graph-store-db.ts'
import { continuityDigest as sha } from './local-digest.ts'

export interface TaskLifecycleHostOptions {
  readonly operatorAuthority: Pick<ScopeAuthority, 'permits'>
  /** Resolve an operator-selected, live Session and its next native event sequence. */
  readonly currentSession: (sessionId: string) => { readonly session: RuntimeSessionRef; readonly nextSourceSeq: number } | null
}

type Operation = { readonly operationId: string }
export type TaskLifecycleCommand = Operation & (
  | { readonly kind: 'create'; readonly objective: string; readonly criteria: readonly string[] }
  | { readonly kind: 'switch'; readonly taskId: string }
  | { readonly kind: 'bind'; readonly taskId: string; readonly expectedRevision: number }
  | { readonly kind: 'unbind'; readonly expectedRevision: number }
)
export interface TaskLifecycleState {
  readonly selectedTaskId: string | null
  readonly binding: { readonly taskId: string | null; readonly revision: number }
}
type ReceiptBase = Operation & {
  readonly version: 'host-task-lifecycle-v1'
  readonly workspaceId: string
  readonly session: RuntimeSessionRef
  readonly ordinal: number
  readonly commandHash: string
  readonly committedAt: string
  readonly before: TaskLifecycleState
  readonly after: TaskLifecycleState
}
export type TaskLifecycleReceipt = ReceiptBase & (
  | { readonly kind: 'create'; readonly taskId: string; readonly graphRevision: string }
  | { readonly kind: 'switch'; readonly taskId: string }
  | { readonly kind: 'bind'; readonly taskId: string; readonly effectiveFrom: number }
  | { readonly kind: 'unbind'; readonly taskId: null; readonly effectiveFrom: number }
)
declare const confirmationBrand: unique symbol
export type TaskLifecycleConfirmation = { readonly [confirmationBrand]: never }
export interface TaskLifecycleHost {
  confirm(session: RuntimeSessionRef, command: TaskLifecycleCommand): TaskLifecycleConfirmation
  execute(confirmation: TaskLifecycleConfirmation): TaskLifecycleReceipt
  state(session: RuntimeSessionRef): TaskLifecycleState
  history(session: RuntimeSessionRef, after?: number, limit?: number): readonly TaskLifecycleReceipt[]
}

type Confirmed = { session: RuntimeSessionRef; command: TaskLifecycleCommand; nextSourceSeq: number }
type BindingReceipt = Extract<TaskLifecycleReceipt, { kind: 'bind' | 'unbind' }>
type Row = Record<string, unknown>
type Store = {
  db: DatabaseSync
  workspaceId: string
  authorize(): void
  currentSession: TaskLifecycleHostOptions['currentSession']
  tx<T>(fn: () => T): T
  nativeCursor(session: string): RuntimeCursor
  activeTask(taskId: string): boolean
  append(taskId: string, draft: GraphEventDraft): GraphAppendReceipt
}

const fail = (code: GraphStoreError['code']): never => { throw new GraphStoreError(code) }
const natural = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
const operationId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,128}$/u.test(value)
const taskOrNull = (value: unknown): value is string | null => value === null || isTaskId(value)
const bindingChange = (receipt: TaskLifecycleReceipt): receipt is BindingReceipt => receipt.kind === 'bind' || receipt.kind === 'unbind'
const initialState = (): TaskLifecycleState => ({ selectedTaskId: null, binding: { taskId: null, revision: 0 } })

function validSession(value: unknown, workspaceId: string): value is RuntimeSessionRef {
  return exactFields(value, ['adapterId', 'instanceId', 'sessionId', 'incarnation']) && value.adapterId === 'dsh'
    && value.instanceId === workspaceId && boundedText(value.sessionId) && typeof value.incarnation === 'string'
    && /^(?:0|[1-9][0-9]{0,15})$/u.test(value.incarnation) && natural(Number(value.incarnation))
}

function validCommand(value: unknown): value is TaskLifecycleCommand {
  if (!exactFields(value, ['kind', 'operationId', 'objective', 'criteria', 'taskId', 'expectedRevision'])
    || !operationId(value.operationId)) return false
  switch (value.kind) {
    case 'create': return exactFields(value, ['kind', 'operationId', 'objective', 'criteria']) && boundedText(value.objective, 4096)
      && value.objective.trim().length > 0 && Array.isArray(value.criteria) && value.criteria.length > 0 && value.criteria.length <= 16
      && Array.from(value.criteria).every(item => boundedText(item, 1024) && item.trim().length > 0)
    case 'switch': return exactFields(value, ['kind', 'operationId', 'taskId']) && isTaskId(value.taskId)
    case 'bind': return exactFields(value, ['kind', 'operationId', 'taskId', 'expectedRevision'])
      && isTaskId(value.taskId) && natural(value.expectedRevision)
    case 'unbind': return exactFields(value, ['kind', 'operationId', 'expectedRevision']) && natural(value.expectedRevision)
    default: return false
  }
}

const stateValid = (v: unknown): v is TaskLifecycleState => exactFields(v, ['selectedTaskId', 'binding']) && taskOrNull(v.selectedTaskId)
  && exactFields(v.binding, ['taskId', 'revision']) && taskOrNull(v.binding.taskId) && natural(v.binding.revision)
  && (v.binding.revision > 0 || v.binding.taskId === null)

export function hasTaskLifecycleLedger(db: DatabaseSync): boolean {
  return db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='task_lifecycle_receipt'").get() !== undefined
}

export function enableTaskLifecycle(db: DatabaseSync): void {
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS task_lifecycle_receipt (
      session TEXT NOT NULL, ordinal INTEGER NOT NULL, operation_key TEXT NOT NULL,
      binding_revision INTEGER, effective_seq INTEGER, body TEXT NOT NULL, hash TEXT NOT NULL,
      PRIMARY KEY(session, ordinal), UNIQUE(session, operation_key), UNIQUE(session, binding_revision),
      CHECK(ordinal>0), CHECK((binding_revision IS NULL AND effective_seq IS NULL)
        OR (binding_revision IS NOT NULL AND binding_revision>0 AND effective_seq IS NOT NULL AND effective_seq>=0))
    ) STRICT, WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS task_lifecycle_boundary
      ON task_lifecycle_receipt(session, effective_seq DESC, binding_revision DESC) WHERE effective_seq IS NOT NULL;
    COMMIT;`)
}

function readReceipt(row: Row, workspaceId: string, key: string): TaskLifecycleReceipt {
  if (typeof row.body !== 'string' || row.body.length > 8192 || row.hash !== sha(row.body) || row.session !== key) return fail('corrupt')
  let parsed: unknown
  try { parsed = JSON.parse(row.body) } catch { return fail('corrupt') }
  if (!exactFields(parsed, ['version', 'workspaceId', 'session', 'operationId', 'ordinal', 'commandHash', 'committedAt',
    'before', 'after', 'kind', 'taskId', 'effectiveFrom', 'graphRevision']) || parsed.version !== 'host-task-lifecycle-v1'
    || parsed.workspaceId !== workspaceId || !validSession(parsed.session, workspaceId) || runtimeIdentity(parsed.session) !== key
    || !operationId(parsed.operationId) || parsed.operationId !== row.operation_key || !natural(parsed.ordinal)
    || parsed.ordinal === 0 || parsed.ordinal !== row.ordinal || !hex(parsed.commandHash) || !boundedText(parsed.committedAt, 24)
    || !stateValid(parsed.before) || !stateValid(parsed.after) || !taskOrNull(parsed.taskId)) return fail('corrupt')
  if (parsed.kind === 'bind' || parsed.kind === 'unbind') {
    if ((parsed.kind === 'unbind') !== (parsed.taskId === null) || !natural(parsed.effectiveFrom) || parsed.effectiveFrom !== row.effective_seq
      || parsed.after.binding.revision !== parsed.before.binding.revision + 1 || parsed.after.binding.revision !== row.binding_revision
      || parsed.after.binding.taskId !== parsed.taskId || parsed.after.selectedTaskId !== parsed.before.selectedTaskId
      || parsed.graphRevision !== undefined) return fail('corrupt')
  } else if ((parsed.kind !== 'create' && parsed.kind !== 'switch') || parsed.taskId === null || row.effective_seq !== null
    || row.binding_revision !== null || parsed.effectiveFrom !== undefined || canonical(parsed.before.binding) !== canonical(parsed.after.binding)
    || parsed.after.selectedTaskId !== (parsed.kind === 'create' ? parsed.before.selectedTaskId : parsed.taskId)
    || (parsed.kind === 'create' ? !hex(parsed.graphRevision) : parsed.graphRevision !== undefined)) return fail('corrupt')
  return parsed as unknown as TaskLifecycleReceipt
}

export function taskLifecycleBindingAt(db: DatabaseSync, workspaceId: string, key: string, seq?: number): BindingReceipt | undefined {
  const row = seq === undefined
    ? db.prepare('SELECT * FROM task_lifecycle_receipt WHERE session=? AND binding_revision IS NOT NULL ORDER BY binding_revision DESC LIMIT 1').get(key)
    : db.prepare('SELECT * FROM task_lifecycle_receipt WHERE session=? AND effective_seq<=? ORDER BY effective_seq DESC,binding_revision DESC LIMIT 1').get(key, seq)
  if (!row) return undefined
  const receipt = readReceipt(row, workspaceId, key)
  return bindingChange(receipt) ? receipt : fail('corrupt')
}

/** Internal bridge: callers only receive the scoped Host handle, never the SQLite connection. */
export function createTaskLifecycle(store: Store): TaskLifecycleHost {
  const { db, workspaceId } = store
  const confirmations = new WeakMap<TaskLifecycleConfirmation, Confirmed>()
  function authorized(session: RuntimeSessionRef): number {
    store.authorize()
    if (!validSession(session, workspaceId)) return fail('unavailable')
    let live: ReturnType<TaskLifecycleHostOptions['currentSession']>
    try { live = store.currentSession(session.sessionId) } catch { return fail('unavailable') }
    if (!live || !validSession(live.session, workspaceId) || runtimeIdentity(live.session) !== runtimeIdentity(session)
      || !natural(live.nextSourceSeq)) return fail('unavailable')
    store.authorize()
    return live.nextSourceSeq
  }
  const latest = (key: string) => {
    const row = db.prepare('SELECT * FROM task_lifecycle_receipt WHERE session=? ORDER BY ordinal DESC LIMIT 1').get(key)
    return row && readReceipt(row, workspaceId, key)
  }
  function apply({ session, command, nextSourceSeq }: Confirmed, liveSeq: number): TaskLifecycleReceipt {
    const key = runtimeIdentity(session)
    const commandHash = sha(canonical(['host-task-lifecycle-v1', command]))
    const row = db.prepare('SELECT * FROM task_lifecycle_receipt WHERE session=? AND operation_key=?').get(key, command.operationId)
    if (row) {
      const receipt = readReceipt(row, workspaceId, key)
      return receipt.commandHash === commandHash ? receipt : fail('conflict')
    }
    const last = latest(key)
    const before = last?.after ?? initialState()
    const ordinal = (last?.ordinal ?? 0) + 1
    if (!natural(ordinal)) return fail('limit')
    const base = { version: 'host-task-lifecycle-v1', workspaceId, session, operationId: command.operationId, ordinal,
      commandHash, committedAt: new Date().toISOString(), before } as const
    let receipt: TaskLifecycleReceipt
    if (command.kind === 'create') {
      const taskId = randomUUID()
      const graph = store.append(taskId, { key: 'lifecycle:' + sha(canonical([key, command.operationId])),
        source: { session: { ...session, adapterId: 'acmi-host-lifecycle' }, sourceRevision: commandHash, localSeq: ordinal },
        change: { kind: 'task-opened', objective: command.objective, criteria: command.criteria } })
      receipt = { ...base, kind: 'create', taskId, graphRevision: graph.revision, after: before }
    } else if (command.kind === 'switch') {
      if (!store.activeTask(command.taskId)) return fail('unavailable')
      receipt = { ...base, kind: 'switch', taskId: command.taskId, after: { ...before, selectedTaskId: command.taskId } }
    } else {
      const cursor = store.nativeCursor(key)
      if (cursor.bindingRevision !== 0) return fail('conflict')
      const previous = taskLifecycleBindingAt(db, workspaceId, key)
      if ((previous?.after.binding.revision ?? 0) !== before.binding.revision) return fail('corrupt')
      const revision = before.binding.revision + 1
      if (!natural(revision)) return fail('limit')
      if (command.expectedRevision !== before.binding.revision || nextSourceSeq !== liveSeq || nextSourceSeq < cursor.next
        || before.binding.revision === 0 && nextSourceSeq !== cursor.next
        || nextSourceSeq < (previous?.effectiveFrom ?? 0)) return fail('revision')
      const taskId = command.kind === 'bind' ? command.taskId : null
      if (taskId !== null && !store.activeTask(taskId)) return fail('unavailable')
      const changed = { ...base, effectiveFrom: nextSourceSeq, after: { ...before, binding: { taskId, revision } } }
      receipt = taskId === null ? { ...changed, kind: 'unbind', taskId } : { ...changed, kind: 'bind', taskId }
    }
    const body = canonical(receipt)
    db.prepare('INSERT INTO task_lifecycle_receipt VALUES (?,?,?,?,?,?,?)').run(key, ordinal, command.operationId,
      bindingChange(receipt) ? receipt.after.binding.revision : null, bindingChange(receipt) ? receipt.effectiveFrom : null, body, sha(body))
    return JSON.parse(body) as TaskLifecycleReceipt
  }
  return Object.freeze<TaskLifecycleHost>({
    confirm(session, command) {
      const nextSourceSeq = authorized(session)
      if (!validCommand(command)) return fail('invalid')
      const token = Object.freeze({}) as TaskLifecycleConfirmation
      confirmations.set(token, { session: { ...session }, command: JSON.parse(canonical(command)) as TaskLifecycleCommand, nextSourceSeq })
      return token
    },
    execute(token) {
      const approved = confirmations.get(token)
      if (!approved) return fail('unavailable')
      const liveSeq = authorized(approved.session)
      return store.tx(() => apply(approved, liveSeq))
    },
    state(session) {
      authorized(session)
      try { return latest(runtimeIdentity(session))?.after ?? initialState() } catch (error) { throw translateGraphError(error) }
    },
    history(session, after = 0, limit = 64) {
      authorized(session)
      if (!natural(after) || !natural(limit) || limit < 1 || limit > 128) return fail('limit')
      const key = runtimeIdentity(session)
      try {
        const start = after === 0 ? undefined
          : db.prepare('SELECT * FROM task_lifecycle_receipt WHERE session=? AND ordinal=?').get(key, after)
        const rows = db.prepare('SELECT * FROM task_lifecycle_receipt WHERE session=? AND ordinal>? ORDER BY ordinal LIMIT ?').all(key, after, limit)
        let prior = start ? readReceipt(start, workspaceId, key).after : initialState()
        return rows.map((row, index) => {
          const receipt = readReceipt(row, workspaceId, key)
          if ((after !== 0 && !start) || receipt.ordinal !== after + index + 1 || canonical(receipt.before) !== canonical(prior)) return fail('corrupt')
          prior = receipt.after
          return receipt
        })
      } catch (error) { throw translateGraphError(error) }
    },
  })
}
