import { z } from 'zod'

export interface Assignment {
  readonly taskId: string
  readonly workId: string | null
}

export interface AssignmentCut {
  readonly links: Readonly<Record<string, Assignment>>
  readonly toolAvailable: boolean
}

const top = z.strictObject({ answer: z.string().min(1).max(512), tag: z.unknown().optional() })
const shape = z.strictObject({ user_turn: z.unknown().optional(), assistant: z.unknown().optional(),
  basis: z.unknown().optional(), operations: z.unknown().optional(), new_goal: z.unknown().optional() })
const reason = z.enum(['explicit', 'continuation', 'ambiguous', 'social', 'new_goal'])
const operation = z.strictObject({ ref: z.enum(['a1', 'a2']), key: z.enum(['amber', 'indigo']), assignment: z.string() })
const special = z.enum(['unresolved', 'no_task', 'new_task_proposal'])
const goal = z.string().trim().min(1).max(160)
const privateForm = /\b(?:q-[0-9a-f]{5}|assignment[_ -]ref|user[_ -]turn|generation[_ -]ref|new[_ -]task[_ -]proposal|acmi[_ -]attribution)\b|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/iu

export function safeAssignmentText(text: string, cut: AssignmentCut) {
  const clean = text.normalize('NFKC').toLowerCase()
  return Boolean(clean.trim()) && !privateForm.test(clean)
    && !/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(clean)
    && !Object.entries(cut.links).some(([ref, ids]) =>
      [ref, ids.taskId, ids.workId].some(s => s && clean.includes(s.toLowerCase())))
}

export function readAssignmentFrame(raw: string, stop: string) {
  if (stop !== 'eos' && stop !== 'word') throw new Error('TRUNCATED')
  if (Buffer.byteLength(raw) > 8192) throw new Error('FRAME_TOO_LARGE')
  try {
    const parsed: unknown = JSON.parse(raw)
    // Keep quoted whitespace; non-canonical escapes and duplicate keys are ambiguous boundaries.
    const compact = raw.replace(/"(?:[^"\\]|\\[\s\S])*"|[\t\r\n ]+/gu, s => s.startsWith('"') ? s : '')
    if (JSON.stringify(parsed) !== compact) throw new Error('non-canonical')
    const frame = top.parse(parsed)
    return frame
  } catch {
    throw new Error('INVALID_FRAME')
  }
}

export function findAssignment(cut: AssignmentCut, ref: unknown) {
  return typeof ref === 'string' && Object.hasOwn(cut.links, ref) ? cut.links[ref] : undefined
}

export function splitOperations(value: unknown, cut: AssignmentCut, issues: string[]) {
  if (value === undefined && !cut.toolAvailable) return []
  const actions = z.array(operation).max(2).safeParse(value)
  if (!cut.toolAvailable || !actions.success
    || new Set(actions.data.map(a => a.ref)).size !== actions.data.length
    || new Set(actions.data.map(a => a.key)).size !== actions.data.length
    || actions.data.some(a => !findAssignment(cut, a.assignment))) {
    issues.push('ACTION_REJECTED')
    return []
  }
  return actions.data.map(a => ({ ref: a.ref, key: a.key, assignment: findAssignment(cut, a.assignment)! }))
}

export function splitAssignment(raw: string, stop: string, cut: AssignmentCut) {
  const frame = readAssignmentFrame(raw, stop)
  if (!safeAssignmentText(frame.answer, cut)) throw new Error('UNSAFE_ANSWER')
  const issues: string[] = []
  const parsed = shape.safeParse(frame.tag)
  const metadata = parsed.success ? parsed.data : undefined
  if (!metadata) issues.push('INVALID_SIDECAR')
  const needsGoal = metadata?.user_turn === 'new_task_proposal' || metadata?.assistant === 'new_task_proposal'
  const g = goal.safeParse(metadata?.new_goal)
  const newGoal = needsGoal && g.success && safeAssignmentText(g.data, cut) ? g.data : null
  if (needsGoal ? !newGoal : metadata?.new_goal !== undefined) issues.push('NEW_GOAL_REJECTED')
  const select = (value: unknown, field: string) => {
    const match = findAssignment(cut, value)
    if (match) return match
    const s = special.safeParse(value)
    if (s.success && (s.data !== 'new_task_proposal' || newGoal)) return s.data
    issues.push(field + '_UNRESOLVED')
    return 'unresolved' as const
  }
  const user = select(metadata?.user_turn, 'USER')
  const assistant = select(metadata?.assistant, 'ASSISTANT')
  const rationale = reason.safeParse(metadata?.basis)
  if (metadata && !rationale.success) issues.push('BASIS_UNRESOLVED')

  const operations = splitOperations(metadata?.operations, cut, issues)
  return { answer: frame.answer, user, assistant, basis: rationale.data ?? null, newGoal, operations, issues }
}
