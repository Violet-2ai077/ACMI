import { ACTIONS, DECISION, MEMORY, WORK, STATES, UUID, CONDITIONS } from '../protocol/contracts.mjs'
import { buildInput } from '../context/build.mjs'
import { createPlan } from './plan.mjs'

const THEMES = {
  SM1: ['work_items', 'lifecycle_status'], SM2: ['objective_refs', 'criteria'],
  SM3: ['decisions', 'open_conflicts'], SM4: ['work_items'],
  SM5: ['objective_refs', 'criteria', 'work_items', 'decisions', 'open_conflicts', 'lifecycle_status'],
  SM6: ['open_conflicts', 'lifecycle_status', 'criteria']
}
const check = (yes, message) => { if (!yes) throw new Error(message) }
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v)
const unique = a => new Set(a).size === a.length
const sameSet = (a, b) => Array.isArray(a) && Array.isArray(b) && unique(a) && unique(b) && a.length === b.length && a.every(x => b.includes(x))
const nonempty = v => typeof v === 'string' && v.length > 0
const counters = () => Object.fromEntries(CONDITIONS.map(c => [c, Object.fromEntries(Object.keys(THEMES).map(t => [t, { change: 0, retain: 0 }]))]))
const strata = () => Object.fromEntries(CONDITIONS.map(c => [c, Object.fromEntries(['simple', 'medium', 'hard'].map(d => [d, counters()[c]]))]))
const canonical = v => Array.isArray(v) ? v.map(canonical).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0)
  : object(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v
const stateKey = value => JSON.stringify(canonical(value))

function shape(value, schema) {
  if (typeof schema === 'string') return schema === 'uuid' ? typeof value === 'string' && UUID.test(value) : typeof value === schema
  if (schema.optional) return value === undefined || shape(value, schema.optional)
  if (schema.nullable) return value === null || shape(value, schema.nullable)
  if (schema.enum) return schema.enum.includes(value)
  if (schema.list) return Array.isArray(value) && value.length <= schema.max && value.every(v => shape(v, schema.list))
  if (schema.action) return object(value) && Object.hasOwn(ACTIONS, value.op) && shape(value, ACTIONS[value.op])
  return object(value) && Object.keys(value).every(k => Object.hasOwn(schema, k)) && Object.entries(schema).every(([k, s]) => shape(value[k], s))
}

function walk(value, fn) {
  if (Array.isArray(value)) value.forEach(v => walk(v, fn))
  else if (object(value)) { fn(value); Object.values(value).forEach(v => walk(v, fn)) }
}

function referenceChecks(value, sourceMap, ids) {
  walk(value, obj => {
    if ('source_id' in obj && 'quote' in obj) {
      const source = sourceMap[obj.source_id]
      check(nonempty(obj.quote) && typeof source === 'string' && source.indexOf(obj.quote) >= 0 && source.indexOf(obj.quote) === source.lastIndexOf(obj.quote), 'missing, future or ambiguous evidence')
    }
    for (const [key, v] of Object.entries(obj)) {
      if (/task_id$/.test(key) && v !== null) check(ids.includes(v), 'unknown canonical task')
      if (/task_ids$/.test(key)) check(Array.isArray(v) && unique(v) && v.every(id => ids.includes(id)), 'unknown or duplicate canonical tasks')
    }
  })
}

function goldChecks(g, p, ids, previous) {
  check(object(g), 'missing oracle turn')
  for (const k of ['identity_visibility', 'decisions', 'task_memory', 'proposed_active_task_ids', 'focus_task_id', 'status_updates', 'births', 'prior_births', 'forbidden', 'answer', 'changed', 'dormant', 'known_tasks']) check(Object.hasOwn(g, k), `missing oracle field ${k}`)
  check(['identity_present', 'identity_partial', 'identity_absent'].includes(g.identity_visibility) && typeof g.changed === 'boolean' && typeof g.dormant === 'boolean', 'oracle flags')
  check(shape(g.decisions, { list: DECISION, max: 8 }) && shape(g.task_memory, { list: MEMORY, max: 8 }) && shape(g.status_updates, WORK.status_updates), 'oracle contract shape')
  check(sameSet(g.decisions.map(d => d.unit_id), p.unit_ids) && unique(g.decisions.map(d => d.decision_id)), 'unit decision coverage')
  check(Array.isArray(g.known_tasks) && g.known_tasks.length <= 8 && unique(g.known_tasks) && g.known_tasks.every(id => ids.includes(id)), 'known task inventory')
  check(sameSet(g.task_memory.map(m => m.task_id), g.known_tasks), 'incomplete task memory')
  if (previous) {
    check(previous.known_tasks.every(id => g.known_tasks.includes(id)), 'visible historical task lost')
    check(g.changed === (stateKey(previous.task_memory) !== stateKey(g.task_memory)), 'changed flag contradicts snapshots')
  }
  check(Array.isArray(g.proposed_active_task_ids) && unique(g.proposed_active_task_ids) && g.proposed_active_task_ids.every(id => g.known_tasks.includes(id)) && (g.focus_task_id === null || g.proposed_active_task_ids.includes(g.focus_task_id)), 'active/focus inventory')
  check(Array.isArray(g.forbidden) && unique(g.forbidden) && g.forbidden.every(id => ids.includes(id)), 'forbidden inventory')
  check(Array.isArray(g.answer) && sameSet(g.answer.map(a => a.unit_id), p.unit_ids), 'answer unit coverage')
  for (const a of g.answer) {
    check(Array.isArray(a.task_ids) && unique(a.task_ids) && a.task_ids.every(id => g.known_tasks.includes(id) && !g.forbidden.includes(id)), 'answer task inventory')
    check(Array.isArray(a.contains) && Array.isArray(a.excludes) && a.contains.concat(a.excludes).length > 0 && a.contains.concat(a.excludes).every(nonempty), 'missing answer assertions')
  }
  check(Array.isArray(g.births) && Array.isArray(g.prior_births), 'birth lists')
  const born = [], priorKnown = previous?.known_tasks ?? g.known_tasks.filter(id => !g.births.some(b => b.task_id === id))
  let actions = 0
  for (const d of g.decisions) {
    check(d.actions.length > 0 && d.task_ids.every(id => g.proposed_active_task_ids.includes(id) && !g.forbidden.includes(id)), 'decision targets')
    check((d.unresolved !== null) === d.actions.some(a => a.op === 'UNRESOLVED'), 'unresolved declaration')
    const source = p.sourceMap[d.unit_id], scopes = d.resolved_scope_quotes.concat(d.unresolved_scope_quotes)
    check(unique(scopes) && scopes.every(q => nonempty(q) && source.indexOf(q) >= 0 && source.indexOf(q) === source.lastIndexOf(q)), 'unit scope quote')
    check((!d.task_ids.length || d.resolved_scope_quotes.length > 0) && (!d.unresolved || d.unresolved_scope_quotes.length > 0), 'missing unit scope')
    for (const a of d.resolved_scope_quotes) for (const b of d.unresolved_scope_quotes) check(Math.min(source.indexOf(a) + a.length, source.indexOf(b) + b.length) <= Math.max(source.indexOf(a), source.indexOf(b)), 'resolved/unresolved scope overlap')
    const targets = []; let occurrence = 0
    for (const a of d.actions) {
      actions++
      if (a.op === 'CONTINUE' || a.op === 'SWITCH') {
        const selected = a.op === 'CONTINUE' ? a.task_ids : a.to_task_ids
        check(selected.length > 0, 'empty task action'); targets.push(...selected)
      } else if (['CREATE', 'BRANCH', 'MERGE'].includes(a.op)) {
        const task = a.op === 'MERGE' ? a.target_task_id : a.task_id
        targets.push(task)
        if (a.op === 'BRANCH') check(a.parent_task_id !== task, 'self branch')
        if (a.op === 'MERGE') check(a.source_task_ids.length >= 2 && !a.source_task_ids.includes(task), 'merge sources')
        if (a.op !== 'MERGE' || !priorKnown.includes(task)) {
          check(!priorKnown.includes(task), 'rebirth of known task')
          born.push({ unit_id: d.unit_id, op: a.op, occurrence: occurrence++, task_id: task })
        }
      }
    }
    check(sameSet(d.task_ids, [...new Set(targets)]), 'action/decision disagreement')
  }
  check(actions <= 16 && sameSet(born.map(b => JSON.stringify(b)), g.births.map(b => JSON.stringify({ unit_id: b.unit_id, op: b.op, occurrence: b.occurrence, task_id: b.task_id }))) && unique(born.map(b => b.task_id)), 'birth declaration mismatch')
  for (const m of g.task_memory) {
    for (const field of ['objective_refs', 'criteria', 'work_items', 'decisions', 'open_conflicts']) check(unique(m[field].map(stateKey)), 'duplicate state atom')
    for (const w of m.work_items) if (w.state === 'completed') check(['observed', 'accepted'].includes(w.completion_basis) && w.evidence.length > 0, 'unsupported actual completion')
    if (m.lifecycle_status === 'completed') check(m.criteria.length > 0 && m.criteria.every(c => ['satisfied', 'superseded'].includes(c.state)) && !m.open_conflicts.length && m.work_items.every(w => ['completed', 'cancelled', 'superseded'].includes(w.state)), 'incomplete task marked completed')
  }
  for (const u of g.status_updates) {
    check(g.task_memory.find(m => m.task_id === u.task_id)?.lifecycle_status === u.to, 'status/snapshot mismatch')
    if (previous?.task_memory.some(m => m.task_id === u.task_id)) check(previous.task_memory.find(m => m.task_id === u.task_id).lifecycle_status === u.from, 'status previous-state mismatch')
  }
  referenceChecks({ decisions: g.decisions, task_memory: g.task_memory, status_updates: g.status_updates }, p.sourceMap, ids)
}

function familyChecks(s, f, planned) {
  check(s.split === 'dev' && s.turns.length === 8 && sameSet(s.turns.map(t => t.turn_id), planned.turns.map(t => t.id)), 'public turn schedule')
  check(object(s.reference_history) && sameSet(Object.keys(s.reference_history), CONDITIONS) && object(f.oracle) && sameSet(Object.keys(f.oracle), CONDITIONS), 'condition coverage')
  check(Array.isArray(f.canonical_tasks) && f.canonical_tasks.length <= 8 && f.canonical_tasks.every(t => UUID.test(t.task_id) && nonempty(t.objective) && Array.isArray(t.acceptance) && t.acceptance.length && t.acceptance.every(nonempty) && STATES.includes(t.initial_status)), 'canonical task definitions')
  const ids = f.canonical_tasks.map(t => t.task_id); check(unique(ids), 'duplicate canonical task')
  check(object(s.initial) && sameSet(Object.keys(s.initial), CONDITIONS), 'initial condition coverage')
  check(Array.isArray(s.catalog) && s.catalog.length <= 8 && s.catalog.every(t => ids.includes(t.task_id) && nonempty(t.objective) && Array.isArray(t.acceptance) && t.acceptance.length && t.acceptance.every(nonempty)) && unique(s.catalog.map(t => t.task_id)), 'initial catalog identity')
  check(Array.isArray(s.initial_active) && unique(s.initial_active) && s.initial_active.every(id => s.catalog.some(t => t.task_id === id)), 'initial active identity')
  for (const [i, t] of s.turns.entries()) check(t.turn_id === planned.turns[i].id && t.difficulty === planned.turns[i].difficulty && t.category === planned.category && nonempty(t.session_id) && nonempty(t.agent_id), 'schedule metadata mismatch')
  for (const c of CONDITIONS) {
    const history = s.reference_history[c]
    check(Array.isArray(history) && history.length === 8 && history.every((h, i) => h.turn_id === s.turns[i].turn_id && h.role === 'assistant' && nonempty(h.content)), 'reference history order')
    check(sameSet(Object.keys(f.oracle[c]), s.turns.map(t => t.turn_id)), 'oracle turn coverage')
    const sourceIds = [...s.initial[c], ...s.turns.flatMap(t => t.messages), ...history].map(m => m.source_id)
    check(sourceIds.every(nonempty) && unique(sourceIds), 'duplicate source id')
    for (const [i, t] of s.turns.entries()) {
      const packet = buildInput(s, history, { condition: c, arm: 'A', turnId: t.turn_id })
      check(packet.unit_ids.length > 0 && packet.unit_ids.length <= 8, 'user unit count')
      goldChecks(f.oracle[c][t.turn_id], packet, ids, i ? f.oracle[c][s.turns[i - 1].turn_id] : null)
      const g = f.oracle[c][t.turn_id]
      if (i === 0 && c === 'C1') check(s.catalog.every(entry => g.known_tasks.includes(entry.task_id) && !g.births.some(b => b.task_id === entry.task_id)), 'C1 catalog rebirth or omission')
      const dormant = g.decisions.flatMap(d => d.task_ids).some(id => {
        let last = -1
        for (let j = 0; j < i; j++) if (f.oracle[c][s.turns[j].turn_id].decisions.some(d => d.task_ids.includes(id))) last = j
        return last >= 0 && i - last - 1 >= 5
      })
      check(g.dormant === dormant, 'dormant flag contradicts attribution gap')
      const prior = s.turns.slice(0, i).flatMap((old, j) => f.oracle[c][old.turn_id].births.map(b => ({ source_id: history[j].source_id, turn_id: old.turn_id, ...b })))
      check(sameSet(prior.map(stateKey), f.oracle[c][t.turn_id].prior_births.map(stateKey)), 'historical birth coordinates')
    }
  }
  const recovery = f.recovery_points
  check(Array.isArray(recovery) && recovery.length === (planned.recovery === 'none' ? 0 : 1), 'recovery point count')
  if (recovery.length) check(recovery[0].kind === planned.recovery && s.turns.findIndex(t => t.turn_id === recovery[0].turn_id) > 0, 'recovery point declaration')
  for (let i = 1; i < s.turns.length; i++) {
    const t = s.turns[i], prev = s.turns[i - 1], r = recovery.find(r => r.turn_id === t.turn_id)
    const changed = t.session_id !== prev.session_id || t.agent_id !== prev.agent_id
    check(changed === (r?.kind === 'handoff'), 'session/agent recovery mismatch')
  }
}

function opportunities(s, f, counts, byDifficulty) {
  check(Array.isArray(f.state_opportunities), 'missing state opportunities')
  const seen = new Set(), index = id => s.turns.findIndex(t => t.turn_id === id)
  for (const o of f.state_opportunities) {
    check(CONDITIONS.includes(o.condition) && Object.hasOwn(THEMES, o.theme) && ['change', 'retain'].includes(o.kind), 'state opportunity type')
    const key = JSON.stringify([o.condition, o.theme, o.task_id, o.turn_id])
    check(!seen.has(key), 'duplicate state opportunity'); seen.add(key)
    const before = index(o.previous_turn_id), after = index(o.turn_id)
    check(before >= 0 && after === before + 1, 'state opportunity must compare adjacent turns')
    const gold = f.oracle[o.condition], prior = gold[o.previous_turn_id].task_memory.find(m => m.task_id === o.task_id), current = gold[o.turn_id].task_memory.find(m => m.task_id === o.task_id)
    check(prior && current, 'state opportunity task missing')
    const values = m => Object.fromEntries(THEMES[o.theme].map(field => [field, m[field]]))
    const changed = stateKey(values(prior)) !== stateKey(values(current))
    check(changed === (o.kind === 'change'), 'state opportunity contradicts snapshots')
    if (o.theme === 'SM5') {
      check(gold[o.turn_id].dormant === true, 'dormant flag missing')
      const last = index(o.last_active_turn_id), assigned = i => gold[s.turns[i].turn_id].decisions.some(d => d.task_ids.includes(o.task_id))
      check(last >= 0 && after - last - 1 >= 5 && assigned(last) && assigned(after), 'dormant gap bounds')
      for (let i = last + 1; i < after; i++) check(!assigned(i), 'task not dormant during gap')
    }
    counts[o.condition][o.theme][o.kind]++
    byDifficulty[o.condition][s.turns[after].difficulty][o.theme][o.kind]++
  }
}

export function validateCorpus({ planManifest, publicCorpus, oracleCorpus }) {
  let conditions = counters(), byDifficulty = strata(); const errors = []
  try {
    createPlan(planManifest)
    check(publicCorpus?.version === 'gate2-public-corpus-v1' && oracleCorpus?.version === 'gate2-oracle-corpus-v1' && publicCorpus.split === 'dev' && oracleCorpus.split === 'dev', 'corpus wrapper/split')
    check(Array.isArray(publicCorpus.families) && Array.isArray(oracleCorpus.families), 'corpus families')
    const ids = planManifest.families.map(f => f.id)
    check(sameSet(publicCorpus.families.map(f => f.family_id), ids) && sameSet(oracleCorpus.families.map(f => f.family_id), ids), 'family coverage')
    for (const p of planManifest.families) {
      const s = publicCorpus.families.find(f => f.family_id === p.id), f = oracleCorpus.families.find(f => f.family_id === p.id)
      try { familyChecks(s, f, p); opportunities(s, f, conditions, byDifficulty) } catch (e) { throw new Error(`${p.id}: ${e.message}`) }
    }
  } catch (e) { errors.push(e.message); conditions = counters(); byDifficulty = strata() }
  const missing = CONDITIONS.flatMap(c => Object.keys(THEMES).flatMap(t => ['change', 'retain'].filter(k => conditions[c][t][k] < 2).map(k => `${c}.${t}.${k}`)))
  return { version: 'gate2-corpus-report-v1', structural_valid: !errors.length, errors, conditions, support_by_difficulty: byDifficulty,
    scored_turns_per_condition: errors.length ? null : 48, missing_coverage: missing,
    state_opportunity_coverage_complete: !errors.length && !missing.length,
    corpus_completeness_verified: false, semantic_truth_verified: false, family_independence_verified: false,
    identity_provenance_verified: false, negative_case_taxonomy_verified: false, live_execution_ready: false }
}
