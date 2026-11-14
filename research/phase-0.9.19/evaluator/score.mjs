import { FIELDS, CONDITIONS, slotsFor } from '../protocol/contracts.mjs'
import { historicalEnvelope } from './read-raw.mjs'

const key = x => JSON.stringify(canonical(x))
function canonical(x) {
  if (Array.isArray(x)) return x.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'))
  if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])]))
  return x
}
export function scoreSets(predicted, gold) {
  const remaining = [...gold].map(key)
  let tp = 0, fp = 0
  for (const x of predicted) {
    const index = remaining.indexOf(key(x))
    if (index < 0) fp++
    else { tp++; remaining.splice(index, 1) }
  }
  return counts(tp, fp, remaining.length)
}
function counts(tp, fp, fn) {
  return { tp, fp, fn, precision: tp + fp ? tp / (tp + fp) : null,
    recall: tp + fn ? tp / (tp + fn) : null, f1: 2 * tp + fp + fn ? 2 * tp / (2 * tp + fp + fn) : null }
}
const exact = (a, b) => { const s = scoreSets(a, b); return !s.fp && !s.fn }
const average = xs => { const n = xs.filter(x => x !== null); return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null }

function births(decisions, slots) {
  return decisions.flatMap(d => {
    let occurrence = 0
    return d.actions.flatMap(a => {
      const id = ['CREATE', 'BRANCH'].includes(a.op) ? a.task_id : a.op === 'MERGE' && slots.includes(a.target_task_id) ? a.target_task_id : null
      return id ? [{ unit_id: d.unit_id, op: a.op, occurrence: occurrence++, task_id: id }] : []
    })
  })
}
function rename(x, mapping, field = '') {
  if (typeof x === 'string') return ['quote', 'text', 'source_id', 'objective'].includes(field) ? x : (mapping[x] ?? x)
  if (Array.isArray(x)) return x.map(v => rename(v, mapping, field))
  return x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, rename(v, mapping, k)])) : x
}
function stateAtoms(memory) {
  const result = Object.fromEntries(FIELDS.map(f => [f, []]))
  for (const m of memory) {
    const atom = (f, v) => result[f].push([m.task_id, v])
    m.objective_refs.forEach(r => atom('objective', r))
    m.criteria.forEach(c => atom('criteria', c))
    m.work_items.forEach(({ completion_basis, evidence, ...w }) => {
      atom('work', w); atom('completion', { ref: w.ref, completion_basis, evidence })
    })
    m.decisions.forEach(d => atom('decisions', d))
    m.open_conflicts.forEach(c => atom('conflicts', c))
    atom('lifecycle', m.lifecycle_status)
  }
  return result
}
function relations(ds) {
  return ds.flatMap(d => d.actions.flatMap(a => a.op === 'BRANCH'
    ? [[a.task_id, 'branch_of', a.parent_task_id]]
    : a.op === 'MERGE' ? a.source_task_ids.map(id => [id, 'joins_into', a.target_task_id]) : []))
}

export function scoreAttempt({ inputPacket: p, oracle: g, attempt, rawPrediction: raw, identityMap = {} }) {
  if (attempt.track === 'FROZEN-REPLAY') for (const prior of g.prior_births ?? []) {
    const source = p.messages.find(m => m.source_id === prior.source_id && m.role === 'assistant')
    if (!source) throw new Error('historical birth source missing from frozen replay')
    const envelope = historicalEnvelope(source.content)
    const candidates = births(envelope.work_state.decisions, slotsFor(p.family_id, prior.turn_id))
    const found = candidates.find(b => b.unit_id === prior.unit_id && b.op === prior.op && b.occurrence === prior.occurrence)
    if (!found || (identityMap[found.task_id] && identityMap[found.task_id] !== prior.task_id) ||
      Object.entries(identityMap).some(([id, goal]) => goal === prior.task_id && id !== found.task_id)) throw new Error('historical birth mismatch')
    identityMap[found.task_id] = prior.task_id
  }
  const valid = raw.valid && (!attempt.finish_reason || attempt.finish_reason === 'stop')
  const w0 = valid && raw.workState ? raw.workState : { decisions: [], task_memory: [], status_updates: [], proposed_active_task_ids: [], focus_task_id: null }
  const born = births(w0.decisions, p.slots)
  for (const birth of born) {
    const gold = g.births.find(b => b.unit_id === birth.unit_id && b.op === birth.op && b.occurrence === birth.occurrence)
    if (gold && !identityMap[birth.task_id] && !Object.values(identityMap).includes(gold.task_id)) identityMap[birth.task_id] = gold.task_id
  }
  const w = rename(w0, identityMap)
  const answer = valid ? rename(raw.answer, identityMap) : []
  const edges = ds => ds.flatMap(d => d.task_ids.map(id => [d.unit_id, id]))
  const user = scoreSets(edges(w.decisions), edges(g.decisions))
  const assistantEdges = answer.flatMap(b => b.decision_ids.flatMap(id => {
    const d = w.decisions.find(d => d.decision_id === id)
    return d ? b.task_ids.map(task => [d.unit_id, task]) : []
  }))
  const assistant = scoreSets(assistantEdges, g.answer.flatMap(a => a.task_ids.map(task => [a.unit_id, task])))
  const unresolved = scoreSets(w.decisions.filter(d => d.unresolved).map(d => d.unit_id), g.decisions.filter(d => d.unresolved).map(d => d.unit_id))
  const atoms = stateAtoms(w.task_memory), goldAtoms = stateAtoms(g.task_memory)
  const by_field = Object.fromEntries(FIELDS.map(f => [f, scoreSets(atoms[f], goldAtoms[f])]))
  const snapshot_exact = valid && FIELDS.every(f => !by_field[f].fp && !by_field[f].fn)
  const extraMemory = w.task_memory.some(m => !g.task_memory.some(gm => gm.task_id === m.task_id))
  const per_task = g.task_memory.map(m => ({ task_id: m.task_id,
    exact: !extraMemory && exact(w.task_memory.filter(p => p.task_id === m.task_id), [m]) }))
  const completed = memory => memory.flatMap(m => [
    ...m.work_items.filter(i => i.state === 'completed').map(i => [m.task_id, i.ref, i.completion_basis, i.evidence]),
    ...(m.lifecycle_status === 'completed' ? [[m.task_id, 'lifecycle', m.criteria]] : [])
  ])
  const completion = scoreSets(completed(w.task_memory), completed(g.task_memory))
  const actionKeys = ds => ds.map(d => [d.unit_id, d.actions.map(a => key(a)).join('\n')])
  const actions_exact = valid && exact(actionKeys(w.decisions), actionKeys(g.decisions))
  const switching = ds => ds.flatMap(d => d.actions.filter(a => a.op === 'SWITCH').map(a => [d.unit_id, a]))
  const goldSwitch = switching(g.decisions), predSwitch = switching(w.decisions)
  const answer_passed = valid && g.answer.every(a => {
    const texts = answer.filter(b => b.decision_ids.some(id => w.decisions.find(d => d.decision_id === id)?.unit_id === a.unit_id)).map(b => b.text).join('\n')
    return a.contains.every(s => texts.includes(s)) && a.excludes.every(s => !texts.includes(s))
  })
  const forbidden = edges(w.decisions).filter(([, id]) => g.forbidden.includes(id)).length
  const knownPredictions = edges(w.decisions).filter(([unit, id]) => g.known_tasks.includes(id) && g.decisions.some(d => d.unit_id === unit && d.task_ids.length))
  const wrongKnown = knownPredictions.filter(([unit, id]) => !g.decisions.find(d => d.unit_id === unit).task_ids.includes(id))
  return {
    family_id: p.family_id, turn_id: p.turn_id, context_condition: p.context_condition,
    arm: attempt.arm ?? p.arm, track: attempt.track ?? 'CLOSED-LOOP', split: p.split,
    category: p.category, difficulty: p.difficulty, themes: p.themes, schema_valid: valid,
    errors: raw.errors, unsafe_attempt: !valid && raw.envelope !== null,
    user, assistant, unresolved, actions_exact, answer_passed, forbidden,
    contamination: { wrong_known: wrongKnown.length, predicted_known: knownPredictions.length,
      affected_units: new Set(wrongKnown.map(([unit]) => unit)).size, eligible_units: g.decisions.filter(d => d.task_ids.length).length },
    new_tasks: scoreSets(rename(born, identityMap), g.births),
    switch_accuracy: goldSwitch.length ? Number(valid && exact(predSwitch, goldSwitch)) : null,
    false_switch: !goldSwitch.length && predSwitch.length > 0,
    relations: scoreSets(relations(w.decisions), relations(g.decisions)),
    active_exact: valid && exact(w.proposed_active_task_ids, g.proposed_active_task_ids),
    focus_exact: valid && w.focus_task_id === g.focus_task_id,
    status_exact: valid && exact(w.status_updates, g.status_updates),
    unresolved_reason_exact: valid && exact(w.decisions.filter(d => d.unresolved).map(d => [d.unit_id, d.unresolved.reason]), g.decisions.filter(d => d.unresolved).map(d => [d.unit_id, d.unresolved.reason])),
    identity_recovery: g.identity_visibility === 'identity_present' ? Number(valid && !user.fp && !user.fn) : null,
    identity_observations: w0.decisions.flatMap(d => d.task_ids.map(id => ({
      predicted: id, expected: g.decisions.find(gd => gd.unit_id === d.unit_id)?.task_ids ?? [], born: born.some(b => b.task_id === id)
    }))),
    task_identity_records: g.decisions.flatMap(gd => gd.task_ids.map(expected => {
      const rawIds = w0.decisions.find(d => d.unit_id === gd.unit_id)?.task_ids ?? []
      return { expected, predicted: rawIds.filter(id => gd.task_ids.length === 1 || (identityMap[id] ?? id) === expected) }
    })),
    state: { by_field, macro_f1: average(FIELDS.map(f => by_field[f].f1)), snapshot_exact, per_task,
      transition: g.changed ? Number(snapshot_exact && exact(w.status_updates, g.status_updates)) : null,
      retention: !g.changed ? Number(snapshot_exact) : null,
      completion, false_actual_completions: completion.fp,
      goal_revision_exact: g.changed ? Number(exact(atoms.objective, goldAtoms.objective) && exact(atoms.criteria, goldAtoms.criteria)) : null,
      conflict_exact: g.changed ? Number(exact(atoms.decisions, goldAtoms.decisions) && exact(atoms.conflicts, goldAtoms.conflicts)) : null,
      dormant_recovery: g.dormant && g.identity_visibility === 'identity_present' ? Number(snapshot_exact && !user.fp && !user.fn) : null,
      state_given_correct_identity: !user.fp && !user.fn ? Number(snapshot_exact) : null },
    usage: attempt.usage ?? null, clocks: attempt.clocks ?? null,
    streaming: attempt.transport_kind === 'live' ? !!attempt.streaming_complete : null,
    diagnostic_only: (attempt.arm ?? p.arm) === 'D',
    failure_codes: [...(!valid ? ['P-INVALID'] : []), ...(user.fp || user.fn ? ['M-ID'] : []), ...(!snapshot_exact ? ['M-STATE'] : []), ...(!answer_passed ? ['A-ASSERTION'] : [])]
  }
}

export function aggregate(rows, { condition, arm, track, split }) {
  if (!CONDITIONS.includes(condition)) throw new Error('condition required')
  if (!arm || !track || !split) throw new Error('group required')
  if (rows.some(r => r.context_condition !== condition || r.arm !== arm || r.track !== track || r.split !== split)) throw new Error('mixed group')
  if (arm === 'D' && split !== 'dev') throw new Error('D is diagnostic only')
  const sumMetric = name => counts(...['tp', 'fp', 'fn'].map(k => rows.reduce((n, r) => n + r[name][k], 0)))
  const stories = new Set(rows.map(r => r.family_id)).size
  const allCorrect = r => r.schema_valid && !r.user.fp && !r.user.fn && !r.assistant.fp && !r.assistant.fn && r.actions_exact && r.state.snapshot_exact
  const fragmented = new Map()
  for (const r of rows) for (const o of r.task_identity_records) {
    const k = r.family_id + ':' + o.expected
    const v = fragmented.get(k) ?? { ids: new Set(), observations: 0 }
    o.predicted.forEach(id => v.ids.add(id)); v.observations++; fragmented.set(k, v)
  }
  const eligible = [...fragmented.values()].filter(v => v.observations > 1)
  const result = {
    condition, arm, track, split, diagnostic_only: arm === 'D', attempts: rows.length, independent_stories: stories,
    user: sumMetric('user'), assistant: sumMetric('assistant'), unresolved: sumMetric('unresolved'), new_tasks: sumMetric('new_tasks'),
    schema_validity: average(rows.map(r => Number(r.schema_valid))), answer_pass_rate: average(rows.map(r => Number(r.answer_passed))),
    switch_accuracy: average(rows.map(r => r.switch_accuracy)),
    state_snapshot_exact: average(rows.flatMap(r => r.state.per_task.map(t => Number(t.exact && r.schema_valid)))),
    state_macro_f1: average(rows.map(r => r.state.macro_f1)),
    state_transition: average(rows.map(r => r.state.transition)), state_retention: average(rows.map(r => r.state.retention)),
    fragmentation: eligible.length ? eligible.filter(v => v.ids.size > 1).length / eligible.length : null,
    identity_missing: eligible.length ? eligible.filter(v => !v.ids.size).length / eligible.length : null,
    contamination: (() => {
      const wrong = rows.reduce((n, r) => n + r.contamination.wrong_known, 0)
      const predicted = rows.reduce((n, r) => n + r.contamination.predicted_known, 0)
      return { wrong_known: wrong, predicted_known: predicted, rate: predicted ? wrong / predicted : null }
    })(),
    forbidden: rows.reduce((n, r) => n + r.forbidden, 0),
    story_all_correct: stories ? [...new Set(rows.map(r => r.family_id))].filter(f => rows.filter(r => r.family_id === f).every(allCorrect)).length / stories : null,
    streaming_completion: average(rows.map(r => r.streaming === null ? null : Number(r.streaming))),
    uncertainty: { cluster_interval: null, reason: 'Gate 1 fixtures are not a confirmatory sample' },
    decision: 'EXPLORATORY_NOT_GO', rows
  }
  return result
}
