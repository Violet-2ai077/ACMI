import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, test } from 'vitest'
import { compareSubmissions, validateSubmission, verifyAdjudication, writeBlindPackets } from './annotation.mjs'

test('blind handoff strips labels and leaves identity and arbitration pending', t => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'acmi-091-annotation-')))
  t.onTestFinished(() => rmSync(dir, { recursive: true, force: true }))
  const sample = [{ id: 'case-1', split: 'holdout', family: 'hidden', turns: [{ id: 'turn-1', actor: 'user', text: 'Thanks', session: 0 }],
    tasks: [], binding: null, expected: { intent: 'no_task' } }]
  writeBlindPackets(sample, dir)
  const read = n => JSON.parse(readFileSync(join(dir, n), 'utf8'))
  const a = read('blind-review-packet-a.json'), b = read('blind-review-packet-b.json')
  expect(a.cases[0]).not.toHaveProperty('expected')
  expect(a.cases[0]).not.toHaveProperty('family')
  expect(read('annotation-template.json')).toMatchObject({ human_review_status: 'pending', annotations: [] })
  // Test-only attestations exercise validation. No genuine annotator is represented.
  const submit = (packet, intent, reviewerId) => ({ schemaVersion: packet.schemaVersion, packetId: packet.packetId,
    reviewerLane: packet.reviewerLane, reviewerId, annotationProvenance: 'human_attested_annotation',
    human_review_status: 'submitted_unverified_identity',
    annotations: [{ caseId: 'case-1', intent, taskId: null, evidence: ['turn-1'], changes: [], unresolved: [], reason: 'Test fixture' }] })
  const a1 = submit(a, 'no_task', 'test-a'), b1 = submit(b, 'uncertain', 'test-b')
  const result = compareSubmissions(a, a1, b, b1)
  expect(result).toMatchObject({ exactAgreement: 0, intentAgreement: 0, cohenKappaIntent: 0, human_review_status: 'pending_identity_and_adjudication' })
  expect(() => validateSubmission({ ...a, cases: [{ ...a.cases[0], tasks: [{ title: 'tampered' }] }] }, a1)).toThrow(/packet changed/)
  expect(verifyAdjudication(a, result, { packetId: a.packetId, reviewerId: 'test-c',
    provenance: 'human_attested_adjudication', annotations: a1.annotations })).toMatchObject({ resolved: 1,
    human_review_status: 'pending_independent_identity_verification' })
})
