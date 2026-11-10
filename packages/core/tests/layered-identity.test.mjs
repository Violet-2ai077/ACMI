import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildLayeredContext, createScopeAuthority, LayeredCandidateIndex, understandLayered } from '../src/index.ts'

const authority = createScopeAuthority()
const scope = authority.grant('lab')
const sha256 = text => createHash('sha256').update(text).digest('hex')
const access = { authority, scope, sha256 }
const cut = { workspaceId: 'lab', sessionId: 's1', incarnation: 'i1', cursor: 10, graphRevision: 1,
  authorizationEpoch: 1, bindingRevision: 1, sourceRevision: 1, candidateRevision: 1, policyVersion: 'v1' }
const task = (taskId, objective, status = 'open', workspaceId = 'lab') => ({
  taskId, objective, aliases: [objective], status, workspaceId, revision: 1,
  catalogRevision: 1, lastActivity: 1, reason: 'lexical',
})
const rows = [task('a', 'Archive recovery'), task('b', 'Badge kiosk'),
  task('c', '压缩测试', 'closed'), task('denied', 'Hidden billing', 'open', 'foreign')]
function run(text, list = rows, retained = []) {
  const current = { actor: 'user', kind: 'message', text, id: 't10' }
  const index = new LayeredCandidateIndex('lab', list)
  const retrieval = index.retrieve({ cut, query: text, bindingTaskId: 'a' }, access)
  const result = buildLayeredContext({ cut, current, binding: { taskId: 'a' }, candidates: retrieval.candidates, retained }, access)
  return { packet: result.packet, retrieval, ...understandLayered(result.packet) }
}
describe('layered interpretation and identity', () => {
  it('preserves explicit switching intent if the target is not available', () => {
    const result = run('Switch to the transit ledger.')
    expect(result.intents[0]).toMatchObject({ relation: 'existing', posture: 'switch' })
    expect(result.identities[0].status).toBe('unavailable')
    expect(result.authorization).toBe('no_operation')
  })

  it('separates read-only historical hints and present binding', () => {
    const result = run('恢复上周的压缩测试。')
    expect(result.intents[0].posture).toBe('resume')
    expect(result.identities[0]).toMatchObject({ status: 'historical', handle: 'h1' })
    expect(result.packet.binding.taskId).toBe('a')
    expect(result.retrieval.candidates.map(x => x.taskId)).not.toContain('denied')
  })

  it('does not treat quoting, asking, conditional statements or negation as task switches', () => {
    const result = run('不要切换；"Switch to Badge kiosk."；Badge kiosk 怎么样？')
    expect(result.utterance).toHaveLength(3)
    expect(result.utterance[0].negated).toBe(true)
    expect(result.utterance[1].quoted).toBe(true)
    expect(result.intents.every(x => x.posture !== 'switch')).toBe(true)
    expect(result.intents[2].relation).toBe('discussion')
    expect(run('If the tests pass, switch to Badge kiosk.').intents[0].posture).toBe('discuss')
  })

  it('returns ambiguity for colliding names and resolves the previous live hypothesis without changing binding', () => {
    const same = [task('a', 'Badge kiosk'), task('b', 'Badge kiosk')]
    expect(run('Switch to Badge kiosk.', same).identities[0].status).toBe('ambiguous')
    const back = run('Go back to the previous task.', rows, [{ kind: 'identity', taskId: 'b', revision: 1,
      cursor: 9, sourceRevision: 1, ref: 't9' }])
    expect(back.identities[0]).toMatchObject({ status: 'active', reason: 'recent' })
    expect(back.packet.active.find(x => x.handle === back.identities[0].handle).taskId).toBe('b')
    expect(back.packet.binding.taskId).toBe('a')
  })

  it('separates objective changes, new work, social and unknown, without issuing new IDs', () => {
    expect(run('Revise the objective to include printed receipts.').intents[0]).toMatchObject({ relation: 'existing', change: 'objective' })
    const result = run('Open a separate task for printed receipts.')
    expect(result.intents[0].relation).toBe('new')
    expect(result.identities[0]).toEqual({ status: 'unassigned', reason: 'new_work_has_no_id' })
    expect(run('Thanks!').intents[0].relation).toBe('none')
    expect(run('That one.').intents[0].relation).toBe('unknown')
  })
})
