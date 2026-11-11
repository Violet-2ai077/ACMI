import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { buildLayeredContext, createScopeAuthority } from '../../packages/core/dist/index.js'
import { prepareRequest, validateResponse, scoreResponse } from './contract.mjs'

const sha256 = s => createHash('sha256').update(s).digest('hex')
const cut = { workspaceId: 'workspace-private', sessionId: 'session-private', incarnation: 'instance-private', cursor: 9,
  graphRevision: 1, bindingRevision: 1, candidateRevision: 1, sourceRevision: 1, authorizationEpoch: 1, policyVersion: 'fixture' }
const current = { id: 'current-private', actor: 'user', kind: 'message', text: 'Go back to the one from my note. 🍊' }
const text = 'I meant the shelf that keeps bottles from sliding.'
const source = { id: 'source-private', actor: 'user', kind: 'message', text, digest: sha256(text), complete: true, cut: { ...cut, cursor: 8 } }
const task = (id, objective, extra = {}) => ({ taskId: id, objective, aliases: [], workspaceId: cut.workspaceId,
  status: 'open', lastActivity: 1, catalogRevision: 1, revision: 1, reason: 'lexical', ...extra })
const tasks = [task('task-private-a', 'Bottle rail mounting'), task('task-private-h', 'Old storage plan', { status: 'closed' }),
  task('hidden-task', 'Do not disclose this fixture', { workspaceId: 'other' })]
function fixture(overrides = {}) {
  const authority = createScopeAuthority()
  const scope = authority.grant(cut.workspaceId)
  let reads = 0
  return { context: { cut, current, candidates: tasks, binding: { taskId: 'task-private-a' } }, sourceId: source.id,
    access: { authority, scope, sha256, permitsTask: () => true, readCurrentCut: () => cut, permitsSource: () => true,
      readSource: () => { reads++; return source }, ...overrides }, reads: () => reads }
}
const cite = (ref, quote, start = 0) => ({ ref, start, end: start + quote.length, quote })
const reply = (r, value) => validateResponse(r, { requestDigest: r.requestDigest, raw: JSON.stringify(value) })

test('matched projection preserves focus and candidate handles without sending internal identifiers', () => {
  const f = fixture()
  const off = prepareRequest(f, false)
  assert.equal(f.reads(), 0)
  const on = prepareRequest(f, true)
  assert.equal(f.reads(), 1)
  assert.equal(off.status, 'ready')
  assert.equal(on.status, 'ready')
  assert.deepEqual({ ...on.payload, antecedent: null }, off.payload)
  assert.notEqual(off.requestDigest, on.requestDigest)
  assert.equal(on.payload.antecedent.text, text)
  for (const forbidden of ['workspace-private', 'session-private', 'instance-private', 'source-private', 'task-private-a',
    'hidden-task', 'Do not disclose']) assert(!JSON.stringify(on.payload).includes(forbidden))
})

test('denied or revoked source produces no marker or content in the transport input', () => {
  const f = fixture({ permitsSource: () => false })
  const withSource = prepareRequest(f, true)
  assert.equal(f.reads(), 0)
  assert.deepEqual(withSource.payload, prepareRequest(f, false).payload)
  let permitted = true
  const raced = fixture({ permitsSource: () => permitted, readSource: () => { permitted = false; return source } })
  assert.equal(prepareRequest(raced, true).payload.antecedent, null)
})

test('stale, malformed, invented, foreign and non-bindable proposals fail closed', () => {
  const r = prepareRequest(fixture(), true)
  const good = { decision: 'suggest_active', handle: 'a1', evidence: [cite('current', 'Go back'), cite('antecedent', 'I meant')] }
  assert.equal(reply(r, good).status, 'accepted_for_scoring')
  assert.equal(validateResponse(r, { requestDigest: 'stale', raw: JSON.stringify(good) }).status, 'stale_response')
  assert.equal(validateResponse(r, { requestDigest: r.requestDigest, raw: '{' }).status, 'parse_error')
  assert.equal(reply(r, { ...good, handle: 'hidden-task' }).status, 'candidate_fence')
  assert.equal(reply(r, { ...good, handle: 'h1' }).status, 'candidate_fence')
  assert.equal(reply(r, { ...good, apply: true }).status, 'schema_error')
  assert.equal(reply(r, { ...good, evidence: [cite('current', 'not in source')] }).status, 'evidence_error')
  assert.equal(reply(r, { ...good, evidence: [cite('current', current.text.at(-2), current.text.length - 2)] }).status, 'evidence_error')
  assert.equal(reply(prepareRequest(fixture(), false), good).status, 'evidence_error')
})

test('grounded coordinates do not prove semantic support', () => {
  const r = prepareRequest(fixture(), true)
  const validated = reply(r, { decision: 'suggest_active', handle: 'a1', evidence: [cite('current', 'Go back')] })
  assert.equal(validated.status, 'accepted_for_scoring')
  const result = scoreResponse(validated, { decision: 'suggest_active', handle: 'a1',
    support: [{ ref: 'antecedent', text: 'keeps bottles from sliding' }] }, r.payload)
  assert.equal(result.identityCorrect, true)
  assert.equal(result.supportCorrect, false)
  assert.equal(result.exact, false)
})

test('prompt and schema count against the aggregate input budget; candidates are not dropped to fit', () => {
  const f = fixture()
  const at = n => ({ ...f, context: { ...f.context, current: { ...current, text: '水'.repeat(n) } } })
  const retainsAll = n => {
    const { packet } = buildLayeredContext(at(n).context, f.access)
    return packet?.active.length === 1 && packet?.historical.length === 1
  }
  let lo = 1, hi = 3500
  while (hi - lo > 1) {
    const n = Math.floor((lo + hi) / 2)
    if (retainsAll(n)) lo = n
    else hi = n
  }
  const full = at(lo)
  assert(retainsAll(lo))
  assert.equal(prepareRequest(full, false).status, 'blocked_budget')
})
