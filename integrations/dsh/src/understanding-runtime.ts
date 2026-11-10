import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'
import type { WorkspaceScope, UnderstandingModel, UnderstandingPacket } from '@acmi/contracts'
import {
  analyzeUnderstanding, boundedText, buildUnderstandingPacket, isTaskId, isUnderstandingTrigger,
  understandingCandidateLimit, understandingFactLimit, understandingOutputLimit,
} from '@acmi/core'
import { GraphStoreError } from './graph-store-db.ts'
import type { LocalGraphStore } from './graph-store.ts'
import { continuityDigest as sha } from './local-digest.ts'
import { digestId, type UnderstandingTarget, type UnderstandingRequest } from './understanding-host.ts'

interface ScriptEntry { readonly evidenceId: string; readonly json: string; readonly delayMs?: number }
export interface UnderstandingRuntimeOptions {
  readonly enabled: boolean
  readonly synthetic: boolean
  readonly store: LocalGraphStore
  readonly scope: WorkspaceScope
  readonly writer: WorkspaceScope
  readonly targets: readonly UnderstandingTarget[]
  // Only a pre-approved synthetic fixture lookup by exact fact ID, never Journal access.
  readonly excerpt?: (evidenceId: string) => string | undefined
  readonly script?: readonly ScriptEntry[]
  readonly concurrency?: number
  readonly pageSize?: number
  readonly debounceMs?: number
  readonly maxWaitMs?: number
  readonly pollMs?: number
  readonly attemptMs?: number
  readonly retries?: number
}
export type DshUnderstandingOptions = Omit<UnderstandingRuntimeOptions, 'enabled' | 'synthetic' | 'store' | 'scope' | 'writer'>
interface Lane {
  target: UnderstandingTarget
  first: number
  due: number
  attempts: number
  error?: string
  degraded: boolean
}
const bounded = (raw: number | undefined, fallback: number, min: number, max: number): number => {
  const n = raw ?? fallback
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new GraphStoreError('invalid')
  return n
}

/** Fixed, offline scripted mock. There is no URL, credential, plugin loader or transport. */
export function createScriptedUnderstandingMock(entries: readonly ScriptEntry[]) {
  if (!Array.isArray(entries) || entries.length > 128) throw new GraphStoreError('invalid')
  const byId = new Map<string, { json: string; delayMs: number }>()
  for (const { evidenceId, json, delayMs } of entries) {
    if (!digestId(evidenceId) || byId.has(evidenceId) || typeof json !== 'string' || json.length > understandingOutputLimit) {
      throw new GraphStoreError('invalid')
    }
    byId.set(evidenceId, { json, delayMs: bounded(delayMs, 0, 0, 5000) })
  }
  return Object.freeze({ async propose(packet: UnderstandingPacket, signal?: AbortSignal): Promise<string> {
    const entry = packet.facts.some(f => f.eventId === packet.anchorId) ? byId.get(packet.anchorId) : undefined
    signal?.throwIfAborted()
    if (entry?.delayMs) await delay(entry.delayMs, undefined, { signal })
    return entry?.json ?? '[]'
  } } satisfies UnderstandingModel)
}

/** Work is bounded by configured Task lanes, not by incoming notification count. */
export function startUnderstandingRuntime(options: UnderstandingRuntimeOptions) {
  const { store, scope, writer, excerpt } = options
  if (options.enabled !== true || options.synthetic !== true || !store.permitsUnderstanding(scope) || !store.permitsWrite(writer)) return null
  const limit = bounded(options.pageSize, 16, 1, understandingFactLimit)
  const concurrency = bounded(options.concurrency, 2, 1, 4)
  const debounce = bounded(options.debounceMs, 20, 1, 1000)
  const maxWait = bounded(options.maxWaitMs, Math.max(100, debounce), debounce, 5000)
  const poll = bounded(options.pollMs, 1000, 10, 60_000)
  const attempt = bounded(options.attemptMs, 500, 5, 5000)
  const retries = bounded(options.retries, 2, 0, 5)
  if (!Array.isArray(options.targets) || !options.targets.length || options.targets.length > 8) throw new GraphStoreError('invalid')
  const lanes = new Map<string, Lane>()
  for (const target of options.targets as readonly UnderstandingTarget[]) {
    if (!isTaskId(target.taskId) || !store.read(scope, target.taskId) || lanes.has(target.taskId)
      || !Array.isArray(target.candidates) || target.candidates.length > understandingCandidateLimit) throw new GraphStoreError('invalid')
    lanes.set(target.taskId, { target: { ...target, candidates: target.candidates.map(c => ({ ...c })) },
      first: Infinity, due: Infinity, attempts: 0, degraded: false })
  }
  const mock = options.script ? createScriptedUnderstandingMock(options.script) : undefined
  const abort = new AbortController()
  const running = new Map<string, Promise<void>>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let wakeAt = Infinity
  let nextPoll = performance.now() + poll
  let quanta = 0, analyses = 0, mockRequests = 0, retryCount = 0, highWater = 0, coalesced = 0, noise = 0, maxDelta = 0
  const allowed = () => !abort.signal.aborted && store.permitsUnderstanding(scope) && store.permitsWrite(writer)

  function signalLane(lane: Lane, now: number) {
    if (lane.degraded || lane.attempts) return
    if (lane.due !== Infinity) coalesced++
    lane.first = Math.min(lane.first, now)
    lane.due = Math.min(lane.first + maxWait, now + debounce)
  }
  function schedule() {
    if (!allowed()) return
    const due = Math.min(nextPoll, ...[...lanes.entries()].map(([id, lane]) =>
      running.size < concurrency && !running.has(id) && !lane.degraded ? lane.due : Infinity))
    if (due >= wakeAt) return
    clearTimeout(timer)
    wakeAt = due
    timer = setTimeout(pump, Math.max(0, Math.ceil(due - performance.now())))
    timer.unref()
  }
  function wake() {
    if (!allowed()) return
    const now = performance.now()
    for (const lane of lanes.values()) signalLane(lane, now)
    schedule()
  }
  async function quantum(lane: Lane) {
    const { target } = lane
    const id = target.taskId
    const signal = AbortSignal.any([AbortSignal.timeout(attempt), abort.signal])
    try {
      quanta++
      let page = store.understandingPage(scope, id, limit)
      const originalSize = page.facts.length
      if (!originalSize) { lane.attempts = 0; delete lane.error; return }
      const boundary = page.facts.findIndex(r => isUnderstandingTrigger(r.fact.detail.kind))
      const span = boundary < 0 ? limit : boundary + 1
      if (span < originalSize) page = store.understandingPage(scope, id, span)
      maxDelta = Math.max(maxDelta, page.facts.length)
      const move = { after: page.after, through: page.through, limit: span }
      const anchor = [...page.facts].reverse().find(r => isUnderstandingTrigger(r.fact.detail.kind))
      if (!anchor) {
        store.skipUnderstandingNoise(scope, writer, id, move)
        noise += page.facts.length
      } else {
        const anchorId = anchor.fact.eventId
        const text = anchor.fact.detail.kind === 'user' ? excerpt?.(anchorId) : undefined
        if (text !== undefined && !boundedText(text, 1024)) throw new GraphStoreError('invalid')
        const request: UnderstandingRequest = { ...target, synthetic: true, anchorId,
          evidenceIds: page.facts.map(r => r.fact.eventId),
          pending: store.listUnderstanding(scope, id, 8).filter(item => !item.review && !item.risks.length).map(item => item.proposal.id),
          ...(text !== undefined ? { user: { provenance: 'synthetic_host_excerpt', evidenceId: anchorId, text } } : {}) }
        const input = store.prepareUnderstanding(scope, request)
        const packet = mock && target.mode !== 'rules' && target.mode !== 'abstention-first' ? buildUnderstandingPacket(input, sha) : null
        if (packet) mockRequests++
        const json = packet && mock ? await mock.propose(packet, signal) : undefined
        signal.throwIfAborted()
        if (!allowed()) return
        const proposal = analyzeUnderstanding(input, sha, json, target.mode)
        store.stageUnderstanding(scope, writer, request, json, proposal, move)
        analyses++
      }
      lane.attempts = 0
      delete lane.error
      if (originalSize === limit || span < originalSize) lane.due = performance.now()
    } catch (error) {
      if (!allowed()) return
      const code = error instanceof GraphStoreError ? error.code : signal.aborted ? 'timeout' : 'io'
      lane.error = code
      if (['busy', 'io', 'revision', 'timeout'].includes(code) && lane.attempts < retries) {
        retryCount++
        lane.due = performance.now() + Math.min(1000, debounce * 2 ** ++lane.attempts)
      } else { lane.degraded = true; lane.due = Infinity }
    }
  }
  function pump() {
    wakeAt = Infinity
    if (!allowed()) return
    const now = performance.now()
    if (now >= nextPoll) {
      nextPoll = now + poll
      for (const lane of lanes.values()) signalLane(lane, now)
    }
    for (const [id, lane] of [...lanes]) {
      if (running.size >= concurrency) break
      if (lane.degraded || lane.due > now || running.has(id)) continue
      lanes.delete(id)
      lanes.set(id, lane)
      lane.due = lane.first = Infinity
      const flight = Promise.resolve().then(() => quantum(lane)).finally(() => { running.delete(id); schedule() })
      running.set(id, flight)
      highWater = Math.max(highWater, running.size)
    }
    schedule()
  }
  wake()
  return {
    wake,
    request(taskId: string) {
      const lane = allowed() ? lanes.get(taskId) : undefined
      if (!lane || running.has(taskId)) return false
      lane.degraded = false
      lane.attempts = 0
      lane.first = lane.due = performance.now()
      schedule()
      return true
    },
    status(taskId: string) {
      const lane = allowed() ? lanes.get(taskId) : undefined
      return lane ? { active: running.has(taskId), degraded: lane.degraded, error: lane.error, attempts: lane.attempts } : null
    },
    metrics: () => ({ quanta, analyses, mockRequests, providerRequests: 0, active: running.size, highWater, retryCount, coalesced, noise, maxDelta }),
    async stop() {
      abort.abort()
      clearTimeout(timer)
      await Promise.all(running.values())
    },
  }
}
