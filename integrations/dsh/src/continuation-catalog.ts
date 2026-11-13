import type { DatabaseSync } from 'node:sqlite'
import type { GraphStreamCut, RuntimeSessionRef } from '@acmi/contracts'
import { canonical, exactFields, isTaskId, runtimeIdentity } from '@acmi/core'
import type { ContinuationRoots } from './continuation-layout.ts'
import { GraphStoreError } from './graph-store-db.ts'
import { dshSessionRef } from './harness.ts'
import { continuityDigest as sha } from './local-digest.ts'
import { openDshJournal } from './scoped-read.ts'
import { validDshLifecycleSession } from './task-lifecycle.ts'

export interface ContinuationRegistration {
  readonly version: 'continuation-session-v1'
  readonly session: RuntimeSessionRef
  readonly checkpointNext: number
}
export interface ContinuationTaskCursor {
  readonly workspaceId: string
  readonly after: string
  readonly revision: string
}
export interface ContinuationTaskSummary {
  readonly taskId: string
  readonly objective: string
  readonly status: 'open' | 'closed'
}
export interface ContinuationTaskPage {
  readonly items: readonly ContinuationTaskSummary[]
  readonly next: ContinuationTaskCursor | null
}

const fail = (code: GraphStoreError['code']): never => { throw new GraphStoreError(code) }
const natural = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
const revisionId = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/u.test(v)

export function enableContinuationCatalog(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS continuation_session (
    session_id TEXT PRIMARY KEY, session_key TEXT NOT NULL UNIQUE, body TEXT NOT NULL, hash TEXT NOT NULL
  ) STRICT, WITHOUT ROWID`)
}

function registration(workspaceId: string, row: Record<string, unknown>): ContinuationRegistration {
  if (typeof row.body !== 'string' || row.body.length > 8192 || row.hash !== sha(row.body)) return fail('corrupt')
  let value: unknown
  try { value = JSON.parse(row.body) } catch { return fail('corrupt') }
  if (!exactFields(value, ['version', 'session', 'checkpointNext']) || value.version !== 'continuation-session-v1'
    || !validDshLifecycleSession(value.session, workspaceId) || !natural(value.checkpointNext)
    || value.session.sessionId !== row.session_id || runtimeIdentity(value.session) !== row.session_key) return fail('corrupt')
  return { version: value.version, session: value.session, checkpointNext: value.checkpointNext }
}

export function findContinuationRegistration(db: DatabaseSync, workspaceId: string, sessionId: string): ContinuationRegistration | undefined {
  const row = db.prepare('SELECT * FROM continuation_session WHERE session_id=?').get(sessionId)
  return row && registration(workspaceId, row)
}

export function readContinuationRegistrations(db: DatabaseSync, workspaceId: string, cap: number): readonly ContinuationRegistration[] {
  const rows = db.prepare('SELECT * FROM continuation_session ORDER BY session_id LIMIT ?').all(cap + 1)
  if (rows.length > cap) return fail('limit')
  return rows.map(row => registration(workspaceId, row))
}

export function verifyContinuationSources(db: DatabaseSync, ledger: boolean): void {
  const missing = (table: 'runtime_cursor' | 'task_lifecycle_receipt') => db.prepare(`SELECT 1 FROM ${table} AS source
    WHERE NOT EXISTS (SELECT 1 FROM continuation_session AS entry WHERE entry.session_key=source.session) LIMIT 1`).get()
  if (missing('runtime_cursor') || (ledger && missing('task_lifecycle_receipt'))) fail('corrupt')
}

export async function confirmContinuationCheckpoint(roots: ContinuationRoots, ref: RuntimeSessionRef, next: number,
  signal: AbortSignal): Promise<void> {
  const journal = await openDshJournal(roots.journalRoot, roots.workspaceRoot, roots.compression)
  if (journal.partitionId !== ref.instanceId) return fail('unavailable')
  const snapshot = await journal.inspect(ref.sessionId, signal)
  if (!snapshot || runtimeIdentity(dshSessionRef(snapshot.header, journal.partitionId)) !== runtimeIdentity(ref)) return fail('unavailable')
  const cut = await journal.read(snapshot, signal)
  if (cut.events.length !== next) return fail('revision')
}

export function insertContinuationRegistration(db: DatabaseSync, ref: RuntimeSessionRef, next: number, cap: number): ContinuationRegistration {
  const existing = findContinuationRegistration(db, ref.instanceId, ref.sessionId)
  if (existing) {
    if (runtimeIdentity(existing.session) !== runtimeIdentity(ref) || next < existing.checkpointNext) return fail('conflict')
    return existing
  }
  if (Number(db.prepare('SELECT count(*) AS n FROM continuation_session').get()?.n) >= cap) return fail('limit')
  const value: ContinuationRegistration = { version: 'continuation-session-v1', session: ref, checkpointNext: next }
  const body = canonical(value)
  db.prepare('INSERT INTO continuation_session VALUES (?,?,?,?)').run(ref.sessionId, runtimeIdentity(ref), body, sha(body))
  return value
}

export function readContinuationTasks(db: DatabaseSync, workspaceId: string, cap: number, limit: number,
  cursor: ContinuationTaskCursor | undefined, read: (taskId: string) => GraphStreamCut | null): ContinuationTaskPage {
  if (!natural(limit) || limit < 1 || limit > 64) return fail('limit')
  if (cursor !== undefined && (!exactFields(cursor, ['workspaceId', 'after', 'revision']) || cursor.workspaceId !== workspaceId
    || !isTaskId(cursor.after) || !revisionId(cursor.revision))) return fail('invalid')
  const rows = db.prepare('SELECT DISTINCT task FROM graph_event ORDER BY task LIMIT ?').all(cap + 1)
  if (rows.length > cap) return fail('limit')
  const index = rows.map(({ task }) => {
    if (!isTaskId(task)) return fail('corrupt')
    const cut = read(task)
    const definition = cut?.snapshot.task
    if (!cut || !definition) return fail('corrupt')
    const summary: ContinuationTaskSummary = { taskId: task, objective: definition.objective, status: definition.closed ? 'closed' : 'open' }
    return { summary, revision: cut.revision }
  })
  const revision = sha(canonical(index.map(({ summary, revision }) => [summary.taskId, revision])))
  let start = 0
  if (cursor !== undefined) {
    if (cursor.revision !== revision) return fail('revision')
    start = index.findIndex(({ summary }) => summary.taskId === cursor.after) + 1
    if (start === 0) return fail('invalid')
  }
  const items = index.slice(start, start + limit).map(({ summary }) => summary)
  const last = items.at(-1)
  return { items, next: last && start + items.length < index.length ? { workspaceId, revision, after: last.taskId } : null }
}
