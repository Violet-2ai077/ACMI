import { join } from 'node:path'
import type { WorkspaceScope } from '@acmi/contracts'
import { canonical } from '@acmi/core'
import type { Context } from '@deepseek-ai/cordis'
import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type { LocalGraphStore, RuntimeWorkAssignment } from './graph-store.ts'
import { GraphStoreError } from './graph-store-db.ts'
import { DSH_VERSION } from './harness.ts'
import { encodeSegment, generationLogFilename, projectDir, type JsonlCompression } from './journal-format.ts'
import { dshRuntimeIdentity, normalizeDshRuntimeFact } from './runtime-facts.ts'
import { openDshJournal } from './scoped-read.ts'

export interface DshIngestionOptions {
  readonly enabled?: boolean
  readonly synthetic?: true
  readonly runtimeVersion: string
  readonly workspaceRoot: string
  readonly journalRoot: string
  readonly compression: JsonlCompression
  readonly store: LocalGraphStore
  readonly scope: WorkspaceScope
  readonly writer: WorkspaceScope
}
interface Pending {
  readonly rows: SessionEvent[]
  readonly assignment?: RuntimeWorkAssignment
  gap: boolean
}
const maxQueued = 2048

/** Observe the public append feed. The trusted host explicitly selects Sessions and drives durability barriers. */
export async function registerDshRuntimeIngestion(ctx: Context, opts: DshIngestionOptions) {
  if (opts.enabled !== true || opts.synthetic !== true || opts.runtimeVersion !== DSH_VERSION
    || getDshRuntimeVersion() !== DSH_VERSION) return null
  const { store, scope, writer, workspaceRoot, journalRoot, compression } = opts
  const journal = await openDshJournal(journalRoot, workspaceRoot, compression)
  if (journal.partitionId !== store.workspaceId || !store.permits(scope) || !store.permitsWrite(writer)
    || !store.isSeparateFrom(workspaceRoot) || !store.isSeparateFrom(journalRoot)) return null
  const backend = ctx.sessionPersistence.identity
  const tracked = new Map<Session, Pending>()
  let queued = 0
  let capture = 0
  let committed = 0
  let decoded = 0
  let disposed = false
  let busy = false
  const valid = (s: Session) => !disposed && store.permits(scope) && ctx.sessionPersistence.identity === backend
    && s.header.cwd === workspaceRoot && ctx.sessions.get(s.id) === s
  const stopEvents = ctx.on('session/event', (s, event) => {
    const row = tracked.get(s)
    if (!row || !valid(s) || event.seq < s.inheritedEventCount) return
    capture++
    if (row.gap || queued >= maxQueued) { row.gap = true; return }
    row.rows.push(event)
    queued++
  }, { global: true })
  const stopDisposed = ctx.on('session/disposed', s => {
    const row = tracked.get(s)
    if (row) queued -= row.rows.length
    tracked.delete(s)
  }, { global: true })
  function dispose() {
    if (disposed) return
    disposed = true
    stopEvents()
    stopDisposed()
    tracked.clear()
    queued = 0
  }
  ctx.effect(() => dispose, 'ACMI persistent runtime observation')

  async function durability(s: Session, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted()
    if (!valid(s) || !await ctx.sessions.flush(s) || !valid(s)) throw new GraphStoreError('unavailable')
    const stat = await ctx.sessionPersistence.stat(s.id, { signal })
    const expected = join(projectDir(journalRoot, workspaceRoot), encodeSegment(s.id), generationLogFilename(4, compression))
    if (!valid(s) || stat?.header.createdAt !== s.header.createdAt || stat.header.cwd !== workspaceRoot
      || stat.location?.kind !== 'jsonl' || stat.location.path !== expected) throw new GraphStoreError('unavailable')
  }
  function commit(s: Session, pending: Pending, event: SessionEvent, bindingRevision: number): number {
    const fact = normalizeDshRuntimeFact(s.header, event, store.workspaceId, bindingRevision)
    const receipt = store.ingest(writer, fact, s.inheritedEventCount, pending.assignment)
    if (receipt.status === 'committed') committed++
    return fact.detail.kind === 'binding' ? fact.detail.revision : bindingRevision
  }
  async function run(s: Session, recover: boolean, signal = AbortSignal.timeout(10_000)) {
    const pending = tracked.get(s)
    if (!pending || !valid(s)) throw new GraphStoreError('unavailable')
    if (busy) throw new GraphStoreError('busy')
    busy = true
    try {
      const stopAt = s.seq
      await durability(s, signal)
      const identity = dshRuntimeIdentity(s.header, store.workspaceId)
      const cursor = store.cursor(scope, identity, s.inheritedEventCount)
      if (!cursor || cursor.next > stopAt) throw new GraphStoreError('gap')
      let next = cursor.next
      let binding = cursor.bindingRevision
      if (recover) {
        const snapshot = await journal.inspect(s.id, signal)
        if (!snapshot || snapshot.header.createdAt !== s.header.createdAt) throw new GraphStoreError('unavailable')
        const cut = await journal.read(snapshot, signal)
        decoded += cut.events.length
        if (!valid(s) || cut.inheritedEventCount !== s.inheritedEventCount || cut.events.length < stopAt
          || cut.meta.createdAt !== s.header.createdAt) throw new GraphStoreError('gap')
        if (next > s.inheritedEventCount) {
          const last = store.factAt(scope, identity, next - 1)
          const anchor = cut.events[next - 1]
          if (!last || !anchor || canonical(last.fact) !== canonical(normalizeDshRuntimeFact(s.header, anchor, store.workspaceId,
            last.fact.detail.kind === 'binding' ? binding - 1 : binding))) throw new GraphStoreError('conflict')
        }
        for (; next < stopAt; next++) {
          signal.throwIfAborted()
          if (!valid(s)) throw new GraphStoreError('unavailable')
          const row = cut.events[next]
          if (!row || row.seq !== next) throw new GraphStoreError('gap')
          binding = commit(s, pending, row, binding)
        }
        pending.gap = false
      } else {
        if (pending.gap) throw new GraphStoreError('gap')
        for (const event of pending.rows) {
          signal.throwIfAborted()
          if (!valid(s)) throw new GraphStoreError('unavailable')
          if (event.seq >= stopAt) break
          if (event.seq < next) continue
          if (event.seq !== next) throw new GraphStoreError('gap')
          binding = commit(s, pending, event, binding)
          next++
        }
        if (next !== stopAt) throw new GraphStoreError('gap')
      }
      const consumed = pending.rows.findIndex(row => row.seq >= stopAt)
      queued -= pending.rows.splice(0, consumed === -1 ? pending.rows.length : consumed).length
      return next
    } finally { busy = false }
  }
  return {
    attach(session: Session, assignment?: RuntimeWorkAssignment) {
      if (!valid(session) || tracked.has(session) || tracked.size >= 32) throw new GraphStoreError('unavailable')
      if (assignment) {
        const cut = store.read(scope, assignment.taskId)
        if (!cut?.snapshot.nodes.some(node => node.id === assignment.nodeId)) throw new GraphStoreError('unavailable')
        if (assignment.parentExecutionId) {
          const parent = session.header.origin === 'subagent' && session.header.parentSession
            ? ctx.sessions.get(session.header.parentSession) : undefined
          const exec = cut.snapshot.executions.find(row => row.id === assignment.parentExecutionId)
          if (!parent || !valid(parent) || !exec || exec.started.source.session.sessionId !== parent.id
            || exec.started.source.session.incarnation !== String(parent.header.createdAt)) throw new GraphStoreError('unavailable')
        }
      }
      tracked.set(session, { rows: [], gap: false, ...(assignment ? { assignment: { ...assignment } } : {}) })
    },
    drain(session: Session, signal?: AbortSignal) { return run(session, false, signal) },
    reconcile(session: Session, signal?: AbortSignal) { return run(session, true, signal) },
    metrics() { return { captured: capture, committed, coldDecodedRows: decoded, queued } },
    dispose,
  }
}
