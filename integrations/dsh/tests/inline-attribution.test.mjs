import { expect, test } from 'vitest'

const { decodeInline, CausalAttribution } = process.env.ACMI_TEST_BUILT === '1'
  ? await import('../dist/inline-attribution.js') : await import('../src/inline-attribution.ts')

const candidates = [
  { handle: 'h_01234567', workHandle: 'w_01234567', taskId: 'task-a', workId: 'work-a', workspace: 'local', revision: 1 },
  { handle: 'h_01234568', workHandle: 'w_01234568', taskId: 'task-b', workId: 'work-b', workspace: 'local', revision: 1 },
]
const context = { generation: 'g_host', turnRef: 'u_host', workspace: 'local', revision: 1, candidates,
  current: '🌱 Cedar', prior: 'Archive Cedar', toolAvailable: true }
const response = () => ({
  assistant_response: 'Cedar deliverable.',
  acmi_attribution: { version: 1, generation_ref: 'g_host', source_user_turn_ref: 'u_host',
    user: candidates[0].handle, response: candidates[1].handle, work: candidates[0].workHandle,
    support: 'sufficient', related: [candidates[1].handle], evidence: [{ source: 'current', quote: 'Cedar' }] },
  actions: [
    { ref: 'a1', key: 'amber', task: candidates[0].handle, work: candidates[0].workHandle },
    { ref: 'a2', key: 'indigo', task: candidates[1].handle, work: candidates[1].workHandle },
  ],
})
const decode = (value, overrides = {}, stop = 'eos') => decodeInline(JSON.stringify(value), stop, 'B', { ...context, ...overrides })

test('one completion yields separate native answer and scoped proposal with UTF-16 evidence', () => {
  const result = decode(response())
  expect(result.answer).toBe('Cedar deliverable.')
  expect(result.proposal).toMatchObject({ generation: 'g_host', user: 'task-a', response: 'task-b', work: 'work-a',
    related: ['task-b'], evidence: [{ source: 'current', start: 3, end: 8 }] })
  expect(result.actions.map(a => a.task)).toEqual(['task-a', 'task-b'])
})

test('incomplete, duplicated, stale, out of scope, unknown and echoed metadata fail closed', () => {
  expect(() => decode(response(), {}, 'limit')).toThrow('TRUNCATED')
  expect(() => decodeInline('{"assistant_response":"x","assistant_response":"y"}', 'eos', 'A', context)).toThrow()
  expect(() => decode(response(), { revision: 2 })).toThrow('STALE_OR_SCOPE')
  expect(() => decode(response(), { generation: 'g_other' })).toThrow('GENERATION_OR_TURN')
  expect(() => decode(response(), { current: 'Cedar Cedar' })).toThrow('EVIDENCE')
  for (const field of ['user', 'response', 'work']) {
    const reply = response()
    reply.acmi_attribution[field] = 'forged'
    expect(() => decode(reply)).toThrow()
  }
  for (const leaked of ['acmi_attribution', 'H_01234567', 'g_host', 'task-a', 'source_user_turn_ref']) {
    expect(() => decode({ ...response(), assistant_response: leaked })).toThrow('METADATA_ECHO')
  }
  expect(() => decode({ ...response(), actions: [response().actions[0], response().actions[0]] })).toThrow('DUPLICATE_ACTION')
  expect(() => decode({ ...response(), actions: [{ ...response().actions[0], key: 'shell' }] })).toThrow()
  expect(() => decode({ ...response(), autoBind: true })).toThrow()
})

test('new task is a temporary proposal, not a minted identity', () => {
  const r = response()
  Object.assign(r.acmi_attribution, { user: 'new', response: 'new', work: '-', proposal: { local_ref: 'p1', objective: 'New guide' } })
  expect(decode(r).proposal).toMatchObject({ user: 'new', work: null, temporary: { local_ref: 'p1', objective: 'New guide' } })
  r.acmi_attribution.proposal.local_ref = '0bc93cab-a4f4-41e2-a547-1b816ab38482'
  expect(() => decode(r)).toThrow()
})

test('late and retried results use the originating scoped call, not arrival binding', () => {
  const ledger = new CausalAttribution()
  const origin = { workspace: 'local', session: 's1#1', callId: 'call1' }
  const call = { ...origin, generation: 'g1', ref: 'a1', task: 'task-a', work: 'work-a', execution: 'e1', causation: 'evt1' }
  ledger.recordCall(call)
  ledger.recordCall(call)
  expect(() => ledger.recordCall({ ...call, task: 'task-b' })).toThrow('CAUSAL_CONFLICT')
  ledger.recordCall({ ...call, callId: 'retry1', generation: 'g2', task: 'task-b', causation: 'evt2' })
  expect(ledger.result({ ...origin, session: 's1#2' })).toBeNull()
  expect(ledger.result({ ...origin, workspace: 'external' })).toBeNull()
  expect(ledger.result({ ...origin, callId: 'retry1' })).toMatchObject({ task: 'task-b', causation: 'evt2' })
  expect(ledger.result(origin)).toEqual(call)
})

test('child failure and out-of-order completion cannot accept results or satisfy joins', () => {
  const ledger = new CausalAttribution()
  const base = { workspace: 'local', session: 's1#1', generation: 'g1', task: 'task-a', work: 'work-a', execution: 'parent' }
  for (const [i, child] of ['child-1', 'child-2'].entries()) {
    const call = { ...base, callId: 'c' + i, ref: 'a' + i, causation: 'evt' + i }
    ledger.recordCall(call)
    ledger.linkChild(call, child)
  }
  expect(ledger.childResult('local', 'child-2', 'cancelled')).toMatchObject({ parent: base, status: 'cancelled', accepted: false, joinSatisfied: false })
  expect(ledger.childResult('local', 'child-1', 'completed')).toMatchObject({ parent: base, status: 'completed', accepted: false, joinSatisfied: false })
  expect(ledger.childResult('external', 'child-1', 'failed')).toBeNull()
})
