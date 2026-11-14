import { ARMS, CONDITIONS, hash, slotsFor, clone } from '../protocol/contracts.mjs'

export function buildInput(s, history, { condition, arm, turnId }) {
  if ('oracle' in s) throw new Error('oracle is not a public input')
  if (!CONDITIONS.includes(condition) || !ARMS.includes(arm)) throw new Error('condition/arm')
  const index = s.turns.findIndex(t => t.turn_id === turnId)
  if (index < 0) throw new Error('unknown turn')
  const messages = []
  const add = m => messages.push({ role: m.role, source_id: m.source_id, content: m.content })
  for (const m of s.initial[condition]) add(m)
  for (let i = 0; i <= index; i++) {
    for (const m of s.turns[i].messages) add(m)
    if (i < index) for (const h of history.filter(h => h.turn_id === s.turns[i].turn_id || (!h.turn_id && i === 0))) add(h)
  }
  const sourceMap = {}
  for (const m of messages) {
    if (!['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || Object.hasOwn(sourceMap, m.source_id)) throw new Error('invalid/duplicate message source')
    sourceMap[m.source_id] = m.content
  }
  const turn = s.turns[index]
  const p = {
    version: 'research-input-v2', family_id: s.family_id, split: s.split,
    context_condition: condition, arm, turn_id: turnId, session_id: turn.session_id,
    category: turn.category, difficulty: turn.difficulty, themes: [...turn.themes],
    identity_visibility: turn.identity_visibility,
    messages, sourceMap, unit_ids: turn.messages.filter(m => m.role === 'user').map(m => m.source_id),
    slots: slotsFor(s.family_id, turnId), prompt_version: 'offline-fixture-v2',
    base_state_id: hash([s.family_id, condition, arm, turnId, messages]).slice(0, 24)
  }
  if (condition === 'C1') {
    p.catalog = clone(s.catalog)
    const last = [...history].reverse().find(h => h.metadata_valid !== false && h.projection && typeof h.projection === 'object')?.projection
    p.active = clone(last?.proposed_active_task_ids ?? s.initial_active)
    p.metadata_invalid = history.at(-1)?.metadata_valid === false
    if (last && typeof last === 'object') p.projection = { provenance: 'model_proposed', value: clone(last) }
  }
  return p
}
