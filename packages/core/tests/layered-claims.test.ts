import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { UnderstandingContextPackage } from '@acmi/contracts'
import { validateLayeredClaims, type LayeredClaimGraph } from '../src/layered-claims.ts'

const sha = (text: string) => createHash('sha256').update(text).digest('hex')
const cut = {
  workspaceId: 'w', sessionId: 's', incarnation: 'inc', authorizationEpoch: 2, bindingRevision: 3,
  graphRevision: 5, sourceRevision: 8, candidateRevision: 3, policyVersion: 'p', cursor: 4,
}
const initial: LayeredClaimGraph = {
  workspaceId: 'w', graphRevision: 5, topologyComplete: true, decisionLineageComplete: true,
  nodes: [
    { id: 'a', taskId: 'task', kind: 'work', state: 'running' },
    { id: 'b', taskId: 'task', kind: 'work', state: 'ready' },
    { id: 'c', taskId: 'task', kind: 'work', state: 'completed' },
    { id: 'j', taskId: 'task', kind: 'join', state: 'pending' },
    { id: 'external', taskId: 'other', kind: 'work', state: 'ready' },
  ],
  edges: [], decisions: [{ id: 'd', taskId: 'task', topic: 'queue', text: 'Use Redis', state: 'proposed' }],
  results: [{ id: 'r', nodeId: 'a', cause: 'run', content: {
    id: 'protected-content', sourceRevision: 7, digest: sha('42 checks passed'), actor: 'tool', text: '42 checks passed',
  } }],
}
type Actor = UnderstandingContextPackage['current']['actor']
function packet(text: string, actor: Actor = 'user', facts: readonly object[] = []) {
  return {
    schemaVersion: 'understanding-context/v0.1', cut,
    current: { id: 'turn', actor, kind: 'message', text, digest: sha(text) },
    binding: { taskId: 'task' }, active: [{ taskId: 'task', handle: 'h', bindable: true, status: 'open' }], facts,
  } as unknown as UnderstandingContextPackage
}
const turn = (text: string, start = 0, end = text.length) => ({ source: 'turn', id: 'turn', sourceRevision: 8,
  span: { start, end }, excerpt: text.slice(start, end), turnDigest: sha(text) })
const claim = (kind: string, fields: object, evidence: readonly object[], id = 'claim') => ({ id, taskHandle: 'h', kind, ...fields, evidence })
const validate = (context: UnderstandingContextPackage, claims: readonly object[], graph = initial) =>
  validateLayeredClaims(context, graph, { cut: context.cut, claims })
const decision = (evidence: object) => claim('decision-accepted', { decisionId: 'd', topic: 'queue', text: 'Use Redis' }, [evidence])
const accept = 'Approve decision d for queue: Use Redis'
const fact = (kind: string, details: object = {}) => ({ id: 'fact', kind, sourceRevision: 7,
  workspaceId: 'w', sessionId: 's', incarnation: 'inc', cursor: 3,
  relatedTaskId: 'task', relatedResultId: 'r', relatedWorkNodeId: 'a', cause: 'run', ...details })
const factEvidence = { source: 'fact', id: 'fact', sourceRevision: 7 }

describe('layered evidence: grounded review, not authority', () => {
  it('only accepts an exact complete user confirmation; emits protected evidence reference, not raw evidence', () => {
    const verdict = validate(packet(accept), [decision(turn(accept))])
    expect(verdict.status).toBe('draft')
    expect(verdict.claims[0]).toMatchObject({ claimId: 'claim', kind: 'decision-accepted', relationship: 'supports', uncertainty: 'review_only',
      evidence: [{ actor: 'user', sourceRevision: 8, protectedExcerptRef: { id: 'turn', digest: sha(accept) } }] })
    expect(JSON.stringify(verdict)).not.toContain(accept)
    expect(validate(packet(accept, 'assistant'), [decision(turn(accept))]).claims[0]?.relationship).toBe('contextualizes')
    const suggest = 'Suggest decision new for queue: Use SQLite'
    expect(validate(packet(suggest, 'assistant'), [claim('decision-proposed', { decisionId: 'new', topic: 'queue', text: 'Use SQLite' }, [turn(suggest)])]).status).toBe('draft')
  })

  it('rejects extracted positives from quoted, negated, conditional and hypothetical text', () => {
    const wrappers = [
      (x: string) => `"${x}"`, (x: string) => `Do not ${x}`, (x: string) => `If tests pass, ${x}`,
      (x: string) => `${x}, but compare costs first`, (x: string) => `${x}?`, (x: string) => `Suppose we ${x}`,
      (x: string) => `${x}\nActually, reject decision d for queue: Use Redis`,
      () => '\u65b9\u6848 A \u600e\u4e48\u6837\uff1f', () => '\u53ef\u4ee5\uff0c\u4f46\u5148\u518d\u6bd4\u8f83\u4e00\u4e0b',
      () => '\u5982\u679c\u6d4b\u8bd5\u901a\u8fc7\u5c31\u91c7\u7528 A',
    ]
    for (const wrap of wrappers) {
      const text = wrap(accept)
      expect(validate(packet(text), [decision(turn(text))]).status, text).not.toBe('draft')
      const index = text.indexOf(accept)
      if (index >= 0) expect(validate(packet(text), [decision(turn(text, index, index + accept.length))]).status, text).not.toBe('draft')
    }
    const reject = 'Reject decision d for queue: Use Redis'
    expect(validate(packet(reject), [decision(turn(reject))]).claims[0]?.relationship).toBe('contradicts')
    expect(validate(packet(reject), [claim('decision-rejected', { decisionId: 'd', topic: 'queue', text: 'Use Redis' }, [turn(reject)])]).status).toBe('draft')
  })

  it('checks exact, surrogate-safe bounds, revision and digest and refuses analyzer-owned authority fields', () => {
    const context = packet(accept)
    for (const bad of [{ excerpt: 'forged' }, { turnDigest: sha('wrong') }, { sourceRevision: 7 },
      { id: 'other' }, { span: { start: -1, end: accept.length } }, { span: { start: 0, end: accept.length + 1 } }]) {
      expect(validate(context, [decision({ ...turn(accept), ...bad })]).status).not.toBe('draft')
    }
    const emoji = 'Refine objective: test \ud83e\uddea results'
    const split = emoji.indexOf('\ud83e') + 1
    expect(validate(packet(emoji), [claim('objective-refined', { objective: 'test \ud83e\uddea results' }, [turn(emoji, 0, split)])]).status).not.toBe('draft')
    expect(validate(context, [{ ...decision(turn(accept)), authorization: 'confirmed' }]).status).toBe('abstain')
    for (const [field, v] of Object.entries(context.cut)) {
      const changed = { ...context.cut, [field]: typeof v === 'number' ? v + 1 : v + '-other' }
      expect(validateLayeredClaims(context, initial, { cut: changed, claims: [decision(turn(accept))] }).status, field).toBe('unresolved')
    }
    expect(validate(context, [decision(turn(accept))], { ...initial, graphRevision: 4 }).status).toBe('unresolved')
    expect(validate(context, [decision(turn(accept))], { ...initial, workspaceId: 'foreign' }).status).toBe('unresolved')
  })

  it('fails closed when a literal decision body still contains a condition or quotation', () => {
    for (const text of ['Use Redis except in production', 'Use Redis assuming TLS is enabled', "'Use Redis'", 'Use Redis \u9664\u975e\u6d4b\u8bd5\u5931\u8d25']) {
      const sentence = `Approve decision d for queue: ${text}`
      const graph = { ...initial, decisions: [{ ...initial.decisions[0]!, text }] }
      expect(validate(packet(sentence), [claim('decision-accepted', { decisionId: 'd', topic: 'queue', text }, [turn(sentence)])], graph).status,
        sentence).not.toBe('draft')
    }
  })

  it('distinguishes typed execution, produced, inspected, consumed, and disallows formal acceptance/Join/mainline', () => {
    const text = 'Task output';
    const cases = [
      ['execution-completed', 'subagent-completed', { nodeId: 'a', cause: 'run' }],
      ['result-observed', 'tool-result', { resultId: 'r' }], ['result-produced', 'result-produced', { resultId: 'r' }],
      ['result-inspected', 'result-inspected', { resultId: 'r' }], ['result-consumed', 'result-consumed', { resultId: 'r' }],
    ] as const
    for (const [kind, factKind, fields] of cases) {
      const draft = claim(kind, fields, [factEvidence])
      expect(validate(packet(text, 'subagent', [fact(factKind)]), [draft]).status, kind).toBe('draft')
      expect(validate(packet(text, 'subagent', [fact(factKind, { cause: 'foreign-run' })]), [draft]).status, kind).not.toBe('draft')
      for (const bad of [{ workspaceId: 'other' }, { sessionId: 'other' }, { incarnation: 'other' }, { cursor: 9 }, { relatedTaskId: 'other' }])
        expect(validate(packet(text, 'subagent', [fact(factKind, bad)]), [draft]).status, kind).not.toBe('draft')
      if (kind !== 'execution-completed') {
        expect(validate(packet(text, 'subagent', [fact('subagent-completed')]), [draft]).status, kind).not.toBe('draft')
        expect(validate(packet(text, 'subagent', [fact(factKind, { relatedResultId: 'another-result' })]), [draft]).status, kind).not.toBe('draft')
      }
    }
    for (const [kind, fields] of [['result-accepted', { resultId: 'r' }], ['join-satisfied', { nodeId: 'j' }],
      ['mainline-advanced', { nodeId: 'a' }]] as const) {
      expect(validate(packet(text, 'subagent', [fact('subagent-completed')]), [claim(kind, fields, [factEvidence])]).status).not.toBe('draft')
    }
  })

  it('does not infer result summary from metadata; accepts only exact controlled excerpt with causal typed fact', () => {
    const text = '42 checks passed'
    const context = packet('Tool done', 'tool', [fact('tool-result', { contentDigest: sha(text) })])
    const protectedExcerpt = { source: 'result-content', id: 'protected-content', sourceRevision: 7,
      digest: sha(text), span: { start: 0, end: text.length }, excerpt: text }
    const draft = (summary: string, evidence: readonly object[]) => claim('result-summary-proposed', { resultId: 'r', summary }, evidence)
    expect(validate(context, [draft(text, [factEvidence])]).status).not.toBe('draft')
    expect(validate(context, [draft(text, [protectedExcerpt])]).status).not.toBe('draft')
    expect(validate(context, [draft('42 checks failed', [factEvidence, protectedExcerpt])]).status).not.toBe('draft')
    expect(validate(context, [draft(text, [factEvidence, protectedExcerpt])]).status).toBe('draft')
  })

  it('checks scope, direction, topology, cycles, transition, Join predicate and decision supersession', () => {
    const dependency = (text: string, from: string, to: string, id = 'claim') => claim('dependency-proposed', { from, to }, [turn(text)], id)
    const text = 'Work a depends on b'
    expect(validate(packet(text), [dependency(text, 'a', 'b')]).status).toBe('draft')
    expect(validate(packet(text), [dependency(text, 'b', 'a')]).status).not.toBe('draft')
    expect(validate(packet(text), [dependency(text, 'a', 'b')], { ...initial, topologyComplete: false }).status).not.toBe('draft')
    const external = 'Work a depends on external'
    expect(validate(packet(external), [dependency(external, 'a', 'external')]).status).not.toBe('draft')
    const cyclic = 'Work a depends on b; Work b depends on a'
    expect(validate(packet(cyclic), [dependency(cyclic, 'a', 'b'), dependency(cyclic, 'b', 'a', 'two')]).status).not.toBe('draft')
    expect(validate(packet(text), [dependency(text, 'a', 'b')], { ...initial, edges: [{ from: 'b', to: 'a', relation: 'depends_on' }] }).status).not.toBe('draft')
    const join = 'Configure join j all-of a, b'
    expect(validate(packet(join), [claim('join-proposed', { nodeId: 'j', predicate: 'all-of', prerequisites: ['a', 'b'] }, [turn(join)])]).status).toBe('draft')
    expect(validate(packet(join), [claim('join-proposed', { nodeId: 'j', predicate: 'all-of', prerequisites: ['a', 'a'] }, [turn(join)])]).status).not.toBe('draft')
    const state = 'Set work a to completed'
    expect(validate(packet(state), [claim('work-transition', { nodeId: 'a', state: 'completed' }, [turn(state)])]).status).toBe('draft')
    const bad = 'Set work c to running'
    expect(validate(packet(bad), [claim('work-transition', { nodeId: 'c', state: 'running' }, [turn(bad)])]).status).not.toBe('draft')
    const lineage = 'Supersede decision d with d2 for queue: Use SQLite'
    const supersede = claim('decision-superseded', { decisionId: 'd2', priorDecisionId: 'd', topic: 'queue', text: 'Use SQLite' }, [turn(lineage)])
    expect(validate(packet(lineage), [supersede]).status).not.toBe('draft')
    const validLineage: LayeredClaimGraph = { ...initial, decisions: [{ ...initial.decisions[0]!, state: 'accepted' }] }
    expect(validate(packet(lineage), [supersede], validLineage).status).toBe('draft')
    expect(validate(packet(lineage), [supersede], { ...validLineage, decisionLineageComplete: false }).status).not.toBe('draft')
  })

  it('generated DAGs reject every cycle-closing edge and duplicate/conflicting claims fail closed', () => {
    for (let length = 2; length <= 24; length++) {
      const nodes = Array.from({ length }, (_, i) => ({ id: `n${i}`, taskId: 'task', kind: 'work' as const, state: 'ready' as const }))
      const edges = nodes.slice(1).map((n, i) => ({ from: `n${i}`, to: n.id, relation: 'depends_on' as const }))
      const end = `n${length - 1}`
      const cycle = `Work ${end} depends on n0`
      const proposal = claim('dependency-proposed', { from: end, to: 'n0' }, [turn(cycle)])
      expect(validate(packet(cycle), [proposal], { ...initial, nodes, edges }).reason, `length ${length}`).toBe('dependency-cycle')
    }
    expect(validate(packet(accept), [decision(turn(accept)), { ...decision(turn(accept)), id: 'same-change' }]).status).not.toBe('draft')
    const text = 'Set work a to completed; Set work a to blocked'
    expect(validate(packet(text), [claim('work-transition', { nodeId: 'a', state: 'completed' }, [turn(text)]),
      claim('work-transition', { nodeId: 'a', state: 'blocked' }, [turn(text)], 'other')]).status).not.toBe('draft')
  })

  it('retains a proposed local branch but does not redefine an existing Join or active decision', () => {
    const branch = 'Propose branch draft:docs under a: Compare release notes'
    expect(validate(packet(branch), [claim('branch-proposed', { nodeId: 'a', branchId: 'draft:docs', title: 'Compare release notes' }, [turn(branch)])]).status).toBe('draft')
    const join = 'Configure join j all-of a, b'
    expect(validate(packet(join), [claim('join-proposed', { nodeId: 'j', predicate: 'all-of', prerequisites: ['a', 'b'] }, [turn(join)])], {
      ...initial, edges: [{ from: 'a', to: 'j', relation: 'joins_into' }],
    }).status).not.toBe('draft')
    const existing = { ...initial.decisions[0]!, id: 'active', state: 'accepted' as const, text: 'Use SQLite' }
    expect(validate(packet(accept), [decision(turn(accept))], { ...initial, decisions: [...initial.decisions, existing] }).status).not.toBe('draft')
  })

  it('grounds explicit WorkNode, constraint and next-action drafts without relaxing references or negation', () => {
    const proposals = [
      ['Propose work draft:notes under a: Draft release notes', 'worknode-proposed', { nodeId: 'draft:notes', parentNodeId: 'a', title: 'Draft release notes' }],
      ['Refine work a: Check TLS configuration', 'worknode-refined', { nodeId: 'a', objective: 'Check TLS configuration' }],
      ['Record constraint for task: Never publish logs', 'constraint-proposed', { target: 'task', text: 'Never publish logs' }],
      ['Propose next action for a: Check TLS configuration', 'next-action-proposed', { nodeId: 'a', text: 'Check TLS configuration' }],
    ] as const
    for (const [text, kind, fields] of proposals) {
      expect(validate(packet(text), [claim(kind, fields, [turn(text)])]).status, kind).toBe('draft')
      const negated = `Do not ${text}`
      expect(validate(packet(negated), [claim(kind, fields, [turn(negated)])]).claims[0]?.relationship, kind).toBe('contradicts')
    }
    const next = 'Propose next action for external: Read logs'
    expect(validate(packet(next), [claim('next-action-proposed', { nodeId: 'external', text: 'Read logs' }, [turn(next)])]).status).not.toBe('draft')
  })
})
