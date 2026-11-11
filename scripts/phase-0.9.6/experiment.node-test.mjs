import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { buildLayeredContext, createScopeAuthority } from '../../packages/core/dist/index.js'
import { projectAntecedent, runPair } from './experiment.mjs'
import { evaluate } from './benchmark.mjs'

const sha256 = s => createHash('sha256').update(s).digest('hex')
const cut = { workspaceId: 'scope1', sessionId: 's1', incarnation: 'i1', cursor: 9,
  graphRevision: 1, bindingRevision: 1, candidateRevision: 1, sourceRevision: 1, authorizationEpoch: 1, policyVersion: 'fixture' }
const candidate = (taskId, objective, fields = {}) => ({ taskId, objective, aliases: [], workspaceId: cut.workspaceId,
  status: 'open', lastActivity: 1, catalogRevision: 1, revision: 1, reason: 'lexical', ...fields })
const tasks = [candidate('a1', 'Fountain map'), candidate('a2', 'West tap repair')]
const focus = 'Go back to the item from my last note.'
const data = (text, fields = {}) => ({ id: 'prev8', cut: { ...cut, cursor: 8 }, text, digest: sha256(text),
  actor: 'user', kind: 'message', complete: true, ...fields })

function fixture(source, updates = {}, extras = {}) {
  const authority = createScopeAuthority()
  const scope = authority.grant(cut.workspaceId)
  let reads = 0
  const access = { authority, scope, sha256, permitsTask: () => true, readCurrentCut: () => cut,
    permitsSource: () => true, readSource: () => { reads++; return source }, ...extras }
  const context = { cut, current: { id: 'turn9', actor: 'user', kind: 'message', text: focus },
    candidates: tasks, binding: { taskId: 'a1' }, ...updates }
  return { context, access, catalogComplete: true, sourceId: 'prev8', reads: () => reads }
}

test('turning on evidence adds the exact previous user text and cannot modify the base packet', () => {
  const f = fixture(data('I meant West tap repair.'))
  const { packet } = buildLayeredContext(f.context, f.access)
  const result = projectAntecedent(packet, f.sourceId, f.access)
  assert.equal(result.status, 'admitted')
  assert.equal(result.view.text, 'I meant West tap repair.')
  assert.equal(result.view.digest, sha256(result.view.text))
  assert.equal(result.view.taskId, undefined)
  assert.deepEqual(result.view.span, { start: 0, end: result.view.text.length })
  const pair = runPair(f)
  assert.equal(f.reads(), 2)
  assert.equal(pair.offSourceReads, 0)
  assert.equal(new Set(Object.values(pair.cells).map(r => r.packetDigest)).size, 1)
  assert.equal(pair.cells.literal_off.taskId, null)
  assert.equal(pair.cells.literal_on.taskId, 'a2')
  assert.equal(pair.cells.contrast_on.taskId, 'a2')
})

test('contrast can add a result with the same evidence while unresolved negation and collisions fail closed', () => {
  const valid = runPair(fixture(data('I meant West tap repair, not Fountain map.')))
  assert.equal(valid.cells.literal_on.taskId, null)
  assert.equal(valid.cells.contrast_on.taskId, 'a2')
  for (const line of ['I meant not West tap repair.', 'I meant West tap repair, not a task you cannot see.',
    'I meant West tap repair, not West tap repair.', 'I meant West tap repair; or the map.']) {
    assert.equal(runPair(fixture(data(line))).cells.contrast_on.taskId, null)
  }
  const collision = [...tasks, candidate('a3', 'West tap repair')]
  assert.equal(runPair(fixture(data('I meant West tap repair.'), { candidates: collision })).cells.contrast_on.taskId, null)
})

test('projection rejects denied, stale, non-user, incomplete, tampered and oversized sources without exposing the body', () => {
  const body = 'I meant West tap repair.'
  for (const source of [data(body, { digest: sha256('changed') }), data(body, { complete: false }),
    data(body, { actor: 'assistant' }), data(body, { kind: 'causal' }),
    data(body, { cut: { ...cut, cursor: 8, sourceRevision: 0 } }),
    data(body, { cut: { ...cut, cursor: 8, sessionId: 'foreign' } }),
    data(body, { cut: { ...cut, cursor: 8, workspaceId: 'other-workspace' } }),
    data(body + 'x'.repeat(257))]) {
    const f = fixture(source)
    const { packet } = buildLayeredContext(f.context, f.access)
    const denied = projectAntecedent(packet, f.sourceId, f.access)
    assert.notEqual(denied.status, 'admitted')
    assert(!JSON.stringify(denied).includes(body))
  }
  const denied = fixture(data(body), {}, { permitsSource: () => false })
  const { packet } = buildLayeredContext(denied.context, denied.access)
  assert.notEqual(projectAntecedent(packet, denied.sourceId, denied.access).status, 'admitted')
  assert.equal(denied.reads(), 0)
})

test('cut and disclosure permission are rechecked after the trusted source read', () => {
  let live = cut
  const f = fixture(data('I meant West tap repair.'), {}, { readCurrentCut: () => live,
    readSource: () => { live = { ...cut, authorizationEpoch: 2 }; return data('I meant West tap repair.') } })
  const { packet } = buildLayeredContext(f.context, f.access)
  assert.notEqual(projectAntecedent(packet, f.sourceId, f.access).status, 'admitted')
  let permits = true
  const g = fixture(data('I meant West tap repair.'), {}, { permitsSource: () => permits,
    readSource: () => { permits = false; return data('I meant West tap repair.') } })
  assert.notEqual(projectAntecedent(packet, g.sourceId, g.access).status, 'admitted')
})

test('direct focus trumps the prior; closed tasks are only eligible for history; bare deixis is not enough', () => {
  const direct = fixture(data('I meant West tap repair.'), { current: { id: 'turn9', actor: 'user', kind: 'message',
    text: 'Switch to Fountain map.' } })
  const result = runPair(direct)
  assert(Object.values(result.cells).every(cell => cell.taskId === 'a1'))
  const closed = [tasks[0], { ...tasks[1], status: 'closed' }]
  assert.equal(runPair(fixture(data('I meant West tap repair.'), { candidates: closed })).cells.contrast_on.taskId, null)
  const read = { id: 'turn9', actor: 'user', kind: 'message', text: 'Look up the item from my last note.' }
  const h = runPair(fixture(data('I meant West tap repair.'), { current: read, candidates: closed }))
  assert.equal(h.cells.contrast_on.status, 'reference_history')
  assert.equal(h.cells.contrast_on.taskId, 'a2')
  const vague = { ...read, text: 'That one.' }
  assert.equal(runPair(fixture(data('I meant West tap repair.'), { current: vague })).cells.contrast_on.taskId, null)
})

test('a full shared packet refuses an otherwise valid source instead of evicting candidates', () => {
  const f = fixture(data('I meant West tap repair.'))
  const ready = n => buildLayeredContext({ ...f.context, current: { ...f.context.current, text: '水'.repeat(n) } }, f.access).packet
  let lo = 1, hi = 3500
  while (hi - lo > 1) {
    const mid = Math.floor((hi + lo) / 2)
    if (ready(mid)) lo = mid
    else hi = mid
  }
  const packet = ready(lo)
  assert(packet)
  assert.equal(projectAntecedent(packet, f.sourceId, f.access).status, 'budget')
})

test('paired gate is nontrivial and includes source reversal and authorized-candidate fences', () => {
  const { report, rows, checks } = evaluate()
  assert.equal(report.decision, 'PASS_CONTROLLED_EVIDENCE_GAIN')
  assert.equal(report.stories, 36)
  assert.equal(report.summaries.validation.contrast_off.correct.n, 1)
  assert.equal(report.summaries.validation.contrast_on.correct.n, 10)
  assert.equal(report.summaries.validation.paired.contrastWithEvidence.wins, 4)
  assert(rows.every(row => row.offSourceReads === 0))
  assert(checks.some(c => c.kind === 'evidence_redirected'))
  assert(checks.some(c => c.kind === 'target_not_issued'))
  assert(checks.every(c => c.pass))
})
