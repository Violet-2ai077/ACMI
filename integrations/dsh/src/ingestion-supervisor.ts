import { performance } from 'node:perf_hooks'
import { canonical } from '@acmi/core'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import type { RuntimeWorkAssignment } from './graph-store.ts'
import { GraphStoreError } from './graph-store-db.ts'
import { ScopedJournalError } from './journal-format.ts'
import { registerDshRuntimeIngestion, type DshIngestionOptions } from './runtime-ingestion.ts'

export interface DshSupervisorOptions extends DshIngestionOptions {
  readonly authorize: (session: Session) => { readonly assignment?: RuntimeWorkAssignment } | null
  readonly maxSessions?: number
  readonly debounceMs?: number
  readonly maxWaitMs?: number
  readonly pollMs?: number
  readonly queueLimit?: number
  readonly sessionQueueLimit?: number
  readonly batchRows?: number
  readonly batchMs?: number
  readonly attemptMs?: number
  readonly retries?: number
  readonly retryBaseMs?: number
}

interface Work {
  readonly assignment: string
  first: number
  oldest: number
  due: number
  attempt: number
  terminal?: string
  error?: string
  lastDrainAt?: number
  lastReconcileAt?: number
  probe?: ReturnType<NonNullable<Awaited<ReturnType<typeof registerDshRuntimeIngestion>>>['probe']>
}
function option(value: number | undefined, fallback: number, min: number, max: number) {
  const n = value ?? fallback
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new GraphStoreError('invalid')
  return n
}
function failure(error: unknown) {
  if (error instanceof GraphStoreError) return error.code
  if (error instanceof ScopedJournalError) {
    if (error.code === 'ACMI_JOURNAL_LIMIT') return 'limit'
    if (error.code === 'ACMI_JOURNAL_CHANGED' || error.code === 'ACMI_JOURNAL_BUSY') return 'busy'
    if (error.code === 'ACMI_JOURNAL_SCOPE') return 'scope'
    return 'corrupt'
  }
  return error instanceof DOMException && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'io'
}

/** Schedules only exact live, authorized Sessions. No Workspace-wide Journal discovery. */
export async function startDshIngestionSupervisor(ctx: Context, opts: DshSupervisorOptions) {
  const maxSessions = option(opts.maxSessions, 16, 1, 32)
  const debounce = option(opts.debounceMs, 20, 1, 5000)
  const maxWait = option(opts.maxWaitMs, 100, debounce, 10_000)
  const poll = option(opts.pollMs, 1000, 5, 60_000)
  const queueLimit = option(opts.queueLimit, 2048, 1, 2048)
  const sessionQueueLimit = option(opts.sessionQueueLimit, Math.min(256, queueLimit), 1, queueLimit)
  const batchRows = option(opts.batchRows, 32, 1, 128)
  const batchMs = option(opts.batchMs, 16, 1, 250)
  const attemptMs = option(opts.attemptMs, 8000, 10, 15_000)
  const retries = option(opts.retries, 4, 0, 12)
  const retryBase = option(opts.retryBaseMs, 50, 1, 1000)
  const work = new Map<Session, Work>()
  const abort = new AbortController()
  let phase: 'running' | 'stopping' | 'stopped' = 'running'
  let timer: ReturnType<typeof setTimeout> | undefined
  let busy: Session | undefined
  let flight: Promise<void> | undefined
  let shutdown: Promise<{ pending: number; timedOut: boolean; appendedAfterSeal: number }> | undefined
  let wakeAt = Infinity
  let nextPoll = performance.now() + poll
  let probes = 0, batches = 0, retryCount = 0, failures = 0, attachRejected = 0, authorityDetached = 0
  const ingestion = await registerDshRuntimeIngestion(ctx, opts, {
    queueLimit, sessionQueueLimit, batchRows, batchMs, retainOnDispose: true,
    allowed: session => Boolean(authorized(session)),
    notify(session) {
      const row = work.get(session)
      if (phase === 'stopped' || !row || row.terminal || row.attempt) return
      const now = performance.now()
      row.first = Math.min(row.first, now)
      row.oldest = Math.min(row.oldest, now)
      row.due = Math.min(row.first + maxWait, now + debounce)
      schedule(row.due)
    },
  })
  if (!ingestion) return null
  const feed = ingestion
  function authorized(session: Session) {
    if (!opts.store.permits(opts.scope) || !opts.store.permitsWrite(opts.writer)) return null
    try {
      const grant = opts.authorize(session)
      const row = work.get(session)
      return grant && (!row || canonical(grant.assignment ?? null) === row.assignment) ? grant : null
    } catch { return null }
  }
  function attach(session: Session) {
    if (phase !== 'running' || work.has(session) || ctx.agents.get(session.id)?.session !== session) return
    const grant = authorized(session)
    if (!grant) return
    if (work.size >= maxSessions) { attachRejected++; return }
    try {
      feed.attach(session, grant.assignment)
      const now = performance.now()
      work.set(session, { assignment: canonical(grant.assignment ?? null), first: Infinity, oldest: now, due: now, attempt: 0 })
      schedule(performance.now())
    } catch { attachRejected++ }
  }
  function detach(session: Session) {
    work.delete(session)
    feed.detach(session)
  }
  const stopCreated = ctx.on('agent/created', ({ agent }) => { attach(agent.session) }, { global: true })

  function schedule(at: number) {
    if (phase !== 'running' || flight || at >= wakeAt) return
    clearTimeout(timer)
    wakeAt = at
    timer = setTimeout(() => {
      wakeAt = Infinity
      flight = pump().finally(() => {
        flight = undefined
        let next = phase === 'running' ? nextPoll : Infinity
        for (const row of work.values()) if (!row.terminal) next = Math.min(next, row.due)
        schedule(next)
      })
    }, Math.max(0, Math.ceil(at - performance.now())))
    timer.unref()
  }
  function failed(session: Session, row: Work, error: unknown) {
    const code = failure(error)
    row.error = code
    if (code === 'gap' && row.probe && !row.probe.gap) {
      row.probe = { ...row.probe, gap: true }
      row.due = performance.now()
      return
    }
    if (['busy', 'io', 'timeout', 'unavailable'].includes(code) && row.attempt < retries) {
      retryCount++
      row.due = performance.now() + Math.min(4000, retryBase * 2 ** row.attempt++)
    } else {
      failures++
      row.terminal = code
      row.due = Infinity
      feed.releaseReplay(session)
    }
  }
  function probe(session: Session, row: Work) {
    const next = feed.probe(session)
    probes++
    row.probe = { ...next, gap: next.gap || (next.next < next.head && row.probe?.gap === true) }
    return row.probe
  }
  async function pump() {
    if (phase === 'stopped') return
    const now = performance.now()
    if (now >= nextPoll) {
      nextPoll = now + poll
      for (const [session, row] of work) {
        if (!authorized(session)) { authorityDetached++; detach(session); continue }
        if (row.terminal || row.attempt) continue
        try {
          const cut = probe(session, row)
          if (cut.next < cut.head) row.due = Math.min(row.due, now + maxWait)
        } catch (error) { failed(session, row, error) }
      }
    }
    for (const [session, row] of work) {
      if (row.terminal || row.due > now) continue
      if (!authorized(session)) { authorityDetached++; detach(session); continue }
      // Rotate after each bounded quantum, including failed attempts.
      work.delete(session)
      work.set(session, row)
      row.first = row.due = Infinity
      busy = session
      try {
        const cut = probe(session, row)
        if (cut.next < cut.head) {
          row.oldest = Math.min(row.oldest, now)
          const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(attemptMs)])
          await (cut.gap ? feed.reconcile(session, signal) : feed.drain(session, signal))
          if (cut.gap) row.lastReconcileAt = Date.now()
          else row.lastDrainAt = Date.now()
          batches++
        }
        if (phase === 'stopping' || work.has(session)) {
          row.attempt = 0
          delete row.error
          const after = probe(session, row)
          if (after.next < after.head) row.due = performance.now()
          else if (after.closed) detach(session)
          else row.oldest = Infinity
        }
      } catch (error) { if (work.has(session)) failed(session, row, error) } finally { busy = undefined }
      break
    }
  }
  async function stopWithin(deadlineMs: number) {
    phase = 'stopping'
    stopCreated()
    feed.seal()
    const deadline = performance.now() + deadlineMs
    clearTimeout(timer)
    wakeAt = Infinity
    let timeout: ReturnType<typeof setTimeout> | undefined
    let deadlineExpired = false
    const expired = new Promise<void>(resolve => {
      timeout = setTimeout(() => { deadlineExpired = true; abort.abort(); resolve() }, deadlineMs)
    })
    await Promise.race([expired, (async () => {
      await flight
      for (const row of work.values()) if (!row.terminal) row.due = performance.now()
      while (!abort.signal.aborted && performance.now() < deadline
        && [...work.values()].some(row => !row.terminal && row.due <= performance.now())) await pump()
    })()])
    clearTimeout(timeout)
    phase = 'stopped'
    clearTimeout(timer)
    abort.abort()
    let pending = 0
    let appendedAfterSeal = 0
    for (const [session, row] of work) {
      try {
        const cut = feed.probe(session)
        appendedAfterSeal += Math.max(0, session.seq - cut.head)
        if (cut.next < cut.head || row.terminal) pending++
      } catch { pending++ }
    }
    feed.dispose()
    work.clear()
    return { pending, timedOut: pending > 0 && (deadlineExpired || performance.now() >= deadline), appendedAfterSeal }
  }
  const stop = (deadlineMs = 500) => shutdown ??= stopWithin(option(deadlineMs, 500, 1, 5000))
  ctx.effect(() => () => { void stop() }, 'ACMI autonomous runtime ingestion supervisor')
  for (const agent of ctx.agents.list()) attach(agent.session)
  schedule(nextPoll)
  return {
    status(session: Session) {
      const row = work.get(session)
      if (!row || !authorized(session)) return null
      return { ...row.probe, error: row.error, attempts: row.attempt,
        oldestPendingMs: Number.isFinite(row.oldest) ? performance.now() - row.oldest : 0,
        lastDrainAt: row.lastDrainAt, lastReconcileAt: row.lastReconcileAt,
        phase: row.terminal ? 'degraded' : busy === session ? 'draining' : row.attempt ? 'retrying' : row.due !== Infinity ? 'pending' : 'idle' }
    },
    requestReconcile(session: Session) {
      const row = work.get(session)
      if (phase !== 'running' || !row || !authorized(session)) return false
      delete row.terminal
      row.attempt = 0
      try { row.probe = { ...probe(session, row), gap: true } } catch (error) { failed(session, row, error); schedule(row.due); return false }
      row.due = performance.now()
      schedule(row.due)
      return true
    },
    metrics: () => ({ phase, tracked: work.size, probes, batches, retryCount, failures, attachRejected, authorityDetached, ...feed.metrics() }),
    stop,
  }
}
