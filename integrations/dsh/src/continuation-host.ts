import { randomUUID } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import type { RuntimeFactDetail, RuntimeSessionRef, RuntimeAttribution, ScopeAuthority, WorkspaceScope } from '@acmi/contracts'
import { boundedText, canonical, exactFields, isTaskId } from '@acmi/core'
import type { Context } from '@deepseek-ai/cordis'
import { getDshRuntimeVersion } from '@deepseek-ai/dsh-app-boot'
import { SessionId, type Session } from '@deepseek-ai/dsh-session'
import type { ContinuationRegistration, ContinuationTaskCursor, ContinuationTaskPage } from './continuation-catalog.ts'
import type { ContinuationRoots } from './continuation-layout.ts'
import { acquireContinuationRoots, type ContinuationRootLease } from './continuation-lock.ts'
import { GraphStoreError, type GraphStoreCode } from './graph-store-db.ts'
import { openGraphStore, type LocalGraphStore } from './graph-store.ts'
import { DSH_VERSION } from './harness.ts'
import { ScopedJournalError } from './journal-format.ts'
import { continuityDigest } from './local-digest.ts'
import { dshRuntimeIdentity } from './runtime-facts.ts'
import { reconcileKnownDshSession, registerDshRuntimeIngestion, type DshIngestionOptions } from './runtime-ingestion.ts'
import type { TaskLifecycleCommand, TaskLifecycleReceipt, TaskLifecycleState } from './task-lifecycle.ts'

type Authority = Pick<ScopeAuthority, 'permits'>
export interface ContinuationAccess {
  readonly read: Authority
  readonly write: Authority
  readonly operatorAuthority: Authority
  readonly reader: WorkspaceScope
  readonly writer: WorkspaceScope
  readonly operator: WorkspaceScope
}

/** Trusted provider-free composition. Only the Host calls these hooks, never terminal input or a model. */
export interface ContinuationRuntime {
  readonly ctx: Context
  createSession(signal: AbortSignal): Promise<Session>
  isIdle(session: Session): boolean
  runSample(session: Session, signal: AbortSignal): Promise<void>
  closeSession(session: Session, signal: AbortSignal): Promise<void>
  /** Resolve only after all native writers have stopped. A failure retains the root leases. */
  dispose(): Promise<void>
}

export interface ContinuationHostOptions {
  readonly roots: ContinuationRoots
  readonly synthetic: true
  readonly runtimeVersion: string
  readonly authorize: (workspaceId: string) => ContinuationAccess
  readonly openRuntime: (roots: ContinuationRoots) => Promise<ContinuationRuntime>
}

export type ContinuationCommand =
  | { readonly kind: 'create'; readonly objective: string; readonly criteria: readonly string[] }
  | { readonly kind: 'continue'; readonly taskId: string }
  | { readonly kind: 'leave' }

declare const previewBrand: unique symbol
export type ContinuationPreviewToken = { readonly [previewBrand]: never }
export interface ContinuationTask {
  readonly taskId: string
  readonly objective: string
  readonly criteria: readonly string[]
  readonly status: 'open' | 'closed'
  readonly revision: string
}
export interface ContinuationPreview {
  readonly token: ContinuationPreviewToken
  readonly operationId: string
  readonly command: ContinuationCommand
  readonly session: RuntimeSessionRef
  readonly task: ContinuationTask | null
  readonly binding: TaskLifecycleState['binding']
  readonly nativeNext: number
  readonly graphNext: number
}

type HistoryState = 'history_ready' | 'history_incomplete'
type RecoveryReason = GraphStoreCode | ScopedJournalError['code'] | 'timeout'
export interface ContinuationStatus {
  readonly workspaceId: string
  readonly session: RuntimeSessionRef | null
  readonly binding: TaskLifecycleState['binding'] | null
  readonly identity: 'identity_ready' | 'identity_unbound'
  readonly history: HistoryState
  readonly modelContext: 'model_context_not_enabled'
  readonly recovery: 'ready' | 'recovery_blocked'
  readonly reason: RecoveryReason | null
  readonly pending: number | null
  readonly reconciledSessions: number
  readonly recoveredEvents: number
}

export interface ContinuationHistoryEvent {
  readonly session: RuntimeSessionRef
  readonly localSeq: number
  readonly kind: RuntimeFactDetail['kind']
  readonly via: Extract<RuntimeAttribution, { kind: 'assigned' }>['via']
  readonly callSeq?: number
}
export interface ContinuationHistory extends ContinuationTask {
  readonly history: HistoryState
  readonly events: readonly ContinuationHistoryEvent[]
}

export interface ContinuationCloseResult {
  readonly saved: boolean
  readonly pending: number | null
  readonly reason: RecoveryReason | null
}

export interface ContinuationHost {
  readonly workspaceId: string
  /** Supply an operation ID only to retry a committed operation in the current Session. */
  preview(command: ContinuationCommand, retryOperationId?: string): Promise<ContinuationPreview>
  /** Only literal true executes. All other answers consume the preview without writing. */
  confirm(token: ContinuationPreviewToken, answer: unknown): Promise<TaskLifecycleReceipt | null>
  newSession(signal?: AbortSignal): Promise<RuntimeSessionRef>
  sync(signal?: AbortSignal): Promise<number>
  sample(signal?: AbortSignal): Promise<{ readonly synthetic: true; readonly next: number }>
  status(): Promise<ContinuationStatus>
  tasks(limit?: number, cursor?: ContinuationTaskCursor): Promise<ContinuationTaskPage>
  history(taskId: string, limit?: number): Promise<ContinuationHistory>
  sessions(): Promise<readonly ContinuationRegistration[]>
  receipts(session: RuntimeSessionRef, after?: number, limit?: number): Promise<readonly TaskLifecycleReceipt[]>
  close(signal?: AbortSignal): Promise<ContinuationCloseResult>
}

const previewTtlMs = 120_000
const operationLimitMs = 10_000
const unbound = { taskId: null, revision: 0 } as const
const fail = (code: GraphStoreCode): never => { throw new GraphStoreError(code) }
const reasonOf = (error: unknown, signal?: AbortSignal): RecoveryReason =>
  signal?.aborted ? 'timeout' : error instanceof GraphStoreError || error instanceof ScopedJournalError ? error.code : 'io'
const deadline = (signal?: AbortSignal) => {
  const timeout = AbortSignal.timeout(operationLimitMs)
  return signal ? AbortSignal.any([timeout, signal]) : timeout
}
const operationHash = (command: TaskLifecycleCommand) => continuityDigest(canonical(['host-task-lifecycle-v1', command]))

function copyCommand(input: unknown): ContinuationCommand {
  if (exactFields(input, ['kind', 'objective', 'criteria']) && input.kind === 'create'
    && boundedText(input.objective, 4096) && input.objective.trim() && Array.isArray(input.criteria)
    && input.criteria.length > 0 && input.criteria.length <= 16) {
    const criteria: unknown[] = Array.from(input.criteria)
    if (criteria.every((item): item is string => boundedText(item, 1024) && item.trim().length > 0)) {
      return Object.freeze({ kind: 'create', objective: input.objective, criteria: Object.freeze(criteria) })
    }
  }
  if (exactFields(input, ['kind', 'taskId']) && input.kind === 'continue' && isTaskId(input.taskId)) {
    return Object.freeze({ kind: 'continue', taskId: input.taskId })
  }
  if (exactFields(input, ['kind']) && input.kind === 'leave') return Object.freeze({ kind: 'leave' })
  return fail('invalid')
}

function observeClose(result: Promise<ContinuationCloseResult>, signal: AbortSignal, pending: () => number | null) {
  return new Promise<ContinuationCloseResult>((resolve, reject) => {
    const timeout = () => resolve({ saved: false, pending: pending(), reason: 'timeout' })
    if (signal.aborted) timeout()
    else signal.addEventListener('abort', timeout, { once: true })
    result.then(resolve, reject).finally(() => signal.removeEventListener('abort', timeout)).catch(() => {})
  })
}

/** Acquire both roots before opening a business writer; old Sessions are only inspected offline. */
export async function openContinuationHost(options: ContinuationHostOptions): Promise<ContinuationHost> {
  if (options.synthetic !== true || options.runtimeVersion !== DSH_VERSION || getDshRuntimeVersion() !== DSH_VERSION) {
    return fail('unavailable')
  }
  const roots = Object.freeze({ ...options.roots })
  const lease = await acquireContinuationRoots(roots)
  let runtime: ContinuationRuntime | undefined
  let store: LocalGraphStore | undefined
  try {
    const access = { ...options.authorize(lease.workspaceId) }
    runtime = await options.openRuntime(roots)
    const ctx = runtime.ctx
    const sessionAt = (id: string) => {
      const session = ctx.sessions.get(SessionId(id))
      return session && session.header.cwd === roots.workspaceRoot && (session === current || session === staged)
        ? { session: dshRuntimeIdentity(session.header, lease.workspaceId), nextSourceSeq: session.seq } : null
    }
    let current: Session | undefined
    let staged: Session | undefined
    store = openGraphStore({ ...access, root: roots.graphRoot, workspaceId: lease.workspaceId, continuation: roots,
      taskLifecycle: { operatorAuthority: access.operatorAuthority, currentSession: sessionAt } })
    return await runHost(roots, lease, store, access, runtime, {
      get: () => current,
      set: session => { current = session },
      stage: session => { staged = session },
    })
  } catch (error) {
    // If native disposal itself fails, do not let another writer in.
    await runtime?.dispose()
    store?.close()
    lease.close()
    throw error
  }
}

async function runHost(roots: ContinuationRoots, lease: ContinuationRootLease, store: LocalGraphStore,
  access: ContinuationAccess, runtime: ContinuationRuntime, live: {
    get(): Session | undefined
    set(session: Session | undefined): void
    stage(session: Session | undefined): void
  }): Promise<ContinuationHost> {
  const { workspaceId } = lease
  const { reader, writer, operator } = access
  const { ctx } = runtime
  const ref = (session: Session) => dshRuntimeIdentity(session.header, workspaceId)
  const ingestionOptions: DshIngestionOptions = { ...roots, store, scope: reader, writer,
    enabled: true, synthetic: true, runtimeVersion: DSH_VERSION }
  let ingestion: Awaited<ReturnType<typeof registerDshRuntimeIngestion>>
  let blocked: RecoveryReason | null = null
  let reconciledSessions = 0, recoveredEvents = 0
  let knownBinding: TaskLifecycleState['binding'] = unbound
  let pendingPreview: { view: ContinuationPreview; command: TaskLifecycleCommand; cursor: string; expires: number } | undefined
  let tail = Promise.resolve()
  let closing = false
  let cleanup: Promise<ContinuationCloseResult> | undefined
  let closeResult: ContinuationCloseResult | undefined

  const enqueue = <T>(run: () => T | Promise<T>): Promise<T> => {
    const job = tail.then(run)
    tail = job.then(() => {}, () => {})
    return job
  }
  const request = <T>(run: () => T | Promise<T>) => enqueue(() => closing ? fail('closed') : run())
  const read = () => { if (!store.permits(reader)) fail('unavailable') }
  const lifecycle = () => { read(); return store.taskLifecycle(writer, operator) }
  function mutable() {
    if (blocked) return fail('unavailable')
    return lifecycle()
  }
  function current(): Session { return live.get() ?? fail('unavailable') }
  function idle(session: Session): void {
    if (!runtime.isIdle(session)) fail('busy')
  }
  function block(error: unknown, signal?: AbortSignal): void {
    blocked ??= reasonOf(error, signal)
    pendingPreview = undefined
  }
  async function flush(session: Session, signal: AbortSignal) {
    signal.throwIfAborted()
    const next = session.seq
    if (!await ctx.sessions.flush(session)) fail('unavailable')
    signal.throwIfAborted()
    if (ctx.sessions.get(session.id) !== session || session.seq !== next) fail('revision')
  }
  async function createSession(signal: AbortSignal): Promise<RuntimeSessionRef> {
    mutable()
    signal.throwIfAborted()
    if (ctx.sessions.list().length) fail('conflict')
    const registered = store.continuationSessions(reader)
    if (registered.length >= 256) fail('limit')
    const session = await runtime.createSession(signal)
    const feed = ingestion ?? fail('unavailable')
    live.stage(session)
    try {
      mutable()
      if (registered.some(entry => entry.session.sessionId === session.id)) fail('conflict')
      if (ctx.sessions.get(session.id) !== session || ctx.sessions.list().length !== 1
        || session.inheritedEventCount !== 0 || session.header.cwd !== roots.workspaceRoot) fail('unavailable')
      idle(session)
      await flush(session, signal)
      const identity = ref(session)
      mutable()
      await store.registerContinuationSession(writer, identity, signal)
      mutable()
      feed.attach(session)
      await feed.reconcile(session, signal)
      mutable()
      signal.throwIfAborted()
      live.set(session)
      knownBinding = unbound
      return identity
    } catch (error) {
      feed.detach(session)
      try { await runtime.closeSession(session, signal) } catch { /* Remains blocked; close() still owns the writer. */ }
      throw error
    } finally { live.stage(undefined) }
  }
  async function sync(session: Session, signal: AbortSignal): Promise<number> {
    const feed = ingestion ?? fail('unavailable')
    store.continuationSource(reader, ref(session))
    await flush(session, signal)
    const next = await feed.reconcile(session, signal)
    lifecycle()
    if (next !== session.seq) return fail('gap')
    return next
  }
  function task(taskId: string, verify = false): ContinuationTask {
    read()
    if (!isTaskId(taskId)) return fail('invalid')
    const cut = verify ? store.audit(reader, taskId) : store.read(reader, taskId)
    if (!cut?.snapshot.task) return fail('unavailable')
    const { objective, criteria, closed } = cut.snapshot.task
    return Object.freeze({ taskId, objective, criteria: Object.freeze([...criteria]), status: closed ? 'closed' : 'open', revision: cut.revision })
  }
  function pending(): number | null {
    const session = live.get()
    if (!session) return blocked ? null : 0
    try {
      const cursor = store.cursor(reader, ref(session), session.inheritedEventCount)
      return cursor && cursor.next <= session.seq ? session.seq - cursor.next : null
    } catch { return null }
  }
  function snapshot(command: ContinuationCommand) {
    const host = mutable()
    const session = current()
    idle(session)
    const identity = ref(session)
    store.continuationSource(reader, identity)
    const { binding } = host.state(identity)
    knownBinding = binding
    const taskId = command.kind === 'continue' ? command.taskId : command.kind === 'leave' ? binding.taskId : null
    const target = taskId ? task(taskId, true) : null
    const cursor = store.cursor(reader, identity, session.inheritedEventCount) ?? fail('unavailable')
    if (cursor.bindingRevision !== 0 || cursor.next > session.seq) return fail('conflict')
    return { session: identity, task: target, binding, nativeNext: session.seq, graphNext: cursor.next, cursor: canonical(cursor) }
  }

  const startup = deadline()
  try {
    lifecycle()
    if (ctx.sessions.list().length !== 0) fail('conflict')
    for (const entry of store.continuationSessions(reader)) {
      lifecycle()
      const result = await reconcileKnownDshSession(ctx, ingestionOptions, entry.session, startup)
      lifecycle()
      reconciledSessions++
      recoveredEvents += result.committed
    }
    ingestion = await registerDshRuntimeIngestion(ctx, ingestionOptions)
    if (!ingestion) fail('unavailable')
    await createSession(startup)
  } catch (error) { block(error, startup) }

  const host: ContinuationHost = {
    workspaceId,
    preview(input, retryOperationId) {
      return request(() => {
        pendingPreview = undefined
        const command = copyCommand(input)
        const { cursor, ...details } = snapshot(command)
        const operationId = retryOperationId ?? randomUUID()
        if (!boundedText(operationId, 128) || !/^[A-Za-z0-9._:-]+$/u.test(operationId)) return fail('invalid')
        const retry = retryOperationId === undefined ? undefined : store.continuationOperation(reader, details.session, operationId)
        if (retryOperationId !== undefined && !retry) return fail('unavailable')
        if (!retry && details.graphNext !== details.nativeNext) return fail('gap')
        if (!retry && command.kind === 'continue' && details.task?.status !== 'open') return fail('unavailable')
        if (!retry && command.kind === 'leave' && !details.binding.taskId) return fail('unavailable')
        const expectedRevision = retry?.before.binding.revision ?? details.binding.revision
        const operation: TaskLifecycleCommand = command.kind === 'create' ? { ...command, operationId }
          : command.kind === 'continue' ? { kind: 'bind', taskId: command.taskId, operationId, expectedRevision }
            : { kind: 'unbind', operationId, expectedRevision }
        if (retry && retry.commandHash !== operationHash(operation)) return fail('conflict')
        const token = Object.freeze({}) as ContinuationPreviewToken
        const view = Object.freeze({ ...details, session: Object.freeze(details.session),
          binding: Object.freeze(details.binding), token, operationId, command })
        pendingPreview = { view, command: operation, cursor, expires: performance.now() + previewTtlMs }
        return view
      })
    },
    confirm(token, answer) {
      return request(() => {
        const preview = pendingPreview
        if (!preview || preview.view.token !== token) return fail('unavailable')
        pendingPreview = undefined
        if (answer !== true) return null
        if (performance.now() >= preview.expires) return fail('unavailable')
        const { view } = preview
        const next = snapshot(view.command)
        if (canonical(next.session) !== canonical(view.session) || canonical(next.binding) !== canonical(view.binding)
          || next.task?.revision !== view.task?.revision || next.nativeNext !== view.nativeNext || next.cursor !== preview.cursor) return fail('revision')
        const host = lifecycle()
        const receipt = host.execute(host.confirm(next.session, preview.command))
        if (receipt.after.binding.revision >= knownBinding.revision) knownBinding = receipt.after.binding
        return receipt
      })
    },
    newSession(signal) {
      return request(async () => {
        mutable()
        const previous = current()
        idle(previous)
        pendingPreview = undefined
        const limit = deadline(signal)
        try {
          await sync(previous, limit)
          await runtime.closeSession(previous, limit)
          if (ctx.sessions.get(previous.id)) return fail('conflict')
          ingestion?.detach(previous)
          const final = await reconcileKnownDshSession(ctx, ingestionOptions, ref(previous), limit)
          if (final.next !== previous.seq) return fail('gap')
          const replacement = await createSession(limit)
          return replacement
        } catch (error) { block(error, limit); throw error }
      })
    },
    sync(signal) {
      return request(async () => {
        mutable()
        const session = current()
        idle(session)
        const limit = deadline(signal)
        try { return await sync(session, limit) } catch (error) { block(error, limit); throw error }
      })
    },
    sample(signal) {
      return request(async () => {
        mutable()
        const session = current()
        idle(session)
        pendingPreview = undefined
        const limit = deadline(signal)
        try {
          store.continuationSource(reader, ref(session))
          limit.throwIfAborted()
          await runtime.runSample(session, limit)
          return { synthetic: true, next: await sync(session, limit) }
        } catch (error) { block(error, limit); throw error }
      })
    },
    status() {
      return request(() => {
        const session = live.get()
        const identity = session ? ref(session) : null
        let binding: ContinuationStatus['binding'] = null
        let identityReady = false
        if (identity && store.permits(reader)) {
          try {
            store.continuationSource(reader, identity)
            if (!blocked && ctx.sessions.get(SessionId(identity.sessionId)) === session) knownBinding = lifecycle().state(identity).binding
            binding = knownBinding
            identityReady = !!binding.taskId && !!store.read(reader, binding.taskId)?.snapshot.task
          } catch (error) { block(error) }
        }
        const remaining = pending()
        return { workspaceId, session: identity, binding, identity: identityReady ? 'identity_ready' : 'identity_unbound',
          history: !blocked && store.permits(reader) && remaining === 0 ? 'history_ready' : 'history_incomplete',
          modelContext: 'model_context_not_enabled', recovery: blocked ? 'recovery_blocked' : 'ready', reason: blocked,
          pending: remaining, reconciledSessions, recoveredEvents }
      })
    },
    tasks(limit, cursor) { return request(() => store.continuationTasks(reader, limit, cursor)) },
    history(taskId, limit) {
      return request(() => {
        const target = task(taskId)
        const events = store.facts(reader, taskId, limit).map(({ fact, attribution }): ContinuationHistoryEvent => {
          if (attribution.kind !== 'assigned' || attribution.taskId !== taskId) return fail('corrupt')
          store.continuationSource(reader, fact.source.session)
          return { session: fact.source.session, localSeq: fact.source.localSeq, kind: fact.detail.kind, via: attribution.via,
            ...('callSeq' in fact.detail && fact.detail.callSeq !== undefined ? { callSeq: fact.detail.callSeq } : {}) }
        })
        read()
        return { ...target, history: !blocked && pending() === 0 ? 'history_ready' : 'history_incomplete', events }
      })
    },
    sessions() { return request(() => store.continuationSessions(reader)) },
    receipts(identity, after, limit) { return request(() => store.continuationReceipts(reader, identity, after, limit)) },
    close(signal) {
      if (closeResult) return Promise.resolve(closeResult)
      const limit = deadline(signal)
      closing = true
      pendingPreview = undefined
      cleanup ??= enqueue(async () => {
        const session = live.get()
        try {
          if (!blocked && session) {
            idle(session)
            await sync(session, limit)
            await runtime.closeSession(session, limit)
            ingestion?.detach(session)
            const final = await reconcileKnownDshSession(ctx, ingestionOptions, ref(session), limit)
            if (final.next !== session.seq) fail('gap')
          }
        } catch (error) { block(error, limit) }
        const remaining = pending()
        ingestion?.dispose()
        try { await runtime.dispose() } catch (error) {
          block(error, limit)
          cleanup = undefined
          return { saved: false, pending: remaining, reason: blocked }
        }
        store.close()
        lease.close()
        return closeResult = { saved: !blocked && !limit.aborted && remaining === 0,
          pending: remaining, reason: blocked ?? (limit.aborted ? 'timeout' : null) }
      })
      return observeClose(cleanup, limit, pending)
    },
  }
  return Object.freeze(host)
}
