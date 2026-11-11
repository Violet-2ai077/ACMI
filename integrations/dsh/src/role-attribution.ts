import { z } from 'zod'
import { findAssignment, readAssignmentFrame, safeAssignmentText, splitOperations } from './assignment-inline.js'
import type { Assignment, AssignmentCut } from './assignment-inline.js'

const optional = z.unknown().optional()
const tag = z.strictObject({ user_turn: optional, assistant: optional, intent: optional, operations: optional })
const assistant = z.strictObject({ primary: optional, related: optional })
const choice = z.union([
  z.strictObject({ kind: z.literal('existing'), ref: z.string() }),
  z.strictObject({ kind: z.literal('new_task_proposal'), goal: z.string().trim().min(1).max(160) }),
  z.strictObject({ kind: z.enum(['unresolved', 'no_task']) }),
])
const intent = z.enum(['describe_only', 'execute', 'clarify', 'acknowledge', 'propose'])
const related = z.array(z.string()).max(2)
const privateWire = /"(?:tag|primary|related|operations|intent|kind|goal|ref)"\s*:/iu

export function splitRoles(raw: string, stop: string, cut: AssignmentCut) {
  const frame = readAssignmentFrame(raw, stop)
  if (!safeAssignmentText(frame.answer, cut) || privateWire.test(frame.answer.normalize('NFKC'))) throw new Error('UNSAFE_ANSWER')
  const issues: string[] = []
  const meta = tag.safeParse(frame.tag).data
  if (!meta) issues.push('INVALID_ROLE_SIDECAR')
  const a = assistant.safeParse(meta?.assistant).data
  const resolve = (value: unknown, label: string): { assignment: Assignment | 'unresolved' | 'no_task' | 'new_task_proposal',
    ref?: string, goal?: string } => {
    const c = choice.safeParse(value).data
    if (c?.kind === 'existing') {
      const assignment = findAssignment(cut, c.ref)
      if (assignment) return { assignment, ref: c.ref }
    } else if (c?.kind === 'new_task_proposal') {
      if (safeAssignmentText(c.goal, cut) && !privateWire.test(c.goal)) return { assignment: c.kind, goal: c.goal }
    } else if (c) {
      return { assignment: c.kind }
    }
    issues.push(label + '_UNRESOLVED')
    return { assignment: 'unresolved' }
  }
  const u = resolve(meta?.user_turn, 'USER'), primary = resolve(a?.primary, 'ASSISTANT')
  const refs = related.safeParse(a?.related).data
  let secondary: Assignment[] = []
  if (!refs || new Set(refs).size !== refs.length || refs.some(ref => ref === primary.ref || !findAssignment(cut, ref))) {
    issues.push('RELATED_REJECTED')
  } else {
    secondary = refs.map(ref => findAssignment(cut, ref)!)
  }
  const mode = intent.safeParse(meta?.intent).data ?? null
  if (!mode) issues.push('INTENT_UNRESOLVED')
  const operations = splitOperations(meta?.operations, cut, issues)
  return { answer: frame.answer, user: u.assignment, assistant: primary.assignment, related: secondary, intent: mode,
    newGoal: u.goal ?? null, assistantGoal: primary.goal ?? null, operations, issues }
}
