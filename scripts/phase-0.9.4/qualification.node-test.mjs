import assert from 'node:assert/strict'
import test from 'node:test'
import { loadCorpus, createPackets, auditCorpus } from './corpus.mjs'
import { adjudicate, compare, importBatch, reconcile, spanOK } from './annotation.mjs'
import { score, ratio } from './metrics.mjs'
import { runAdapter, makeCase, predict, controls, proposalControls } from './evaluate.mjs'
import { reviewVersion, sha } from './contract.mjs'

test('frozen open inputs and labels are separate; lanes have opaque unlinkable IDs', () => {
  const corpus = loadCorpus()
  const audit = auditCorpus(corpus)
  assert(audit.total >= 60)
  assert(audit.long >= 3)
  assert.equal(audit.duplicates.length, 0)
  const { a, b, mapping } = createPackets(corpus)
  assert.equal(a.cases.length, audit.total)
  assert.equal(mapping.length, audit.total)
  const forbidden = /"(gold|split|risk|expected|prediction|cluster|family|provenance)":/u
  assert(!forbidden.test(JSON.stringify([a, b])))
  const bIds = new Set(b.cases.map(x => x.id))
  assert(a.cases.every(x => !bIds.has(x.id)))
  assert(a.cases.flatMap(x => x.tasks).every(t => !t.foreign))
})

test('UTF-16 span validation rejects halves and fabricated quotations', () => {
  const turns = [{ id: 't', actor: 'user', text: 'A🍊好' }]
  assert(spanOK(turns, { turn: 't', actor: 'user', start: 1, end: 3, quote: '🍊' }))
  assert(!spanOK(turns, { turn: 't', actor: 'user', start: 1, end: 2, quote: '\ud83c' }))
  assert(!spanOK(turns, { turn: 't', actor: 'host', start: 0, end: 1, quote: 'A' }))
})

test('annotation import audits missing and refuses unattested or inconsistent identities', () => {
  const { a } = createPackets(loadCorpus())
  const none = importBatch(a, null)
  assert.equal(none.valid.length, 0)
  assert.equal(none.missing.length, a.cases.length)
  const forged = importBatch(a, { lane: 'A', records: [] })
  assert(forged.errors.length)
  assert.equal(compare([], []).intent.kappa, null)
})

test('retrieval success does not grant identity correctness', () => {
  const rows = [{
    gold: { identity: 'active', taskId: 'right', intent: 'continue', acts: [], claims: [], operation: 'none' },
    result: { identity: 'active', taskId: 'wrong', intent: 'continue', acts: [], claims: [], operation: 'none', confidence: 0.8 },
    ranks: { active: ['right', 'wrong'], historical: [] },
  }]
  const s = score(rows)
  assert.deepEqual(s.retrieval.at1, ratio(1, 1))
  assert.deepEqual(s.identity.conditionalExact, ratio(0, 1))
  assert.equal(s.identity.falseMerge, 1)
  assert.equal(s.identity.weightedCost, 10)
})

test('harness shares a bounded packet and fails closed on malformed/foreign/stale output', async () => {
  const { input } = loadCorpus().find(x => x.input.tasks.length > 1 && x.input.turns.at(-1).actor === 'user')
  const fixture = makeCase(input)
  assert(fixture.packet)
  const good = await runAdapter(fixture, p => JSON.stringify(predict('abstention-first', p)))
  assert.equal(good.status, 'ok')
  const bad = await runAdapter(fixture, () => '{')
  assert.equal(bad.status, 'parse_error')
  assert.equal(bad.attempts, 1)
  const checks = await controls(fixture)
  assert(Object.values(checks).every(Boolean))
})

test('proposal controls distinguish a grounded draft from invalid evidence and candidate scope', async () => {
  assert(Object.values(await proposalControls()).every(Boolean))
})

test('unit fixtures exercise independent lane mapping, disputes and stale adjudication fences', () => {
  const { a, b, mapping } = createPackets(loadCorpus().slice(0, 1))
  // In-memory test sentinels only; never exported as human records or counted.
  const testAttestation = 'human_attested_identity_requires_custodian_verification'
  const batch = (packet, intent) => ({
    protocol: reviewVersion, lane: packet.lane, packetId: packet.packetId, reviewerId: 'unit-' + packet.lane,
    attestation: testAttestation, submittedAt: '2000-01-01T00:00:00Z', records: [{
      case: packet.cases[0].id, intent, identity: 'active', taskId: packet.cases[0].tasks[0].id,
      targetAbsent: 'no', operation: 'none', reason: 'Unit test rationale only', acts: [], claims: [],
    }],
  })
  const submissions = [batch(a, 'continue'), batch(b, 'resume')]
  const [A, B] = [a, b].map((packet, i) => importBatch(packet, submissions[i]).valid)
  assert.equal(A.length, 1)
  assert.equal(B.length, 1)
  const report = { protocol: reviewVersion, submissionHashes: submissions.map(x => sha(JSON.stringify(x))),
    ...compare(...reconcile(mapping, { A, B })) }
  assert.equal(report.disagreements.length, 1)
  assert.equal(report.taskId.raw, 1)
  const s = { protocol: reviewVersion, reportHash: sha(JSON.stringify(report)), adjudicatorId: 'unit-C',
    submittedAt: '2000-01-01T00:00:00Z', attestation: testAttestation,
    records: [{ case: mapping[0].case, choice: 'A', rationale: 'Unit test resolution only' }] }
  const receipt = adjudicate(report, s, a, mapping, submissions)
  assert.equal(receipt.revisions[0].final.intent, 'continue')
  assert.equal(receipt.adjudicationRate, 1)
  assert.equal(receipt.qualification, false)
  assert.throws(() => adjudicate(report, { ...s, reportHash: 'stale' }, a, mapping, submissions))
  assert.throws(() => adjudicate(report, { ...s, adjudicatorId: 'unit-A' }, a, mapping, submissions))
})

test('adapter retries only cooperative timeouts; no budget receipts imply real tokens', async () => {
  const fixture = makeCase(loadCorpus()[0].input)
  let attempts = 0
  const run = await runAdapter(fixture, p => {
    if (++attempts === 1) throw Object.assign(new Error('fixture timeout'), { code: 'timeout' })
    return JSON.stringify(predict('deterministic', p))
  })
  assert.equal(run.status, 'ok')
  assert.equal(run.attempts, 2)
  assert.equal(run.modelTokens, null)
  assert.equal(run.providerRequests, 0)
})
