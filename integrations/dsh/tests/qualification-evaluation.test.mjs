import { expect, test } from 'vitest'
import { makeEvaluationFixture } from '../../../scripts/phase-0.9.1/benchmark-fixtures.mjs'
const acmi = process.env.ACMI_TEST_BUILT === '1' ? await import('../dist/index.js') : await import('../src/index.ts')
const empty = { workspaceId: 'q91', candidates: [], dialogue: [{ actor: 'user', text: 'Thanks for looking.' }], synthetic: true }
const metadata = { name: 'test-fixture', provider: 'offline', mode: 'scripted' }
const envelope = (packet, patch = {}) => ({ version: 'qualification-output-v1', graphRevision: packet.graphRevision,
  sourceRevision: packet.sourceRevision, candidateRevision: packet.candidateRevision, intent: 'no_task', taskId: null,
  userEvidence: packet.dialogue.at(-1)?.id ?? null, operations: [], ...patch })
const run = (patch, raw) => acmi.runQualificationEvaluation({ metadata, respond: ({ packet }) => raw ?? JSON.stringify(envelope(packet, patch)) }, empty)

test('offline harness records raw output hash, authority status and no billing without exposing write access', async () => {
  const receipt = await run()
  expect(receipt).toMatchObject({ status: 'evaluated', prediction: { intent: 'no_task' }, guard: { status: 'qualified', changes: [] },
    provenance: 'scripted_not_model_output', realProviderRequests: 0, usage: { inputTokens: null, outputTokens: null, cost: null } })
  expect(receipt.responseHash).toMatch(/^[0-9a-f]{64}$/)
  expect(JSON.stringify(receipt)).not.toContain('Thanks for looking.')
})

test.each([
  ['{partial', 'invalid-json'], ['x'.repeat(9000), 'output-limit'],
  ['"\\ud800"', 'malformed-unicode'],
])('rejects malformed fixture output: %s', async (input, code) => {
  expect((await run({}, input)).error).toBe(code)
})

test('extra fields, forged reviewer authority and stale revisions cannot pass', async () => {
  expect((await run({ reviewerId: 'host' })).error).toBe('schema')
  expect((await run({ graphRevision: '0'.repeat(64) })).guard.reasons).toContain('stale-revision')
  const wrong = await run({ intent: 'switch_existing', taskId: '09100000-0000-4000-8000-000000000042' })
  expect(wrong.prediction.intent).toBe('switch_existing')
  expect(wrong.guard.reasons).toContain('unauthorized-task-id')
})

test('provider transport is denied before response and cancellation and retry are bounded', async () => {
  let attempted = 0
  await expect(acmi.runQualificationEvaluation({ metadata: { ...metadata, provider: 'real' }, respond: () => { attempted++; return '' } }, empty))
    .rejects.toThrow(/offline/)
  expect(attempted).toBe(0)
  const retry = await acmi.runQualificationEvaluation({ metadata, respond: ({ packet }) => {
    if (++attempted === 1) throw new acmi.RetryableQualificationError()
    return JSON.stringify(envelope(packet))
  } }, empty, { retries: 1 })
  expect(retry).toMatchObject({ status: 'evaluated', attempts: 2 })
  const timeout = await acmi.runQualificationEvaluation({ metadata, respond: () => new Promise(() => {}) }, empty, { timeoutMs: 10, retries: 2 })
  expect(timeout).toMatchObject({ error: 'timeout', attempts: 1 })
  const controller = new AbortController()
  controller.abort()
  const cancel = await acmi.runQualificationEvaluation({ metadata, respond: () => '' }, empty, { signal: controller.signal })
  expect(cancel).toMatchObject({ error: 'cancelled', attempts: 0 })
})

test('raw unsupported graph claims are observable separately from rejection, and exact evidence qualifies a diff', async () => {
  const taskId = '09100000-0000-4000-8000-000000000001'
  const runFixture = (actor, text) => {
    const fixture = makeEvaluationFixture({ id: 'grounded-receipt-test', turns: [{ actor, text, session: 0 }],
      tasks: [{ taskId, title: 'Storage', objective: 'Design storage', status: 'open', age: 0 }], binding: taskId })
    return fixture.packetInput(fixture.lookup())
  }
  const adapter = { metadata, respond: ({ packet }) => JSON.stringify(envelope(packet, {
    intent: 'uncertain', operations: [{ operation: { kind: 'decision', topic: 'storage', text: 'SQLite',
      state: 'accepted', rationale: 'Explicit user confirmation.', alternatives: [], replaces: [] }, evidence: packet.evidence[0].link }],
  })) }
  const supported = await acmi.runQualificationEvaluation(adapter, runFixture('user', 'Approve storage: SQLite.'))
  expect(supported).toMatchObject({ prediction: { claims: ['decision-accepted'] },
    guard: { status: 'qualified', evidence: [{ role: 'user_confirmation' }] } })
  const unsupported = await acmi.runQualificationEvaluation(adapter, runFixture('assistant', 'Approve storage: SQLite.'))
  expect(unsupported).toMatchObject({ prediction: { claims: ['decision-accepted'] }, guard: { status: 'withheld', changes: [] } })
  const forged = await acmi.runQualificationEvaluation({ metadata, respond: (input) => {
    const out = JSON.parse(adapter.respond(input))
    out.operations[0].evidence.excerptHash = '0'.repeat(64)
    return JSON.stringify(out)
  } }, runFixture('user', 'Approve storage: SQLite.'))
  expect(forged.guard.reasons).toContain('evidence-link-invalid')
})

test('later correction blocks an old approval even when the model says uncertain', async () => {
  const taskId = '09100000-0000-4000-8000-000000000001'
  const fixture = makeEvaluationFixture({ id: 'corrected-decision-test',
    turns: ['Approve storage: SQLite.', 'Do not approve storage: SQLite.'].map(text => ({ actor: 'user', text, session: 0 })),
    tasks: [{ taskId, title: 'Storage', objective: 'Design storage', status: 'open', age: 0 }], binding: taskId })
  const run = await acmi.runQualificationEvaluation({ metadata, respond: ({ packet }) => JSON.stringify(envelope(packet, {
    intent: 'uncertain', operations: [{ operation: { kind: 'decision', topic: 'storage', text: 'SQLite',
      state: 'accepted', rationale: 'Explicit user confirmation.', alternatives: [], replaces: [] }, evidence: packet.evidence[0].link }],
  })) }, fixture.packetInput(fixture.lookup()))
  expect(run.guard).toMatchObject({ status: 'withheld', reasons: ['user-evidence-superseded-or-unavailable'], changes: [] })
})

test.each(['Do not switch to Backup.', 'Should we switch to Backup?', 'Switch to Backups.'])('does not qualify a non-exact positive route: %s', async text => {
  const taskId = '09100000-0000-4000-8000-000000000001'
  const fixture = makeEvaluationFixture({ id: 'negative-route-test', turns: [{ actor: 'user', text, session: 0 }],
    tasks: [{ taskId, title: 'Backup', objective: 'Check Backup', status: 'open', age: 0 }], binding: null })
  const run = await acmi.runQualificationEvaluation({ metadata, respond: ({ packet }) => JSON.stringify(envelope(packet, {
    intent: 'switch_existing', taskId,
  })) }, fixture.packetInput(fixture.lookup()))
  expect(run.guard.reasons).toContain('task-reference-not-explicit')
})
