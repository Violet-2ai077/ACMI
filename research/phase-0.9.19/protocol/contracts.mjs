import { createHash } from 'node:crypto'

export const VERSION = 'acmi-research-work-state-v2'
export const CONDITIONS = ['C1', 'C2', 'C3']
export const ARMS = ['A', 'B', 'C0', 'D']
export const OPS = ['CONTINUE', 'SWITCH', 'CREATE', 'BRANCH', 'MERGE', 'UNRESOLVED']
export const STATES = ['planned', 'ready', 'running', 'blocked', 'completed', 'failed', 'cancelled', 'superseded']
export const REASONS = ['ambiguous_reference', 'insufficient_context', 'conflicting_evidence', 'unknown_task', 'no_task']
export const FIELDS = ['objective', 'criteria', 'work', 'completion', 'decisions', 'conflicts', 'lifecycle']
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex')
export function slotsFor(family, turn) {
  return Array.from({ length: 4 }, (_, i) => {
    const h = hash([family, turn, i])
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
  })
}
export const clone = value => structuredClone(value)

const list = (item, max = 128) => ({ list: item, max })
const nullable = type => ({ nullable: type })
const enumeration = values => ({ enum: values })
const evidence = { source_id: 'string', quote: 'string' }
const refs = list(evidence)
export const ACTIONS = {
  CONTINUE: { op: enumeration(['CONTINUE']), task_ids: list('uuid', 8) },
  SWITCH: { op: enumeration(['SWITCH']), from_task_ids: list('uuid', 8), to_task_ids: list('uuid', 8) },
  CREATE: { op: enumeration(['CREATE']), task_id: 'uuid', objective: 'string', acceptance: list('string') },
  BRANCH: { op: enumeration(['BRANCH']), parent_task_id: 'uuid', task_id: 'uuid', objective: 'string', acceptance: list('string') },
  MERGE: { op: enumeration(['MERGE']), source_task_ids: list('uuid', 8), target_task_id: 'uuid',
    objective: { optional: 'string' }, acceptance: { optional: list('string') } },
  UNRESOLVED: { op: enumeration(['UNRESOLVED']) }
}
export const DECISION = {
  decision_id: 'string', unit_id: 'string', actions: list({ action: true }, 16), task_ids: list('uuid', 8),
  resolved_scope_quotes: list('string'), unresolved_scope_quotes: list('string'),
  unresolved: nullable({ reason: enumeration(REASONS), candidate_task_ids: list('uuid', 8), missing_evidence: 'string' }),
  evidence: refs, self_reported_confidence: enumeration(['low', 'medium', 'high', 'not_reported'])
}
export const ANSWER = { block_id: 'string', decision_ids: list('string', 8), task_ids: list('uuid', 8), unresolved_reason: nullable(enumeration(REASONS)), text: 'string' }
export const MEMORY = {
  task_id: 'uuid', lifecycle_status: enumeration([...STATES, 'unresolved']), objective_refs: refs,
  criteria: list({ ref: evidence, state: enumeration(['pending', 'satisfied', 'failed', 'superseded', 'unresolved']), evidence: refs }),
  work_items: list({ ref: evidence, state: enumeration([...STATES, 'unresolved']), completion_basis: enumeration(['none', 'reported', 'observed', 'accepted']), evidence: refs }),
  decisions: list({ topic_ref: evidence, selected_ref: nullable(evidence), supersedes_refs: refs, state: enumeration(['active', 'superseded', 'disputed']), evidence: refs }),
  open_conflicts: list({ refs, resolution_ref: nullable(evidence) })
}
export const WORK = {
  schema_version: enumeration([VERSION]), turn_id: 'string', base_state_id: 'string', decisions: list(DECISION, 8),
  proposed_active_task_ids: list('uuid', 8), focus_task_id: nullable('uuid'),
  status_updates: list({ task_id: 'uuid', from: enumeration(STATES), to: enumeration(STATES), evidence: refs, status: enumeration(['proposed']) }, 16),
  task_memory: list(MEMORY, 8)
}
export const ENVELOPE = { answer: list(ANSWER, 16), work_state: WORK }
