import { VERSION, CONDITIONS, clone, slotsFor } from '../protocol/contracts.mjs'

export const A = '11111111-1111-4111-8111-111111111111'
export const B = '22222222-2222-4222-8222-222222222222'
export const C = '33333333-3333-4333-8333-333333333333'
const ref = (source_id, quote) => ({ source_id, quote })

export function getFixture(id = 'maintenance') {
  const text = [
    'Repair gateway. Acceptance: test passes. Plan: run test. Decision: timeout 100. Calculate 3 times 100.',
    'Revise acceptance: test and latency pass. Plan is not execution. Decision: timeout 200 supersedes timeout 100.',
    'Start independent billing export. Acceptance: two columns. Gateway remains unfinished.',
    'Continue billing export. Plan: validate columns.',
    'Billing test result: two columns passed. Gateway has no test result.',
    'Conflicting gateway review: timeout 300. No authority to replace timeout 200.',
    'Continue billing documentation; do not change gateway decisions.',
    'Return to gateway. Test result: test failed. Keep revised acceptance and unresolved timeout conflict.'
  ]
  const s = {
    family_id: id, split: 'dev',
    catalog: [{ task_id: A, objective: 'Repair gateway', acceptance: ['test passes'], note: 'HOST_ONLY_CANARY' }],
    initial_active: [A],
    initial: { C1: [], C2: [{ role: 'system', source_id: 'h0', content: `Historical identity: ${A} Repair gateway.` }], C3: [] },
    turns: text.map((content, i) => ({
      turn_id: `t${i + 1}`, session_id: i < 4 ? 's1' : 's2',
      category: 'continuity', difficulty: i < 2 ? 'simple' : i < 4 ? 'medium' : 'hard',
      themes: [`SM${[4, 2, 1, 4, 1, 3, 5, 6][i]}`],
      identity_visibility: 'identity_present',
      messages: [{ role: 'user', source_id: `u${i + 1}`, content }]
    }))
  }
  if (id === 'identity-absent') {
    s.initial.C2 = []
    s.catalog = []
    s.initial_active = []
    s.turns = [{ ...s.turns[0], identity_visibility: 'identity_absent', messages: [{ role: 'user', source_id: 'u1', content: 'Resume the old gateway repair; its historical identity is unavailable.' }] }]
  }
  const oracle = {}
  for (const condition of CONDITIONS) {
    oracle[condition] = {}
    for (const [i, turn] of s.turns.entries()) {
      const missing = id === 'identity-absent'
      const target = i >= 2 && i < 7 ? B : A
      const birth = !missing && ((i === 0 && condition === 'C3') || i === 2)
      const switched = i === 7
      const action = missing ? { op: 'UNRESOLVED' } : birth
        ? { op: 'CREATE', task_id: target, objective: target === A ? 'Repair gateway' : 'Billing export', acceptance: [target === A ? 'test passes' : 'two columns'] }
        : switched ? { op: 'SWITCH', from_task_ids: [B], to_task_ids: [A] } : { op: 'CONTINUE', task_ids: [target] }
      const quote = turn.messages[0].content
      const unresolved = missing ? { reason: 'unknown_task', candidate_task_ids: [], missing_evidence: 'Historical UUID absent' } : null
      const decisions = [{
        decision_id: 'd1', unit_id: `u${i + 1}`, actions: [action], task_ids: missing ? [] : [target],
        resolved_scope_quotes: missing ? [] : [quote], unresolved_scope_quotes: missing ? [quote] : [],
        unresolved, evidence: [ref(`u${i + 1}`, quote)], self_reported_confidence: 'not_reported'
      }]
      const memory = missing ? [] : [{
        task_id: A, lifecycle_status: i === 7 ? 'blocked' : 'running',
        objective_refs: [ref('u1', 'Repair gateway')],
        criteria: [{ ref: i === 0 ? ref('u1', 'test passes') : ref('u2', 'test and latency pass'), state: i === 7 ? 'failed' : 'pending', evidence: i === 7 ? [ref('u8', 'test failed')] : [] }],
        work_items: [{ ref: ref('u1', 'run test'), state: i === 7 ? 'failed' : 'planned', completion_basis: i === 7 ? 'observed' : 'none', evidence: i === 7 ? [ref('u8', 'test failed')] : [] }],
        decisions: [{ topic_ref: ref('u1', 'Decision'), selected_ref: i === 0 ? ref('u1', 'timeout 100') : ref('u2', 'timeout 200'),
          supersedes_refs: i === 0 ? [] : [ref('u1', 'timeout 100')], state: i >= 5 ? 'disputed' : 'active',
          evidence: [i === 0 ? ref('u1', 'timeout 100') : ref('u2', 'timeout 200 supersedes timeout 100')] }],
        open_conflicts: i >= 5 ? [{ refs: [ref('u2', 'timeout 200'), ref('u6', 'timeout 300')], resolution_ref: null }] : []
      }]
      if (!missing && i >= 2) memory.push({
        task_id: B, lifecycle_status: i >= 4 ? 'completed' : 'running', objective_refs: [ref('u3', 'billing export')],
        criteria: [{ ref: ref('u3', 'two columns'), state: i >= 4 ? 'satisfied' : 'pending', evidence: i >= 4 ? [ref('u5', 'two columns passed')] : [] }],
        work_items: [], decisions: [], open_conflicts: []
      })
      const active = missing ? [] : i >= 2 && i < 7 ? [A, B] : [A]
      // Each expected state is authored from the event script, never from the reducer.
      oracle[condition][turn.turn_id] = {
        identity_visibility: turn.identity_visibility, decisions, task_memory: memory,
        proposed_active_task_ids: active, focus_task_id: missing ? null : target,
        status_updates: i === 7 ? [{ task_id: A, from: 'running', to: 'blocked', evidence: [ref('u8', 'test failed')], status: 'proposed' }] : [],
        births: birth ? [{ unit_id: `u${i + 1}`, op: 'CREATE', occurrence: 0, task_id: target }] : [],
        prior_births: [
          ...(!missing && condition === 'C3' && i > 0 ? [{ source_id: 'a1', turn_id: 't1', unit_id: 'u1', op: 'CREATE', occurrence: 0, task_id: A }] : []),
          ...(!missing && i > 2 ? [{ source_id: 'a3', turn_id: 't3', unit_id: 'u3', op: 'CREATE', occurrence: 0, task_id: B }] : [])
        ],
        forbidden: missing ? [A, B, C] : [C],
        answer: [{ unit_id: `u${i + 1}`, task_ids: missing ? [] : [target], contains: [i === 0 && !missing ? '300' : missing ? 'identity' : 'Recorded'], excludes: [] }],
        changed: [1, 4, 5, 7].includes(i), dormant: i === 7, known_tasks: missing ? [] : i >= 2 ? [A, B] : [A]
      }
    }
  }
  return { publicScenario: s, oracle, expected: { turn_count: s.turns.length } }
}

export function validateFixture(s, oracle) {
  const errors = []
  if (!s.family_id || !['dev', 'validation'].includes(s.split)) errors.push('identity')
  for (const c of CONDITIONS) for (const t of s.turns) if (!oracle[c]?.[t.turn_id]) errors.push(`${c}:${t.turn_id}`)
  return { valid: !errors.length, errors }
}

export function predictionFor(f, p) {
  const gold = clone(f.oracle[p.context_condition][p.turn_id])
  const map = new Map()
  if (p.context_condition === 'C3' && f.publicScenario.family_id !== 'identity-absent') map.set(A, slotsFor(p.family_id, 't1')[0])
  if (Number(p.turn_id.slice(1)) >= 3) map.set(B, slotsFor(p.family_id, 't3')[0])
  const translate = x => typeof x === 'string' ? (map.get(x) ?? x) : Array.isArray(x) ? x.map(translate) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, translate(v)])) : x
  return translate({
    answer: gold.answer.map((a, i) => ({ block_id: `b${i + 1}`, decision_ids: ['d1'], task_ids: a.task_ids, unresolved_reason: gold.decisions[0].unresolved?.reason ?? null, text: a.contains.join(' ') })),
    work_state: { schema_version: VERSION, turn_id: p.turn_id, base_state_id: p.base_state_id,
      decisions: gold.decisions, proposed_active_task_ids: gold.proposed_active_task_ids,
      focus_task_id: gold.focus_task_id, status_updates: gold.status_updates, task_memory: gold.task_memory }
  })
}
