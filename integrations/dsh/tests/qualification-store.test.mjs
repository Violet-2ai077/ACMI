import { createHash } from 'node:crypto'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { createScopeAuthority, runtimeFactId } from '@acmi/core'
const acmi = process.env.ACMI_TEST_BUILT === '1' ? await import('../dist/index.js') : await import('../src/index.ts')
const sha = s => createHash('sha256').update(s).digest('hex')
const workspaceId = 'q91-transaction'
const taskId = '09100000-0000-4000-8000-000000000001'
const session = { adapterId: 'fixture', instanceId: workspaceId, sessionId: 's', incarnation: '1' }
const source = localSeq => ({ session, localSeq, sourceRevision: 'epoch' })
const decision = { kind: 'decision', topic: 'storage', text: 'SQLite', rationale: 'Explicit user confirmation.', alternatives: [],
  state: 'accepted', replaces: [] }
const review = { decision: 'accept', reviewerId: 'operator', reason: 'Checked exact claim' }

function setup(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'acmi-091-proof-')))
  const read = createScopeAuthority(), write = createScopeAuthority()
  const scope = read.grant(workspaceId), writer = write.grant(workspaceId)
  acmi.provisionGraphRoot(root, workspaceId)
  const open = qualification => acmi.openGraphStore({ root, workspaceId, read, write, understanding: true, qualification })
  const store = open(true)
  t.onTestFinished(() => { store.close(); rmSync(root, { recursive: true, force: true }) })
  store.append(writer, taskId, { key: 'open', source: source(0),
    change: { kind: 'task-opened', objective: 'Design storage', criteria: ['Reviewed plan'] } })
  const anchorId = runtimeFactId(session, 0, sha)
  store.ingest(writer, { version: 'runtime-fact-v1', eventId: anchorId, workspaceId, source: source(0),
    runtimeVersion: 'fixture', adapterVersion: 'fixture', provenance: 'runtime_observed', detail: { kind: 'user' } },
  0, { taskId, nodeId: 'n' })
  const user = { evidenceId: anchorId, text: 'continue: design storage', provenance: 'synthetic_host_excerpt' }
  const request = { synthetic: true, taskId, currentTaskId: taskId, candidates: [{ taskId, alias: 'storage' }],
    evidenceIds: [anchorId], anchorId, user }
  return { store, scope, writer, request, open, source: { taskId, factId: anchorId, synthetic: true, expectedRevision: null } }
}

test('exact user Decision source is revalidated in the transaction and reopening cannot downgrade the gate', t => {
  const f = setup(t)
  const before = f.store.read(f.scope, taskId)
  const denied = f.store.stageUnderstanding(f.scope, f.writer, f.request, JSON.stringify([decision]))
  expect(denied.risks).toContain('grounding:evidence-unavailable')
  expect(f.store.reviewUnderstanding(f.writer, denied.proposal.id, review).status).toBe('conflicted')
  expect(f.store.read(f.scope, taskId)).toEqual(before)
  expect(() => f.store.recordQualificationSource(f.scope, { ...f.source, excerpt: 'Approve storage: SQLite.' })).toThrow(/unavailable/)
  const link = f.store.recordQualificationSource(f.writer, { ...f.source, excerpt: 'Approve storage: SQLite.' })
  const staged = f.store.stageUnderstanding(f.scope, f.writer, { ...f.request, grounding: link }, JSON.stringify([decision]))
  expect(staged.risks).toEqual([])
  expect(staged.grounding[0]).toMatchObject({ status: 'supported', role: 'user_confirmation', evidence: { actor: 'user' } })
  expect(JSON.stringify(staged)).not.toContain('Approve storage')
  f.store.recordQualificationSource(f.writer, { ...f.source, expectedRevision: link.evidenceRevision, revoke: true })
  f.store.close()
  const reopened = f.open(undefined)
  try {
    expect(reopened.reviewUnderstanding(f.writer, staged.proposal.id, review)).toMatchObject({
      status: 'conflicted', reason: 'grounding:evidence-unavailable',
    })
    expect(reopened.read(f.scope, taskId)).toEqual(before)
    expect(() => reopened.review(f.writer, {}, 'accept')).toThrow(/unavailable/)
  } finally { reopened.close() }
})

test('accepted grounded Decision appends and retains exact proof in its atomic receipt', t => {
  const f = setup(t)
  const grounding = f.store.recordQualificationSource(f.writer, { ...f.source, excerpt: 'Approve storage: SQLite.' })
  const item = f.store.stageUnderstanding(f.scope, f.writer, { ...f.request, grounding }, JSON.stringify([decision]))
  const receipt = f.store.reviewUnderstanding(f.writer, item.proposal.id, review)
  expect(receipt.status).toBe('accepted')
  expect(receipt.grounding[0].evidence.link).toEqual(grounding)
  expect(f.store.read(f.scope, taskId).snapshot.evidence[0].content.state).toBe('accepted')
  expect(f.store.reviewUnderstanding(f.writer, item.proposal.id, review)).toEqual(receipt)
})

test('older approval cannot be restaged against the latest graph after a user correction', t => {
  const f = setup(t)
  const grounding = f.store.recordQualificationSource(f.writer, { ...f.source, excerpt: 'Approve storage: SQLite.' })
  f.store.ingest(f.writer, { version: 'runtime-fact-v1', eventId: runtimeFactId(session, 1, sha), workspaceId, source: source(1),
    runtimeVersion: 'fixture', adapterVersion: 'fixture', provenance: 'runtime_observed', detail: { kind: 'user' } },
  0, { taskId, nodeId: 'n' })
  const item = f.store.stageUnderstanding(f.scope, f.writer, { ...f.request, grounding }, JSON.stringify([decision]))
  expect(item.risks).toContain('grounding:newer-user-evidence-or-bounded-cut')
  expect(f.store.reviewUnderstanding(f.writer, item.proposal.id, review).status).toBe('conflicted')
  expect(f.store.read(f.scope, taskId).snapshot.evidence).toEqual([])
})

test('causal Tool Result metadata is not content; an exact protected excerpt produces an unverified result only', t => {
  const f = setup(t)
  const add = (key, change) => f.store.append(f.writer, taskId, { key, source: source(0), change })
  add('node', { kind: 'node-added', nodeId: 'n', title: 'Check', role: 'work' })
  add('ready', { kind: 'work-transitioned', nodeId: 'n', state: 'ready' })
  add('running', { kind: 'work-transitioned', nodeId: 'n', state: 'running' })
  add('active', { kind: 'mainline-advanced', nodeId: 'n' })
  add('execution', { kind: 'execution-started', nodeId: 'n', executionId: 'run', agentId: 'fixture' })
  const ingest = (seq, detail) => {
    const eventId = runtimeFactId(session, seq, sha)
    f.store.ingest(f.writer, { version: 'runtime-fact-v1', eventId, workspaceId, source: source(seq),
      runtimeVersion: 'fixture', adapterVersion: 'fixture', provenance: 'runtime_observed', detail },
    0, { taskId, nodeId: 'n' })
    return eventId
  }
  ingest(1, { kind: 'tool-call', turn: 't', step: 's', callId: 'x' })
  const anchorId = ingest(2, { kind: 'tool-result', turn: 't', step: 's', callId: 'x', callSeq: 1 })
  const { user: _unused, ...request } = f.request
  const op = JSON.stringify([{ kind: 'work-result', executionId: 'run', text: 'Passed: 12' }])
  const command = { ...f.source, factId: anchorId }
  const metadata = f.store.recordQualificationSource(f.writer, command)
  const stage = grounding => f.store.stageUnderstanding(f.scope, f.writer, { ...request, anchorId, evidenceIds: [anchorId], grounding }, op)
  expect(stage(metadata).risks).toContain('grounding:result-summary-not-extractive')
  const excerpt = f.store.recordQualificationSource(f.writer, { ...command, expectedRevision: metadata.evidenceRevision,
    excerpt: 'Passed: 12\nWarnings: 2' })
  const item = stage(excerpt)
  expect(item.risks).toEqual([])
  expect(f.store.reviewUnderstanding(f.writer, item.proposal.id, review).status).toBe('accepted')
  const graph = f.store.read(f.scope, taskId).snapshot
  expect(graph.results).toEqual([expect.objectContaining({ summary: 'Passed: 12', verified: false })])
  expect(graph.reviews).toEqual([])
  expect(graph.task.closed).toBeUndefined()
})
