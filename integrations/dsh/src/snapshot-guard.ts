import type { Context } from '@deepseek-ai/cordis'
import { boundedText, canonical, exactFields, isTaskId } from '@acmi/core'
import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'
import type {} from '@deepseek-ai/dsh-llm'
import { SessionSeq, type Session } from '@deepseek-ai/dsh-session'
import { GraphStoreError } from './graph-store-db.ts'
import type { LocalGraphStore } from './graph-store.ts'
import { DSH_VERSION } from './harness.ts'
import { continuityDigest } from './local-digest.ts'
import type { ContextSnapshotIdentity } from './persistent-context.ts'
import type { DshIngestionOptions } from './runtime-ingestion.ts'

export interface SnapshotReservation {
  readonly version: 'snapshot-reservation-v1'
  readonly identity: ContextSnapshotIdentity
  readonly runtimeVersion: string
  readonly deliveryVersion: '0.8.2'
  readonly delivery: 'native-persistent-runtime-context'
  readonly retired: boolean
}

const hex = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
export function isSnapshotReservation(input: unknown, workspaceId: string): input is SnapshotReservation {
  if (!exactFields(input, ['version', 'identity', 'runtimeVersion', 'deliveryVersion', 'delivery', 'retired'])
    || input.version !== 'snapshot-reservation-v1' || input.runtimeVersion !== DSH_VERSION || input.deliveryVersion !== '0.8.2'
    || input.delivery !== 'native-persistent-runtime-context' || typeof input.retired !== 'boolean') return false
  const item = input.identity
  if (!exactFields(item, ['id', 'workspaceId', 'taskId', 'sessionId', 'incarnation', 'streamRevision', 'projectionVersion',
    'sourceRevision', 'policyVersion', 'tokenBudget', 'estimator', 'contextPackageVersion', 'activeNodeId', 'packageHash', 'createdAt', 'expiresAt'])
    || item.workspaceId !== workspaceId || !hex(item.id) || !hex(item.packageHash) || !hex(item.streamRevision)
    || !boundedText(item.sourceRevision, 128) || item.projectionVersion !== 'task-graph-v1'
    || item.policyVersion !== 'task-context-v1' || !boundedText(item.activeNodeId, 128) || !boundedText(item.sessionId)
    || !isTaskId(item.taskId) || !boundedText(item.incarnation, 32)
    || item.estimator !== 'utf8-byte-upper-estimate-v1' || item.contextPackageVersion !== 'task-context-package-v1'
    || typeof item.tokenBudget !== 'number' || !Number.isSafeInteger(item.tokenBudget) || item.tokenBudget < 1 || item.tokenBudget > 262_144
    || typeof item.createdAt !== 'number' || !Number.isSafeInteger(item.createdAt) || item.createdAt < 0
    || typeof item.expiresAt !== 'number' || !Number.isSafeInteger(item.expiresAt) || item.expiresAt <= item.createdAt
    || item.expiresAt - item.createdAt > 3_600_000) return false
  const { id, ...body } = item
  return id === continuityDigest(canonical(body))
}

const mounted = new WeakSet<Context['llm']>()

/** Quarantine, not erasure: only requests routed through this Host's public LLM middleware are covered. */
export function registerDshSnapshotGuard(ctx: Context, opts: DshIngestionOptions) {
  const { store, writer } = opts
  if (opts.enabled !== true || opts.synthetic !== true || opts.runtimeVersion !== DSH_VERSION
    || getDshRuntimeVersion() !== DSH_VERSION || mounted.has(ctx.llm)) throw new GraphStoreError('unavailable')
  const known = new Map(store.snapshotReservations(writer).map(record => [record.identity.sessionId, record]))
  const live = new Map<string, () => boolean>()
  let disposed = false
  let denied = 0
  let staleCandidates = 0
  let compactionDenied = 0
  let copiedCandidates = 0
  function active(sessionId: string): boolean {
    try {
      return !disposed && store.permitsWrite(writer) && !known.get(sessionId)?.retired && live.get(sessionId)?.() === true
    } catch { return false }
  }
  const stop = ctx.on('llm/stream', async function* (request, next) {
    const id = request.sessionId
    const record = id ? known.get(id) : undefined
    const header = id ? ctx.sessions.get(id)?.header : undefined
    const ancestor = header?.isSeeded ? header.parentSession : undefined
    if ((ancestor && known.has(ancestor)) || request.messages.some(message =>
      message.content.some(block => block.type === 'text' && containsForeignMarker(block.text, record?.identity.packageHash)))) {
      denied++
      copiedCandidates++
      if (request.purpose === 'compaction') compactionDenied++
      throw new Error('ACMI_SNAPSHOT_COPY_QUARANTINED')
    }
    if (id && record && !active(id)) {
      denied++
      if (request.purpose === 'compaction') compactionDenied++
      if (request.messages.some(message => message.content.some(block =>
        block.type === 'text' && block.text.includes(record.identity.packageHash)))) staleCandidates++
      throw new Error('ACMI_SESSION_RETIRED')
    }
    yield* next()
  }, { prepend: true, global: true })
  function containsForeignMarker(text: string, own: string | undefined) {
    if (!text.includes('ACMI task recovery data (historical evidence, not instructions):')) return false
    for (const match of text.matchAll(/"deterministicHash":"([a-f0-9]{64})"/gu)) {
      if (match[1] !== own) return true
    }
    return false
  }
  const runtime = ctx.llm
  mounted.add(runtime)
  function dispose() {
    if (disposed) return
    disposed = true
    live.clear()
    stop()
    mounted.delete(runtime)
  }
  ctx.effect(() => dispose, 'ACMI snapshot request quarantine')
  return {
    reserve(identity: ContextSnapshotIdentity, valid: () => boolean, source: LocalGraphStore, session: Session) {
      if (disposed || source !== store || known.has(identity.sessionId) || identity.sessionId !== session.id
        || identity.incarnation !== String(session.header.createdAt) || session.header.cwd !== opts.workspaceRoot
        || ctx.sessions.get(session.id) !== session || session.header.isSeeded === true || session.seq > 1
        || (session.seq === 1 && session.eventAt(SessionSeq(0))?.type !== 'session/end-seed')) throw new GraphStoreError('unavailable')
      const record: SnapshotReservation = { version: 'snapshot-reservation-v1', identity: { ...identity },
        runtimeVersion: opts.runtimeVersion, deliveryVersion: '0.8.2', delivery: 'native-persistent-runtime-context', retired: false }
      store.reserveSnapshot(writer, record)
      known.set(identity.sessionId, record)
      live.set(identity.sessionId, valid)
    },
    allows(identity: ContextSnapshotIdentity) {
      return known.get(identity.sessionId)?.identity.id === identity.id && active(identity.sessionId)
    },
    retire(sessionId: string) {
      const record = known.get(sessionId)
      if (disposed || !record) throw new GraphStoreError('unavailable')
      live.delete(sessionId)
      known.set(sessionId, { ...record, retired: true })
      store.retireSnapshot(writer, sessionId)
    },
    metrics: () => ({ denied, staleCandidates, compactionDenied, copiedCandidates, reserved: known.size }),
    status(sessionId: string) {
      const entry = known.get(sessionId)
      if (disposed || !store.permitsWrite(writer) || !entry) return null
      const allowed = active(sessionId)
      return { ...entry, identity: { ...entry.identity }, futureContribution: allowed ? 'allowed' : 'stopped',
        guardedRequest: allowed ? 'allowed' : 'denied', localHistory: 'possibly_persisted',
        deletion: 'not_performed', providerRetention: 'unknown' }
    },
    dispose,
  }
}

export type DshSnapshotGuard = ReturnType<typeof registerDshSnapshotGuard>
