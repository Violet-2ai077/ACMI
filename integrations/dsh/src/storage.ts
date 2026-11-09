import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type {
  Cancellation, Checkpoint, ScopeAuthority, StorageAdapter, TaskHistoryQuery, TaskQuery, TaskRecord, WorkspaceScope,
} from '@acmi/contracts'
import { authorizeScope, isTaskId, project } from '@acmi/core'
import { DSH_ADAPTER_VERSION, dshCapabilities, dshSessionRef, journalSourceRevision, normalizeDshCut } from './harness.ts'
import { ScopedJournalError } from './journal-format.ts'
import type { DshJournal, DshJournalSnapshot } from './scoped-read.ts'

const MAX_PAGE = 100
const MAX_EVENTS = 16_384
const PROJECTION_VERSION = 'acmi-forward-v1'
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

export interface DshStorageSource {
  readonly authority: Pick<ScopeAuthority, 'permits'>
  readonly workspaceId: string
  readonly journal: DshJournal
  /** Trusted host registry, scoped to this Workspace. No write methods are accepted. */
  tasks(): readonly TaskRecord[]
}

/** Compose the one-workspace native journal with the Core and a host-authorized task registry. */
export function createDshStorageAdapter(source: DshStorageSource): StorageAdapter {
  const cursorSecret = randomBytes(32)
  const scopeIds = new WeakMap<WorkspaceScope, string>()
  const sign = (body: string) => createHmac('sha256', cursorSecret).update(body).digest()

  function scopeId(scope: WorkspaceScope): string {
    let id = scopeIds.get(scope)
    if (id === undefined) {
      id = randomBytes(16).toString('hex')
      scopeIds.set(scope, id)
    }
    return id
  }

  function guard(scope: WorkspaceScope, cancel: Cancellation): void {
    if (cancel.cancelled) throw new Error('ACMI_HISTORY_CANCELLED')
    if (!authorizeScope(source.authority, scope, source.workspaceId)) throw new Error('ACMI_HISTORY_SCOPE')
  }

  function registry(scope: WorkspaceScope, cancel: Cancellation): readonly TaskRecord[] {
    guard(scope, cancel)
    return source.tasks().filter(task => task.workspaceId === source.workspaceId && isTaskId(task.taskId))
      .map(task => ({ taskId: task.taskId, workspaceId: task.workspaceId, status: task.status }))
      .sort((left, right) => left.taskId.localeCompare(right.taskId))
  }

  function pageLimit(query: TaskQuery): void {
    if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > MAX_PAGE) throw new Error('ACMI_HISTORY_LIMIT')
  }

  function page<T>(items: readonly T[], query: TaskQuery, key: string) {
    let offset = 0
    if (query.cursor !== undefined) {
      const match = /^([1-9][0-9]{0,7})\.([a-f0-9]{64})$/.exec(query.cursor)
      if (match === null || !timingSafeEqual(Buffer.from(match[2]!, 'hex'), sign(`${key}:${match[1]}`))) {
        throw new Error('ACMI_HISTORY_CURSOR')
      }
      offset = Number(match[1])
      if (offset >= items.length) throw new Error('ACMI_HISTORY_CURSOR')
    }
    const end = Math.min(offset + query.limit, items.length)
    const itemsPage = items.slice(offset, end)
    return { items: itemsPage, ...(end === items.length ? {} : { next: `${end}.${sign(`${key}:${end}`).toString('hex')}` }) }
  }

  function cutIdentity(snapshots: readonly DshJournalSnapshot[]): string {
    return digest(snapshots.map(({ header, revision }) => [header.id, header.createdAt, revision]))
  }

  async function snapshots(signal: AbortSignal): Promise<readonly DshJournalSnapshot[]> {
    return [...await source.journal.list(signal)].sort((left, right) => left.header.id.localeCompare(right.header.id))
  }

  return {
    adapterId: dshCapabilities.adapterId, adapterVersion: DSH_ADAPTER_VERSION,
    async getCapabilities() {
      return { major: 0, minor: 1, offered: ['scoped-task-read', 'scoped-history-read', 'checkpoint-read'], required: [] }
    },
    async getTask(taskId, scope, cancel) {
      return registry(scope, cancel).find(task => task.taskId === taskId) ?? null
    },
    async listTasks(query, scope, cancel) {
      const tasks = registry(scope, cancel)
      pageLimit(query)
      const selected = page(tasks, query, digest([scopeId(scope), 'tasks', query.limit, tasks]))
      return { tasks: selected.items, ...(selected.next === undefined ? {} : { next: selected.next }) }
    },
    async queryTaskHistory(query: TaskHistoryQuery, scope, cancel) {
      const tasks = registry(scope, cancel)
      pageLimit(query)
      const selector = query.selector
      if ('taskId' in selector && !tasks.some(task => task.taskId === selector.taskId)) throw new Error('ACMI_HISTORY_TASK')
      const deadline = AbortSignal.timeout(10_000)
      const first = await snapshots(deadline)
      const cut = cutIdentity(first)
      const rows = []
      const checkpoints: Checkpoint[] = []
      let total = 0
      for (const snapshot of first) {
        guard(scope, cancel)
        const artifact = await source.journal.read(snapshot, deadline)
        guard(scope, cancel)
        total += artifact.events.length
        if (total > MAX_EVENTS) throw new ScopedJournalError('ACMI_JOURNAL_LIMIT')
        const sourceRevision = journalSourceRevision(source.journal.partitionId, snapshot.revision)
        const input = normalizeDshCut({
          header: artifact.meta, events: artifact.events, inheritedEventCount: artifact.inheritedEventCount, sourceRevision,
        }, source.journal.partitionId)
        rows.push(...project(input, tasks, { requireTurnEvidence: true }).filter(row => 'taskId' in selector
          ? row.attribution.kind === 'bound' && row.attribution.binding.taskId === selector.taskId
          : row.attribution.kind === 'unresolved'))
        checkpoints.push({
          session: dshSessionRef(artifact.meta, source.journal.partitionId), sourceRevision,
          throughExclusive: artifact.events.length, projectionVersion: PROJECTION_VERSION,
        })
      }
      guard(scope, cancel)
      if (cutIdentity(await snapshots(deadline)) !== cut || digest(registry(scope, cancel)) !== digest(tasks)) {
        throw new ScopedJournalError('ACMI_JOURNAL_CHANGED')
      }
      const selected = page(rows, query, digest([scopeId(scope), selector, query.limit, PROJECTION_VERSION, cut, tasks]))
      return { rows: selected.items, checkpoints, complete: true, ...(selected.next === undefined ? {} : { next: selected.next }) }
    },
  }
}
