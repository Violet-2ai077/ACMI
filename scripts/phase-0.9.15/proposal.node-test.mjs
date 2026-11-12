import assert from 'node:assert/strict'
import test from 'node:test'
import { readAssignmentFrame, safeAssignmentText } from '../../integrations/dsh/dist/assignment-inline.js'
import { splitRoles } from '../../integrations/dsh/dist/role-attribution.js'
import { readProposals, projectRelative } from './proposal.mjs'
import { inputs, truth, catalogs, launches, compose } from './design.mjs'

const q = 'q-abcde'
const links = { [q]: { taskId: 'trusted-task', workId: 'trusted-work' } }
const cut = { links, anchorRef: q, toolAvailable: false }
const env = (user_turn, primary = user_turn, rest = {}, answer = 'Which version do you mean?') =>
  JSON.stringify({ answer, tag: { user_turn, assistant: { primary, related: [] }, intent: 'clarify', ...rest } })
const raw = (s, c = cut, arm = 'B') => readProposals(s, 'eos', arm, c, readAssignmentFrame, safeAssignmentText)
const host = (s, c = cut, stop = 'eos') =>
  projectRelative(s, stop, c, { readAssignmentFrame, safeAssignmentText, splitRoles })

test('relative and explicit existing proposals resolve only to scoped trusted assignments', () => {
  const s = env({ kind: 'continue_anchor' }, { kind: 'refer_existing', ref: q })
  assert.deepEqual(raw(s).user, { kind: 'continue_anchor', assignment: links[q] })
  assert.deepEqual(raw(s).assistant.assignment, links[q])
  assert.deepEqual(host(s).user, links[q])
  assert.deepEqual(host(s).assistant, links[q])
})

test('missing anchor, forged ref and mixed tags remain invalid in raw score but preserve safe text', () => {
  for (const choice of [{ kind: 'continue_anchor' }, { kind: 'refer_existing', ref: 'q-aaaaa' },
    { kind: 'unresolved', ref: q }, { kind: 'propose_new', goal: 'A goal', taskId: 'model-uuid' }]) {
    const c = { ...cut, anchorRef: null }
    const s = env(choice, { kind: 'unresolved' })
    assert.equal(raw(s, c).user, null)
    assert.equal(host(s, c).user, 'unresolved')
    assert(host(s, c).issues.length)
    assert.equal(host(s, c).answer, 'Which version do you mean?')
  }
})

test('valid abstention, no task and new goal are distinct; no intent repair', () => {
  const s = env({ kind: 'no_task' }, { kind: 'unresolved' })
  assert.equal(raw(s).user.kind, 'no_task')
  assert.equal(raw(s).assistant.kind, 'unresolved')
  assert.equal(host(s).user, 'no_task')
  assert.equal(host(s).intent, 'clarify')
  const n = env({ kind: 'propose_new', goal: 'New Plan' })
  assert.deepEqual(raw(n).user, { kind: 'propose_new', goal: 'New Plan' })
  assert.equal(host(n).newGoal, 'New Plan')
  assert.equal(raw(env({ kind: 'propose_new', goal: 'read ' + q })).user, null)
  assert.equal(raw(env({ kind: 'propose_new', goal: '  ' })).user, null)
  assert.equal(raw(env({ kind: 'propose_new', goal: 'a'.repeat(161) })).user, null)
})

test('baseline raw decode rejects relative choices and maps legacy new proposals without changing Host', () => {
  assert.equal(raw(env({ kind: 'continue_anchor' }), cut, 'A').user, null)
  assert.deepEqual(raw(env({ kind: 'new_task_proposal', goal: 'New Plan' }), cut, 'A').user,
    { kind: 'new_task_proposal', goal: 'New Plan' })
  assert.equal(raw(env({ kind: 'existing', ref: q }), cut, 'A').user.assignment, links[q])
})

test('rejects authority and illegal operations without handing any operations to the adapter', () => {
  for (const rest of [{ operations: [{ key: 'amber', ref: q }] }, { task_uuid: 'invented' }]) {
    const s = env({ kind: 'no_task' }, { kind: 'no_task' }, rest)
    assert.equal(raw(s).user, null)
    assert.deepEqual(host(s).operations, [])
    assert(host(s).issues.length)
  }
  for (const answer of ['Protocol: continue_anchor', 'use ' + q, '{"goal":"private"}']) {
    assert.throws(() => host(env({ kind: 'no_task' }, undefined, {}, answer)), /UNSAFE_ANSWER/u)
  }
  assert.throws(() => host(env({ kind: 'no_task' }), cut, 'limit'), /TRUNCATED/u)
  assert.throws(() => host('{"answer":"one","answer":"two","tag":{}}'), /INVALID_FRAME/u)
})

test('frozen design pairs share complete context and differ only in contract', () => {
  assert.equal(inputs.length, 24)
  const rows = inputs.map(input => {
    const { packet, receipt } = compose(input, catalogs.get(input.id), launches.get(input.id))({
      sessionId: input.story, nativeUserId: 'native-' + input.story, sourceUserSeq: 1 })
    const gold = truth.find(x => x.id === input.id)
    assert.equal(receipt.status, gold.anchorVerdict)
    assert.equal(JSON.stringify(packet).includes(catalogs.get(input.id).workspace), false)
    assert.equal(packet.schema.properties.tag.properties.user_turn.oneOf.some(x =>
      x.properties.kind.enum.includes('continue_anchor')), input.arm === 'B' && receipt.modelAnchorRef !== null)
    return { input, packet, receipt }
  })
  let visible = 0
  for (let i = 0; i < rows.length; i += 2) {
    const [a, b] = rows.slice(i, i + 2)
    assert.equal(a.input.arm, (i / 2) % 2 === 0 ? 'A' : 'B')
    assert.equal(a.input.probe, b.input.probe)
    assert.equal(a.packet.focus, b.packet.focus)
    assert.equal(a.packet.prompt.split('\nCatalog data: ')[1], b.packet.prompt.split('\nCatalog data: ')[1])
    assert.notEqual(a.packet.prompt, b.packet.prompt)
    assert.notDeepEqual(a.packet.schema, b.packet.schema)
    assert.equal(a.receipt.modelAnchorRef, b.receipt.modelAnchorRef)
    visible += Number(a.receipt.modelAnchorRef !== null)
  }
  assert.equal(visible, 6)
})
