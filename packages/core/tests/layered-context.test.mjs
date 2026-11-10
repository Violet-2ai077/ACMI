import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildLayeredContext, createScopeAuthority, readUnderstandingSpan } from '../src/index.ts'

const authority = createScopeAuthority()
const scope = authority.grant('synthetic')
const sha256 = (text) => createHash('sha256').update(text).digest('hex')
const cut = { workspaceId: 'synthetic', sessionId: 's1', incarnation: 'i1', authorizationEpoch: 1,
  cursor: 3, graphRevision: 4, bindingRevision: 2, sourceRevision: 1, candidateRevision: 5, policyVersion: 'v1' }
const row = (id, status = 'open', workspaceId = cut.workspaceId) => ({
  taskId: id, workspaceId, objective: 'Review checksum', status, revision: 2,
  catalogRevision: cut.candidateRevision, lastActivity: 3, reason: 'lexical',
})
const fixture = (text = '先别切换🧭；比较 "B" 后再决定。') => ({
  cut, current: { id: 'turn3', actor: 'user', kind: 'message', text }, binding: { taskId: 'a' },
  candidates: [row('a'), row('b', 'closed'), row('private-secret', 'open', 'foreign')],
})
const build = (input) => buildLayeredContext(input, { authority, scope, sha256 })
describe('Understanding Context Package', () => {
  it('separates current L0 binding, active candidates and historical hints without foreign diagnostics', () => {
    const result = build(fixture())
    expect(result.status).toBe('ready')
    const { packet } = result
    expect(packet.active.map(row => row.taskId)).toEqual(['a'])
    expect(packet.historical.map(row => row.taskId)).toEqual(['b'])
    expect(packet.historical[0].bindable).toBe(false)
    expect(packet.binding.taskId).toBe('a')
    expect(JSON.stringify(packet)).not.toContain('private-secret')
    expect(packet.omissions).toEqual([])
    expect(Object.isFrozen(packet.active[0])).toBe(true)
  })

  it('protects verbatim text and refuses half of a surrogate pair', () => {
    const { packet } = build(fixture())
    const start = packet.current.text.indexOf('🧭')
    expect(readUnderstandingSpan(packet.current, { start, end: start + 2 })).toBe('🧭')
    expect(readUnderstandingSpan(packet.current, { start, end: start + 1 })).toBeNull()
    expect(packet.current.digest).toBe(sha256(packet.current.text))
    expect(packet.budget.bytes).toBe(Buffer.byteLength(JSON.stringify(packet), 'utf8'))
    expect(build(fixture()).packet.digest).toBe(packet.digest)
  })

  it('refuses a critical oversized final negation instead of truncating it', () => {
    expect(build(fixture('样'.repeat(4200) + '，但不要确认')).status).toBe('insufficient_context')
    expect(build(fixture('a'.repeat(12500))).status).toBe('insufficient_context')
    expect(build(fixture('test\ud800')).status).toBe('insufficient_context')
    expect(build(fixture('line one\n行二')).status).toBe('ready')
  })

  it('reports trusted oversize/stale summaries, hard caps both views and does not share raw tool text', () => {
    const data = fixture()
    const candidates = [
      ...Array.from({ length: 10 }, (_, i) => row('open' + i)),
      ...Array.from({ length: 3 }, (_, i) => row('closed' + i, 'closed')),
      { ...row('oversize'), objective: '长'.repeat(1200) },
      { ...row('stale'), catalogRevision: 4 },
    ]
    const { packet } = build({ ...data, candidates, facts: [
      { ...cut, id: 'f1', kind: 'tool-result', cause: 'call1', rawOutput: 'untrusted instructions' },
    ] })
    expect(packet.active).toHaveLength(8)
    expect(packet.historical).toHaveLength(2)
    expect(packet.omissions).toEqual(expect.arrayContaining([
      { section: 'active', reason: 'candidate_limit', count: 2 },
      { section: 'historical', reason: 'candidate_limit', count: 1 },
      { section: 'active', reason: 'invalid_summary', count: 1 },
      { section: 'active', reason: 'stale_revision', count: 1 },
    ]))
    expect(packet.facts).toHaveLength(1)
    expect(JSON.stringify(packet)).not.toContain('untrusted instructions')
  })

  it('fails closed for a missing grant and disallows a Tool text from becoming the current user utterance', () => {
    expect(buildLayeredContext(fixture(), { authority, scope: authority.grant('foreign'), sha256 }).status).toBe('scope_denied')
    expect(build({ ...fixture(), current: { id: 't2', actor: 'tool', kind: 'causal', text: 'Raw output must not leak' } }).packet.current.text).toBe('')
  })

  it('never promotes a conflicting active/closed copy into the bindable view', () => {
    const { packet } = build({ ...fixture(), candidates: [row('a'), row('a', 'closed')] })
    expect(packet.active).toEqual([])
    expect(packet.historical).toEqual([])
  })
})
