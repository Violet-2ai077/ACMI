import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { buildLayeredContext, createScopeAuthority, prepareIdentityAdvice, validateIdentityAdvice } from '../src/index.ts'

const sha256 = s => createHash('sha256').update(s).digest('hex')
const authority = createScopeAuthority()
const scope = authority.grant('workspace1')
const cut = { workspaceId: 'workspace1', sessionId: 'session1', incarnation: 'once', cursor: 1, authorizationEpoch: 1,
  bindingRevision: 1, graphRevision: 1, sourceRevision: 1, candidateRevision: 1, policyVersion: 'fixture' }
const row = (taskId, objective, status = 'open') => ({
  taskId, objective, workspaceId: cut.workspaceId, status, catalogRevision: 1, revision: 1, lastActivity: 1, reason: 'lexical',
})
const candidates = [row('current-task', 'Floor plan'), row('other-task', 'Door repair')]
const prepare = (text, prior, tasks = candidates) => {
  const built = buildLayeredContext({ cut, current: { id: 'event', text, actor: 'user', kind: 'message' },
    binding: { taskId: 'current-task' }, candidates: tasks }, { authority, scope, sha256, permitsTask: () => true })
  return prepareIdentityAdvice(built.packet, prior ? { text: prior, digest: sha256(prior) } : null, sha256, true)
}
const suggest = (source, quote, handle = 'a2') => JSON.stringify({ decision: 'suggest', handle, source, quote })

test('uses current explicit evidence over the current Binding and computes offsets locally', () => {
  const prepared = prepare('Switch to Door repair.')
  expect(prepared.model.binding).toBe('a1')
  expect(JSON.stringify(prepared.model)).not.toContain('other-task')
  expect(validateIdentityAdvice(prepared, suggest('current', 'Door repair'))).toEqual({
    status: 'suggestion', taskId: 'other-task', source: 'current', span: { start: 10, end: 21 },
  })
})

test('only an explicitly linked prior can provide a unique current suggestion', () => {
  const current = 'Return to the task from the previous session.'
  const past = 'I meant Door repair.'
  expect(validateIdentityAdvice(prepare(current, past), suggest('prior', 'Door repair'))).toMatchObject({ status: 'suggestion' })
  expect(validateIdentityAdvice(prepare(current), suggest('prior', 'Door repair'))).toMatchObject({ status: 'clarify' })
  expect(validateIdentityAdvice(prepare('That one.', past), suggest('prior', 'Door repair'))).toMatchObject({ status: 'clarify' })
  const twin = [...candidates, row('same-name', 'Door repair')]
  expect(validateIdentityAdvice(prepare(current, past, twin), suggest('prior', 'Door repair'))).toMatchObject({ status: 'clarify' })
})

test('authentic quotes do not upgrade negation, closed history, wrong identity or extra operations', () => {
  const text = 'Switch to Door repair.'
  const q = suggest('current', 'Door repair')
  expect(validateIdentityAdvice(prepare('Do not switch to Door repair.'), q)).toMatchObject({ status: 'clarify' })
  expect(validateIdentityAdvice(prepare(text, null, [candidates[0], row('other-task', 'Door repair', 'closed')]), q))
    .toMatchObject({ status: 'clarify' })
  expect(validateIdentityAdvice(prepare(text), suggest('current', 'Door repair', 'a1'))).toMatchObject({ status: 'clarify' })
  expect(validateIdentityAdvice(prepare(text), '{"decision":"clarify","handle":"a1"}')).toMatchObject({ status: 'clarify', reason: 'invalid_reply' })
  expect(validateIdentityAdvice(prepare('Thanks.'), '{"decision":"none"}')).toEqual({ status: 'no_suggestion' })
})
