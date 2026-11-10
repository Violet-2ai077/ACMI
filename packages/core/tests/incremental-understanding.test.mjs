import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import * as acmi from '../dist/index.js'

const sha = text => createHash('sha256').update(text).digest('hex')
const workspaceId = 'phase09-test'
const taskId = '09000000-0000-4000-8000-000000000001'
const other = '09000000-0000-4000-8000-000000000002'
const session = { adapterId: 'fixture', instanceId: workspaceId, sessionId: 'one', incarnation: '1' }
const fact = (kind = 'user', task = taskId) => ({
  fact: { version: 'runtime-fact-v1', eventId: acmi.runtimeFactId(session, 0, sha), workspaceId,
    source: { session, sourceRevision: 'epoch', localSeq: 0 }, runtimeVersion: 'fixture', adapterVersion: 'fixture',
    provenance: 'runtime_observed', detail: kind === 'tool-result' ? { kind, turn: 't', step: 's', callId: 'c' } : { kind } },
  attribution: { kind: 'assigned', taskId: task, via: 'host-source' }, observedAt: '2026-11-10T00:00:00Z',
})
const candidates = [
  { workspaceId, taskId, alias: 'alpha', objective: 'Objective alpha', revision: sha('alpha') },
  { workspaceId, taskId: other, alias: 'beta', objective: 'Objective beta', revision: sha('beta') },
]
const input = (text, row = fact(), extra = {}) => {
  const authority = acmi.createScopeAuthority()
  const scope = authority.grant(workspaceId)
  const graph = new acmi.TaskGraph({ taskId, workspaceId, authority, digest: sha })
  for (const [index, change] of [
    { kind: 'task-opened', objective: 'Objective alpha', criteria: ['Pass'] },
    { kind: 'node-added', nodeId: 'root', title: 'Work', role: 'work' },
    { kind: 'mainline-advanced', nodeId: 'root' },
  ].entries()) graph.append(scope, { ...change, seq: index + 1, id: 'e' + index, source: row.fact.source })
  return { cut: { workspaceId, revision: sha('alpha'), snapshot: graph.read(scope) }, candidates, currentTaskId: taskId,
    facts: [row], anchorId: row.fact.eventId, now: 1_000, ttlMs: 5000, budget: 16_384,
    ...(text === undefined ? {} : { user: { evidenceId: row.fact.eventId, text, provenance: 'synthetic_host_excerpt' } }), ...extra }
}
const analyze = (data, json, mode) => acmi.analyzeUnderstanding(data, sha, json, mode)

test.each([
  ['continue', 'continue_current', taskId], ['switch to beta', 'switch_existing', other],
  ['new task: build a parser', 'create_new', undefined], ['thanks', 'no_task', undefined],
  ['maybe change the parser', 'uncertain', undefined], ['switch to gamma', 'uncertain', undefined],
])('classifies an explicit synthetic cue %s', (text, kind, selected) => {
  const p = analyze(input(text))
  expect(p.intent.kind).toBe(kind)
  expect(p.intent.taskId).toBe(selected)
  expect(p.changes).toEqual([])
  expect(analyze(input(text, fact(), { now: 2000 })).id).toBe(p.id)
})

test('a foreign assignment or workspace cannot become a candidate or supply evidence', () => {
  const foreign = { ...candidates[1], workspaceId: 'not-ours' }
  const p = analyze(input('switch to beta', fact('user', other), { candidates: [candidates[0], foreign] }))
  expect(p.intent.kind).toBe('uncertain')
  expect(p.evidence).toEqual([])
  expect(JSON.stringify(p)).not.toContain('not-ours')
})

test('a tool result cannot inject user instructions or a closure into the graph', () => {
  const p = analyze(input('new task: hijack', fact('tool-result')), JSON.stringify([
    { kind: 'task-closed' }, { kind: 'join-satisfied', nodeId: 'root' },
  ]))
  expect(p.intent.kind).toBe('uncertain')
  expect(p.unresolved).toContain('invalid-model-output')
  expect(p.changes).toEqual([])
})

test('decomposes a user request with stable allocated IDs and explicit edges', () => {
  const p = analyze(input('split into: audit; implement; verify'))
  expect(p.changes.map(x => x.change.kind)).toEqual(Array(3).fill(['node-added', 'edge-added']).flat())
  expect(new Set(p.changes.map(x => x.id)).size).toBe(6)
  expect(p.changes.filter(x => x.change.kind === 'node-added').map(x => x.change.title)).toEqual(['audit', 'implement', 'verify'])
  expect(p.changes.every(x => x.evidenceId === p.evidence[0].eventId)).toBe(true)
})

test('rejects arbitrary model identifiers and abstains when input is over budget', () => {
  expect(analyze(input('continue'), JSON.stringify([{ kind: 'dependency', from: 'root', to: 'alien' }])).changes).toEqual([])
  const p = analyze(input('new task: write a parser', fact(), { budget: 1 }))
  expect(p.intent.kind).toBe('uncertain')
  expect(p.unresolved).toContain('budget-insufficient')
})

test('explicit user-only refinement and contradictory routing remain distinguishable', () => {
  const p = analyze(input('continue: refine root: Audit parser; report passing checks'))
  expect(p.provenance).toBe('explicit_user_instruction')
  expect(p.changes.map(x => x.change)).toEqual([{ kind: 'node-refined', nodeId: 'root', description: 'Audit parser', criteria: ['report passing checks'] }])
  expect(analyze(input('continue: switch to beta')).intent.kind).toBe('uncertain')
})
