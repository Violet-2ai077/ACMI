import { describe, expect, it } from 'vitest'
import { project, taskHistory } from '@acmi/core'

const a = '11111111-1111-4111-8111-111111111111'
const b = '22222222-2222-4222-8222-222222222222'
const session = sessionId => ({ adapterId: 'fixture', instanceId: 'local', sessionId, incarnation: '1' })
const ref = (sessionId, localSeq) => ({ session: session(sessionId), sourceRevision: 'r1', localSeq })
const tasks = [a, b].map(taskId => ({ taskId, workspaceId: 'work', status: 'open' }))
const bind = (id, seq, taskId) => ({ kind: 'bind', ref: ref(id, seq), taskId })
const msg = (id, seq, turnId) => ({ kind: 'user', ref: ref(id, seq), turnId })
const edge = (id, seq, kind, turnId) => ({ kind, ref: ref(id, seq), turnId, stepId: 'step', toolCallId: 'reused' })

describe('normalized ACMI projection', () => {
  it('keeps A -> B -> A revisions local and attributes a late tool result to its exact call', () => {
    const events = [
      bind('one', 1, a),
      edge('one', 2, 'tool-call', 'a-turn'),
      bind('one', 3, b),
      edge('one', 4, 'tool-call', 'b-turn'),
      { ...edge('one', 5, 'tool-result', 'a-turn'), originalCall: ref('one', 2) },
      bind('one', 6, a),
      msg('one', 7),
      bind('two', 1, a),
      msg('two', 2),
      msg('three', 1),
    ]
    const rows = project(events, tasks)
    expect(rows.find(row => row.ref.localSeq === 5)?.attribution).toMatchObject({
      kind: 'bound', method: 'original-call', binding: { taskId: a, revision: 1 },
    })
    expect(taskHistory(rows, a).map(row => [row.ref.session.sessionId, row.attribution.binding.revision])).toEqual([
      ['one', 1], ['one', 1], ['one', 3], ['two', 1],
    ])
    expect(rows.at(-1)?.attribution.kind).toBe('unresolved')
    expect(project(events, tasks)).toEqual(rows)
  })

  it('keeps user input unresolved in a switching turn and rejects a foreign causal reference', () => {
    const result = { ...edge('two', 4, 'tool-result', 't'), originalCall: ref('one', 2) }
    const events = [
      bind('one', 1, a), edge('one', 2, 'tool-call', 't'),
      msg('one', 3, 'switch'), { ...bind('one', 4, b), turnId: 'switch' },
      bind('two', 1, b), result,
    ]
    const rows = project(events, tasks)
    expect(rows.find(row => row.ref.session.sessionId === 'one' && row.ref.localSeq === 3)?.attribution.kind).toBe('unresolved')
    expect(rows.at(-1)?.attribution.kind).toBe('unresolved')
  })

  it('does not silently accept duplicate source coordinates or unknown tasks', () => {
    expect(() => project([msg('one', 1), msg('one', 1)], tasks)).toThrow('sequence')
    expect(() => project([bind('one', 1, 'unknown')], tasks)).toThrow('task')
  })

  it('keeps native user inputs unresolved without a completed turn and accepts only one result per call', () => {
    const mark = (seq, kind, turnId) => ({ ref: ref('one', seq), kind, turnId })
    const events = [
      bind('one', 1, a),
      msg('one', 2),
      mark(3, 'turn-open', 'done'), msg('one', 4, 'done'),
      edge('one', 5, 'tool-call', 'done'),
      { ...edge('one', 6, 'tool-result', 'done'), originalCall: ref('one', 5) },
      { ...edge('one', 7, 'tool-result', 'done'), originalCall: ref('one', 5) },
      mark(8, 'turn-complete', 'done'),
      mark(9, 'turn-open', 'pending'), msg('one', 10, 'pending'),
    ]
    const rows = project(events, tasks, { requireTurnEvidence: true })
    expect(rows.map(row => [row.ref.localSeq, row.attribution.kind, row.attribution.reason])).toEqual([
      [2, 'unresolved', 'no-turn'], [4, 'bound', undefined], [5, 'bound', undefined],
      [6, 'bound', undefined], [7, 'unresolved', 'missing-or-invalid-call'], [10, 'unresolved', 'turn-open'],
    ])
  })
})
