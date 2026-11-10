import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { analyzeLayered, buildLayeredContext, createScopeAuthority } from '../src/index.ts'

const authority = createScopeAuthority()
const scope = authority.grant('lab')
const sha256 = value => createHash('sha256').update(value).digest('hex')
const cut = { workspaceId: 'lab', sessionId: 's', incarnation: 'i', authorizationEpoch: 1,
  bindingRevision: 1, graphRevision: 2, sourceRevision: 1, candidateRevision: 1, policyVersion: 'v1', cursor: 3 }
const graph = { workspaceId: 'lab', graphRevision: 2, topologyComplete: true, nodes: [],
  edges: [], decisions: [], results: [] }
const packet = (text, actor = 'user') => buildLayeredContext({ cut, current: { actor, id: 'e1', kind: 'message', text },
  binding: { taskId: 'a' }, candidates: [{ workspaceId: 'lab', taskId: 'a', catalogRevision: 1,
    revision: 1, status: 'open', lastActivity: 0, objective: 'Prepare export', reason: 'binding' }] }, { authority, scope, sha256 }).packet

it('grounds a separate graph draft and exposes no write operation', () => {
  const result = analyzeLayered(packet('Refine objective: prepare export checklist'), graph)
  expect(result.rawClaimKinds).toEqual(['objective-refined'])
  expect(result.graph.status).toBe('draft')
  expect(result.graph.drafts).toMatchObject([{ taskHandle: 'a1', arguments: { objective: 'prepare export checklist' } }])
  expect(result.interpretation.authorization).toBe('no_operation')
  expect(result.graph.claims[0].evidence[0].protectedExcerptRef.digest).toBe(sha256('Refine objective: prepare export checklist'))
})

it('does not invert negation or trust arbitrary model fields', () => {
  expect(analyzeLayered(packet('Do not refine objective: prepare export checklist'), graph).graph.status).not.toBe('draft')
  const analyzer = { propose: () => JSON.stringify({ cut, claims: [], authorization: 'approved' }) }
  expect(analyzeLayered(packet('Refine objective: prepare export checklist'), graph, { analyzer }).graph.status).toBe('abstain')
  expect(analyzeLayered(packet('Refine objective: prepare export checklist'), graph, { analyzer }).graph.drafts).toEqual([])
  expect(analyzeLayered(packet('Refine objective: prepare export checklist', 'assistant'), graph).graph.status).not.toBe('draft')
})

it('fails closed when the read-side analyzer rejects or exceeds budget', () => {
  for (const propose of [() => { throw Error('offline failure') }, () => 'a'.repeat(30000)]) {
    expect(analyzeLayered(packet('Refine objective: prepare export checklist'), graph, { analyzer: { propose } }).graph.status).toBe('abstain')
  }
})
