import assert from 'node:assert/strict'
import test from 'node:test'
import { readAssignmentFrame, safeAssignmentText } from '../../integrations/dsh/dist/assignment-inline.js'
import { splitRoles } from '../../integrations/dsh/dist/role-attribution.js'
import { readLinkProposals, projectLink, linkKind } from './link.mjs'
import { inputs, packetFor, truth, wireFor } from './design.mjs'
import { decideLink } from './score.mjs'
import { proposalWire } from '../phase-0.9.15/design.mjs'

const options = { readAssignmentFrame, safeAssignmentText, splitRoles }
const cut = { links: { 'q-12345': { taskId: 't-one', workId: 'w-one' } }, toolAvailable: false, arm: 'B', anchorRef: 'q-12345' }
const need = { kind: 'unresolved' }
const link = { kind: linkKind }
const frame = (user, primary = link, intent = 'clarify', answer = 'Which version do you mean?', rest = {}) =>
  JSON.stringify({ answer, tag: { user_turn: user, assistant: { primary, related: [] }, intent, ...rest } })
const read = (s, arm = 'B') => readLinkProposals(s, 'eos', arm, cut, readAssignmentFrame, safeAssignmentText)
const project = (s, arm = 'B', stop = 'eos') => projectLink(s, stop, { ...cut, arm }, options)

test('explicit same-completion link resolves only to unresolved, with no identity or action', () => {
  const s = frame(need)
  assert.equal(read(s).link, 'resolved')
  assert.deepEqual(read(s).assistant, { kind: 'unresolved', relation: linkKind })
  assert.equal(project(s).assistant, 'unresolved')
  assert.equal(project(s).answer, 'Which version do you mean?')
  assert.deepEqual(project(s).operations, [])
  assert.deepEqual(project(s).issues, [])
  assert.equal(read(frame(need, need)).link, 'absent')
})

test('no link for missing/invalid source, existing/known/new/no-task, wrong intent, or extra fields', () => {
  const samples = [frame(undefined), frame({ ...need, scope: 'previous' }), frame(link), frame({ kind: 'no_task' }),
    frame({ kind: 'refer_existing', ref: 'q-12345' }), frame({ kind: 'continue_anchor' }), frame({ kind: 'propose_new', goal: 'New Map' }),
    frame(need, link, 'describe_only'), frame(need, { ...link, ref: 'q-12345' }), frame(need, link, 'clarify', 'Which?', { operation: 1 })]
  for (const s of samples) {
    assert.equal(read(s).link, 'rejected')
    assert.equal(read(s).assistant, null)
    assert(project(s).issues.length)
    assert.equal(project(s).assistant, 'unresolved') // Legacy Host fallback is not a valid relation.
  }
  assert.equal(read(frame(need), 'A').link, 'rejected')
  assert(project(frame(need), 'A').issues.length)
})

test('reply cannot leak marker; duplicate keys, truncation and real tools remain blocked', () => {
  const s = frame(need, link, 'clarify', 'Output: ' + linkKind)
  assert.throws(() => project(s), /UNSAFE_ANSWER/u)
  assert.throws(() => project(s, 'A'), /UNSAFE_ANSWER/u)
  assert.throws(() => project(frame(need), 'B', 'limit'), /TRUNCATED/u)
  assert.throws(() => projectLink(frame(need), 'eos', { ...cut, toolAvailable: true }, options), /TEXT_ONLY/u)
  const duplicate = frame(need).replace('"kind":"unresolved"', '"kind":"no_task","kind":"unresolved"')
  assert.throws(() => project(duplicate), /INVALID_FRAME/u)
  assert.equal(read(duplicate).assistant, null)
})

test('A baseline byte-identical, B only extends Assistant choice and one instruction', () => {
  assert.equal(inputs.length, 24)
  let visible = 0
  for (const [i, input] of inputs.entries()) {
    const { packet, receipt } = packetFor(input, { sessionId: input.story, nativeUserId: 'u-' + input.story, sourceUserSeq: 1 })
    const gold = truth[i]
    assert.equal(receipt.status, gold.anchorVerdict)
    if (input.arm === 'A') {
      visible += Number(receipt.modelAnchorRef !== null)
      assert.deepEqual(packet, proposalWire({ ...input, arm: 'B' }, null, receipt.modelAnchorRef))
    } else {
      const common = wireFor({ ...input, arm: 'A' }, null, receipt.modelAnchorRef)
      const tag = packet.schema.properties.tag.properties
      const original = common.schema.properties.tag.properties
      assert.deepEqual(tag.user_turn, original.user_turn)
      assert.deepEqual(tag.intent, original.intent)
      assert.deepEqual(tag.assistant.properties.related, original.assistant.properties.related)
      assert.equal(tag.assistant.properties.primary.oneOf.at(-1).properties.kind.enum[0], linkKind)
      assert.deepEqual(tag.assistant.properties.primary.oneOf.slice(0, -1), original.assistant.properties.primary.oneOf)
      assert.equal(packet.prompt.split('\nCatalog data: ')[1], common.prompt.split('\nCatalog data: ')[1])
    }
    assert.equal(input.arm, (i % 4 === 0 || i % 4 === 3) ? 'A' : 'B')
  }
  assert.equal(visible, 5)
})

test('model gate requires gain, actual links, no false attempts, and preservation of real new goals', () => {
  const A = { userExact: 10, assistantExact: 8, answerPassed: 10 }
  const B = { userExact: 10, assistantExact: 10, answerPassed: 10, targetedBoth: 4, linkedTargeted: 4, linkControls: 0,
    falseNewTargeted: 0, trueNewBoth: 2, wrongAnchorInheritance: 0, wrongExisting: 0 }
  assert.equal(decideLink(true, { A, B }), 'PASS_SCOPED_MODEL')
  for (const change of [{ linkedTargeted: 3 }, { linkControls: 1 }, { falseNewTargeted: 1 }, { trueNewBoth: 1 }, { assistantExact: 9 }]) {
    assert.equal(decideLink(true, { A, B: { ...B, ...change } }), 'PASS_HOST_MODEL_GATE_NOT_MET')
  }
  assert.equal(decideLink(false, { A, B }), 'HOST_GATE_NOT_MET')
  assert.equal(decideLink(false, { A, B }, 'budget'), 'INCONCLUSIVE_STOPPED')
})
