import { hash, UUID } from '../protocol/contracts.mjs'

export function compileRequest(p, { prompts, stage, answerText } = {}) {
  if (!p || !['C1', 'C2', 'C3'].includes(p.context_condition) || !['A', 'B', 'C0', 'D'].includes(p.arm)) throw new Error('condition/arm')
  const diagnostic = p.arm === 'D'
  if (diagnostic ? !['answer', 'marker'].includes(stage) || p.split !== 'dev' : stage !== undefined || answerText !== undefined) throw new Error('invalid stage')
  if (diagnostic && (stage === 'marker' ? typeof answerText !== 'string' || !answerText.length : answerText !== undefined)) throw new Error('diagnostic answer')
  const answerOnly = p.arm === 'C0' || (diagnostic && stage === 'answer')
  const instructions = prompts?.[answerOnly ? 'C0' : p.arm]
  if (typeof instructions !== 'string' || !instructions.trim()) throw new Error('missing prompt')
  if (!Array.isArray(p.messages) || !p.sourceMap || !Array.isArray(p.unit_ids)) throw new Error('sources')
  const seen = new Set()
  const messages = p.messages.map(m => {
    if (!m || typeof m.source_id !== 'string' || !m.source_id || seen.has(m.source_id) || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || !Object.hasOwn(p.sourceMap, m.source_id) || p.sourceMap[m.source_id] !== m.content) throw new Error('invalid message source')
    seen.add(m.source_id)
    return { role: m.role, source_id: m.source_id, content: m.content }
  })
  if (Object.keys(p.sourceMap).length !== seen.size || new Set(p.unit_ids).size !== p.unit_ids.length || p.unit_ids.some(u => !messages.some(m => m.source_id === u && m.role === 'user'))) throw new Error('invalid unit/source map')
  const metadata = { unit_ids: [...p.unit_ids] }
  if (!answerOnly) {
    if (!Array.isArray(p.slots) || p.slots.length !== 4 || new Set(p.slots).size !== 4 || p.slots.some(s => !UUID.test(s))) throw new Error('UUID slots')
    if (typeof p.turn_id !== 'string' || !p.turn_id || typeof p.base_state_id !== 'string' || !p.base_state_id) throw new Error('request identifiers')
    Object.assign(metadata, { turn_id: p.turn_id, base_state_id: p.base_state_id, slots: [...p.slots] })
  }
  if (p.context_condition === 'C1') {
    if (!Array.isArray(p.catalog) || !Array.isArray(p.active)) throw new Error('C1 state')
    metadata.catalog = p.catalog.map(t => ({ task_id: t.task_id, objective: t.objective, acceptance: structuredClone(t.acceptance) }))
    metadata.active = [...p.active]
    metadata.metadata_invalid = p.metadata_invalid === true
    if (p.projection !== undefined) {
      if (p.projection?.provenance !== 'model_proposed' || !p.projection.value || typeof p.projection.value !== 'object') throw new Error('C1 projection provenance')
      metadata.projection = { provenance: 'model_proposed', value: structuredClone(p.projection.value) }
    }
  }
  const body = { instructions, messages, metadata }
  if (diagnostic && stage === 'marker') body.diagnostic_answer = answerText
  const serialized = JSON.stringify(body)
  return { body, serialized, request_hash: hash(serialized), prompt_hash: hash(instructions),
    answer_hash: diagnostic && stage === 'marker' ? hash(answerText) : null }
}
