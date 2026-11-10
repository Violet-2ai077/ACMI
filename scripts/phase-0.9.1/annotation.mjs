import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { canonical } from '../../packages/core/dist/index.js'
import { classes, sha, seed } from './corpus.mjs'

const schemaVersion = 'q91-annotation-v1'
const brief = (s, max) => typeof s === 'string' && s.trim().length > 0 && s.length <= max
const write = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
const load = path => JSON.parse(readFileSync(path, 'utf8'))

export function writeBlindPackets(rows, root) {
  const cases = rows.filter(r => r.split === 'holdout').map(r => ({ id: r.id,
    turns: r.turns.map(({ id, actor, text, session }) => ({ id, actor, text, session })),
    tasks: r.tasks.filter(t => !t.foreign).map(({ taskId, title, objective, status }) => ({ taskId, title, objective, status })),
    currentTaskId: r.tasks.some(t => t.taskId === r.binding && !t.foreign) ? r.binding : null }))
  const packetId = sha(canonical(cases))
  const packet = lane => ({ schemaVersion, packetId, reviewerLane: lane, human_review_status: 'pending',
    cases: cases.toSorted((a, b) => sha(canonical([seed, lane, a.id])).localeCompare(sha(canonical([seed, lane, b.id])), 'en')) })
  write(join(root, 'blind-review-packet-a.json'), packet('A'))
  write(join(root, 'blind-review-packet-b.json'), packet('B'))
  write(join(root, 'annotation-template.json'), { schemaVersion, packetId, reviewerLane: null,
    reviewerId: null, annotationProvenance: null, human_review_status: 'pending', annotations: [] })
  const fields = { type: 'object', additionalProperties: false,
    required: ['caseId', 'intent', 'taskId', 'evidence', 'changes', 'unresolved', 'reason'],
    properties: { caseId: { type: 'string' }, intent: { enum: classes }, taskId: { type: ['string', 'null'] },
      evidence: { type: 'array', maxItems: 16, uniqueItems: true, items: { type: 'string' } },
      changes: { type: 'array', maxItems: 16, uniqueItems: true, items: { type: 'string' } },
      unresolved: { type: 'array', maxItems: 16, uniqueItems: true, items: { type: 'string' } },
      reason: { type: 'string', minLength: 1, maxLength: 1024 } } }
  write(join(root, 'annotation-schema.json'), { $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object', additionalProperties: false, required: ['schemaVersion', 'packetId', 'reviewerLane', 'reviewerId',
      'annotationProvenance', 'human_review_status', 'annotations'],
    properties: { schemaVersion: { const: schemaVersion }, packetId: { type: 'string' }, reviewerLane: { enum: ['A', 'B'] },
      reviewerId: { type: 'string', minLength: 1, maxLength: 96 },
      annotationProvenance: { const: 'human_attested_annotation' },
      human_review_status: { const: 'submitted_unverified_identity' }, annotations: { type: 'array', items: fields } } })
}

function validateEntry(packet, label) {
  assert.deepEqual(Object.keys(label).sort(), ['caseId', 'changes', 'evidence', 'intent', 'reason', 'taskId', 'unresolved'].sort())
  const fixture = packet.cases.find(c => c.id === label.caseId)
  assert(fixture, 'Unknown case ID')
  assert(classes.includes(label.intent) && brief(label.reason, 1024))
  if (label.intent === 'switch_existing' || label.intent === 'continue_current') {
    assert(fixture.tasks.some(t => t.taskId === label.taskId && t.status === 'open'), 'Invalid target')
    assert.equal(label.intent === 'continue_current', label.taskId === fixture.currentTaskId)
  } else assert.equal(label.taskId, null)
  for (const key of ['changes', 'unresolved', 'evidence']) {
    assert(Array.isArray(label[key]) && label[key].length <= 16 && new Set(label[key]).size === label[key].length
      && label[key].every(v => brief(v, 160)))
  }
  assert(label.evidence.every(id => fixture.turns.some(t => t.id === id)), 'Unbound turn evidence')
}
export function validateSubmission(packet, submission) {
  assert.equal(packet.schemaVersion, schemaVersion)
  assert.equal(sha(canonical(packet.cases.toSorted((a, b) => a.id.localeCompare(b.id, 'en')))), packet.packetId, 'Blind packet changed')
  assert.deepEqual(Object.keys(submission).sort(), ['schemaVersion', 'packetId', 'reviewerLane', 'reviewerId',
    'annotationProvenance', 'human_review_status', 'annotations'].sort())
  assert.equal(submission.schemaVersion, schemaVersion)
  assert.equal(submission.packetId, packet.packetId)
  assert.equal(submission.reviewerLane, packet.reviewerLane)
  assert(brief(submission.reviewerId, 96))
  assert.equal(submission.annotationProvenance, 'human_attested_annotation')
  assert.equal(submission.human_review_status, 'submitted_unverified_identity')
  assert(Array.isArray(submission.annotations) && submission.annotations.length === packet.cases.length)
  const data = new Map()
  for (const label of submission.annotations) {
    validateEntry(packet, label)
    assert(!data.has(label.caseId), 'Duplicate annotation')
    data.set(label.caseId, label)
  }
  assert.equal(data.size, packet.cases.length, 'Incomplete submission')
  return data
}
const comparable = label => canonical([label.intent, label.taskId, label.changes.toSorted(), label.unresolved.toSorted(), label.evidence.toSorted()])
export function compareSubmissions(packetA, submissionA, packetB, submissionB) {
  assert.equal(packetA.packetId, packetB.packetId)
  assert.notEqual(packetA.reviewerLane, packetB.reviewerLane)
  assert.notEqual(submissionA.reviewerId.trim().toLowerCase(), submissionB.reviewerId.trim().toLowerCase())
  const a = validateSubmission(packetA, submissionA)
  const b = validateSubmission(packetB, submissionB)
  const differences = [...a].filter(([id, label]) => !b.has(id) || comparable(label) !== comparable(b.get(id))).map(([id, label]) =>
    ({ caseId: id, a: label, b: b.get(id) }))
  const intentAgreement = [...a].filter(([id, x]) => x.intent === b.get(id)?.intent).length
  const chance = a.size ? classes.reduce((n, k) => n + [...a.values()].filter(x => x.intent === k).length
    * [...b.values()].filter(x => x.intent === k).length, 0) / (a.size * a.size) : 1
  return { schemaVersion, packetId: packetA.packetId, reviewers: [submissionA.reviewerId, submissionB.reviewerId], count: a.size,
    exactAgreement: a.size - differences.length, intentAgreement,
    cohenKappaIntent: chance === 1 ? null : (intentAgreement / a.size - chance) / (1 - chance),
    differences, human_review_status: 'pending_identity_and_adjudication' }
}
export function verifyAdjudication(packet, disagreement, resolution) {
  assert.equal(disagreement.packetId, packet.packetId)
  assert.equal(resolution.packetId, packet.packetId)
  assert(brief(resolution.reviewerId, 96) && !disagreement.reviewers.some(id => id.trim().toLowerCase() === resolution.reviewerId.trim().toLowerCase()))
  assert.equal(resolution.provenance, 'human_attested_adjudication')
  const expected = new Set(disagreement.differences.map(x => x.caseId))
  for (const label of resolution.annotations) { validateEntry(packet, label); assert(expected.delete(label.caseId), 'Not a pending disagreement') }
  assert.equal(expected.size, 0, 'Missing adjudication')
  return { packetId: packet.packetId, resolved: resolution.annotations.length, human_review_status: 'pending_independent_identity_verification' }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, ...files] = process.argv.slice(2)
  if (action === 'check' && files.length === 2) console.log('Structurally valid records:', validateSubmission(...files.map(load)).size)
  else if (action === 'compare' && files.length === 5) write(files[4], compareSubmissions(...files.slice(0, 4).map(load)))
  else if (action === 'adjudicate' && files.length === 3) console.log(JSON.stringify(verifyAdjudication(...files.map(load))))
  else throw new Error('Usage: annotation.mjs check packet submission | compare packetA a packetB b out | adjudicate packet disagreements resolution')
}
