import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { LayeredState, selectLayeredShadowWork } from '../src/layered-state.ts'

const sha = s => createHash('sha256').update(s).digest('hex')
const input = (cursor, overrides = {}, digest = sha(`cursor-${cursor}`), fromCursor = cursor - 1) => ({
  cut: { workspaceId: 'work', sessionId: 'session', incarnation: 'birth', authorizationEpoch: 1,
    bindingRevision: 1, graphRevision: 3, sourceRevision: 2, candidateRevision: 1, policyVersion: 'p1', cursor, ...overrides },
  bindingTaskId: 'trusted-a', digest, fromCursor,
})
const complete = ({ memory }) => ({ status: 'complete', value: [...memory.recentTaskIds], updates: {
  recentTaskIds: ['observed-b'], unresolvedRefs: ['ref'], pendingProposalIds: ['draft'], recentTurnFeatures: ['request'],
} })

test('bounded state is workspace/session-local, immutable and never substitutes a binding', async () => {
  const state = new LayeredState()
  expect((await state.run(input(1), complete)).status).toBe('evaluated')
  const warm = await state.run(input(2), ({ memory, bindingTaskId, lastAnalyzedCursor }) => {
    expect(bindingTaskId).toBe('trusted-a')
    expect(lastAnalyzedCursor).toBe(1)
    expect(Object.isFrozen(memory.recentTaskIds)).toBe(true)
    return { status: 'complete', value: memory, updates: { recentTaskIds: ['two', 'three', 'four', 'five', 'six', 'x x'] } }
  })
  expect(warm.value.recentTaskIds).toEqual(['observed-b'])
  expect((await state.run(input(3), ({ memory }) => ({ status: 'complete', value: memory.recentTaskIds }))).value)
    .toEqual(['two', 'three', 'four', 'five'])
  expect((await state.run(input(2, { sessionId: 'other' }), complete)).value).toEqual([])
  expect((await state.run(input(2, { workspaceId: 'foreign' }), complete)).value).toEqual([])
})

test.each([
  ['incarnation_changed', 1, { incarnation: 'recreated' }, 0],
  ['source_gap', 4, {}, 3],
  ['graph_rewind', 2, { graphRevision: 2 }, 1],
  ['binding_changed', 2, { bindingRevision: 2 }, 1],
  ['authorization_changed', 2, { authorizationEpoch: 2 }, 1],
  ['source_changed', 2, { sourceRevision: 3 }, 1],
  ['candidate_changed', 2, { candidateRevision: 2 }, 1],
  ['policy_changed', 2, { policyVersion: 'p2' }, 1],
])('invalidates cached interpretation on %s', async (reason, cursor, cut, from) => {
  const state = new LayeredState()
  await state.run(input(1), complete)
  const next = await state.run(input(cursor, cut, sha('next'), from), complete)
  expect(next).toMatchObject({ status: 'evaluated', value: [], invalidations: [reason] })
})

test('TTL clears memory without reanalyzing duplicates; collisions quarantine that cursor', async () => {
  let tick = 1
  const state = new LayeredState({ now: () => tick, ttlMs: 5 })
  await state.run(input(1), complete)
  tick = 6
  const refused = () => { throw new Error('duplicate work must never start') }
  expect(await state.run(input(1), refused)).toEqual({ status: 'duplicate', invalidations: ['ttl_expired'] })
  expect((await state.run(input(2), complete)).value).toEqual([])
  expect(await state.run(input(1), refused)).toEqual({ status: 'stale' })
  expect(await state.run(input(2, {}, sha('collision')), refused)).toEqual({ status: 'collision', invalidations: ['cursor_collision'] })
  expect((await state.run(input(2), refused)).status).toBe('collision')
  expect((await state.run(input(3), complete)).value).toEqual([])
})

test('skip advances trusted cursor without analysis, and untrusted/unexpected metadata never skips', async () => {
  const state = new LayeredState()
  await state.run(input(1), complete)
  expect((await state.run(input(5, {}, sha('s'), 1), () => ({ status: 'skip' }))).status).toBe('skipped')
  expect(await state.run(input(6), ({ lastAnalyzedCursor, memory }) => ({ status: 'complete', value: { lastAnalyzedCursor, memory } })))
    .toMatchObject({ status: 'evaluated', invalidations: [], value: { lastAnalyzedCursor: 1, memory: { recentTaskIds: ['observed-b'] } } })
  expect(selectLayeredShadowWork({ actor: 'host', kind: 'metadata', cursor: 7 }, 'gated')).toBe('skip_metadata')
  expect(selectLayeredShadowWork({ actor: 'host', kind: 'metadata', cursor: 8 }, 'gated')).toBe('sample_metadata')
  expect(selectLayeredShadowWork({ actor: 'host', kind: 'metadata', cursor: 7 }, 'ungated')).toBe('analyze')
  expect(selectLayeredShadowWork({ actor: 'user', kind: 'metadata', cursor: 7 }, 'gated')).toBe('analyze')
  expect(selectLayeredShadowWork({ actor: 'host', kind: 'authorization', cursor: 7 }, 'gated')).toBe('analyze')
})

test('per-session single flight, global capacity, and cancellation preserve backpressure without a queue', async () => {
  const state = new LayeredState({ concurrency: 2 })
  const one = Promise.withResolvers()
  const two = Promise.withResolvers()
  const cancel = { cancelled: false }
  const a = state.run(input(1), () => one.promise, cancel)
  const b = state.run(input(1, { sessionId: 'other' }), () => two.promise)
  expect((await state.run(input(2), complete)).status).toBe('busy_session')
  expect((await state.run(input(1, { sessionId: 'third' }), complete)).status).toBe('busy_global')
  cancel.cancelled = true
  one.resolve({ status: 'complete', value: 1 })
  two.resolve({ status: 'complete', value: 2 })
  expect((await a).status).toBe('cancelled')
  expect((await b).status).toBe('evaluated')
  expect(state.metrics()).toEqual({ cachedSessions: 1, inFlight: 0, highWater: 2 })
  expect((await state.run(input(1), complete)).value).toEqual([])
})

test('bounded retry, failure, and stale results do not commit the cursor', async () => {
  const state = new LayeredState({ maxRetries: 1 })
  const attempts = []
  const retried = await state.run(input(1), ({ attempt }) => {
    attempts.push(attempt)
    return { status: 'retry' }
  })
  expect(attempts).toEqual([0, 1])
  expect(retried).toEqual({ status: 'failed' })
  expect((await state.run(input(1), () => ({ status: 'stale' }))).status).toBe('stale')
  expect((await state.run(input(1), complete)).status).toBe('evaluated')
  expect((await state.run(input(2, { authorizationEpoch: 0 }), complete)).status).toBe('stale')
})

test('metadata skip does not extend interpretation TTL', async () => {
  let tick = 1
  const state = new LayeredState({ now: () => tick, ttlMs: 5 })
  await state.run(input(1), complete)
  tick = 4
  await state.run(input(2), () => ({ status: 'skip' }))
  tick = 6
  expect(await state.run(input(3), complete)).toMatchObject({ status: 'evaluated', value: [], invalidations: ['ttl_expired'] })
})

test('monotonic Graph revision invalidates old drafts without relabeling identity origins', async () => {
  const state = new LayeredState()
  const record = { taskId: 'observed-b', revision: 2, cursor: 1 }
  await state.run(input(1), () => ({ status: 'complete', value: null,
    updates: { pendingProposalIds: ['old-draft'], recentIdentities: [record] } }))
  expect(await state.run(input(2, { graphRevision: 4 }), ({ memory }) => ({ status: 'complete', value: memory })))
    .toMatchObject({ status: 'evaluated', invalidations: ['graph_changed'], value: { pendingProposalIds: [], recentIdentities: [record] } })
})

test('a Host cannot exceed the preregistered two-attempt budget', () => {
  expect(() => new LayeredState({ maxRetries: 2 })).toThrow(/Invalid layered state limits/)
})
