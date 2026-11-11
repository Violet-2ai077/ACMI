import type { UnderstandingContextInput, UnderstandingContextPackage, UnderstandingCut, UnderstandingSpan } from '@acmi/contracts'
import { freeze } from './canonical.ts'
import { buildLayeredContext, validUnderstandingCut } from './layered-context.ts'
import type { LayeredContextAccess } from './layered-context.ts'

/** A trusted Host observation of an explicit user choice, not a model hypothesis or a Binding. */
export interface ConfirmedTaskPredecessor {
  readonly kind: 'explicit_user_selection'
  readonly cut: UnderstandingCut
  readonly eventId: string
  readonly taskId: string
  readonly taskRevision: number
}

export interface TaskReferenceAdviceInput {
  readonly enabled?: boolean
  readonly context: UnderstandingContextInput
  /** Host attestation that the authorized name namespace is complete at this cut. */
  readonly catalogComplete?: boolean
  readonly prior?: ConfirmedTaskPredecessor
}

export interface TaskReferenceAdviceAccess extends LayeredContextAccess {
  readonly permitsTask: NonNullable<LayeredContextAccess['permitsTask']>
  readonly readCurrentCut: () => UnderstandingCut | null
}

type AdviceIdentity = {
  readonly taskId: string
  readonly taskRevision: number
  readonly packetDigest: string
  readonly source: { readonly turnId: string; readonly turnDigest: string; readonly span: UnderstandingSpan }
}
export type TaskReferenceAdvice =
  | { readonly status: 'disabled' | 'no_suggestion' }
  | { readonly status: 'unavailable'; readonly reason: 'snapshot_unavailable' }
  | { readonly status: 'clarify'; readonly reason: 'incomplete_catalog' | 'ambiguous_reference' | 'reference_unresolved' | 'historical_not_actionable' }
  | (AdviceIdentity & (
    | { readonly status: 'suggest_active' | 'reference_history'; readonly basis: 'explicit_name' | 'explicit_id' }
    | { readonly status: 'suggest_active'; readonly basis: 'confirmed_predecessor'; readonly priorEventId: string;
      readonly predecessorDigest: string }))

const cutKeys = ['workspaceId', 'sessionId', 'incarnation', 'cursor', 'authorizationEpoch', 'bindingRevision',
  'graphRevision', 'sourceRevision', 'candidateRevision', 'policyVersion'] as const satisfies readonly (keyof UnderstandingCut)[]
const sameCut = (a: UnderstandingCut | null, b: UnderstandingCut): boolean =>
  Boolean(a && validUnderstandingCut(a) && cutKeys.every(k => a[k] === b[k]))
const idPattern = /^[\p{L}\p{N}_.:@-]{1,128}$/u
const normalizeName = (value: string): string => value.normalize('NFC').toLowerCase()
const excluded = /[\r\n"“”‘’「」『』`；;？！!?]/u
const confirmedPhrase = /^(?:the one i just confirmed|the task i just confirmed|我刚确认的那个任务|我刚选的任务)$/iu
const vaguePhrase = /^(?:it|that(?: one| task)?|the other(?: one| task)?|the (?:last|previous) task|那个(?:任务)?|之前那个(?:任务)?|刚才那个(?:任务)?)$/iu
const readPattern = /^(?:look up\s+|查一下\s*|查阅\s*|查看\s*)(.+)$/iu
const selectionPattern = /^(?:(?:switch to|go back to|return to|continue|resume)\s+|切到\s*|切回\s*|回到\s*|继续\s*)(.+)$/iu

function command(text: string): { mode: 'lookup' | 'selection'; anchor: string; span: UnderstandingSpan } | undefined {
  const trimmed = text.trim()
  const body = trimmed.replace(/[.。]$/u, '').trimEnd()
  if (!body || excluded.test(body) || body.includes("'")) return undefined
  for (const [mode, pattern] of [['lookup', readPattern], ['selection', selectionPattern]] as const) {
    const match = pattern.exec(body)
    const anchor = match?.[1]
    if (!anchor || anchor !== anchor.trim()) continue
    const leading = text.length - text.trimStart().length
    return { mode, anchor, span: { start: leading + body.length - anchor.length, end: leading + body.length } }
  }
  return undefined
}

function advice(packet: UnderstandingContextPackage, input: TaskReferenceAdviceInput,
  sha256: TaskReferenceAdviceAccess['sha256']): TaskReferenceAdvice {
  const parsed = command(packet.current.text)
  if (!parsed) return { status: 'no_suggestion' }
  const unresolved = { status: 'clarify', reason: 'reference_unresolved' } as const
  const { anchor, span, mode } = parsed
  const source = { turnId: packet.current.id, turnDigest: packet.current.digest, span }
  if (vaguePhrase.test(anchor)) return unresolved
  if (confirmedPhrase.test(anchor)) {
    const p = input.prior
    if (mode !== 'selection' || !p || p.kind !== 'explicit_user_selection' || typeof p.eventId !== 'string' || !idPattern.test(p.eventId)
      || p.eventId === packet.current.id || !sameCut(p.cut, { ...packet.cut, cursor: packet.cut.cursor - 1 })) return unresolved
    const row = packet.active.find(x => x.taskId === p.taskId && x.revision === p.taskRevision)
    if (!row) return unresolved
    const predecessorDigest = sha256(JSON.stringify([packet.digest, p.kind, p.cut.cursor, p.eventId, row.taskId, row.revision]))
    if (!/^[a-f0-9]{64}$/u.test(predecessorDigest)) return unresolved
    return { status: 'suggest_active', basis: 'confirmed_predecessor', taskId: row.taskId, taskRevision: row.revision,
      priorEventId: p.eventId, predecessorDigest, source, packetDigest: packet.digest }
  }
  const all = [...packet.active, ...packet.historical]
  const explicitId = anchor.slice(0, 5).toLowerCase() === 'task:' ? anchor.slice(5) : undefined
  if (explicitId === undefined && (input.catalogComplete !== true || (input.context.candidates?.length ?? 0) > 512
    || packet.omissions.some(o => o.section === 'active' || o.section === 'historical'))) {
    return { status: 'clarify', reason: 'incomplete_catalog' }
  }
  const normalized = normalizeName(anchor)
  const matches = all.filter(c => explicitId !== undefined ? c.taskId === explicitId
    : [c.objective, ...(c.aliases ?? [])].some(alias => normalizeName(alias) === normalized))
  if (matches.length > 1) return { status: 'clarify', reason: 'ambiguous_reference' }
  const row = matches[0]
  if (!row) return unresolved
  if (mode === 'lookup' && row.bindable) return { status: 'no_suggestion' }
  if (mode === 'selection' && !row.bindable) return { status: 'clarify', reason: 'historical_not_actionable' }
  return { status: row.bindable ? 'suggest_active' : 'reference_history',
    basis: explicitId !== undefined ? 'explicit_id' : 'explicit_name', taskId: row.taskId, taskRevision: row.revision,
    source, packetDigest: packet.digest }
}

/** Bounded read-only advice. Do not pass an untrusted packet or wire this result to a writer. */
export function adviseTaskReference(input: TaskReferenceAdviceInput, access: TaskReferenceAdviceAccess): TaskReferenceAdvice {
  if (input.enabled !== true) return { status: 'disabled' }
  const unavailable = { status: 'unavailable', reason: 'snapshot_unavailable' } as const
  try {
    if (typeof access.permitsTask !== 'function' || !sameCut(access.readCurrentCut(), input.context.cut)) return unavailable
    const built = buildLayeredContext(input.context, access)
    if (built.status !== 'ready') return unavailable
    const { packet } = built
    const result = packet.current.actor === 'user' && packet.current.kind === 'message'
      ? advice(packet, input, access.sha256) : { status: 'no_suggestion' } as const
    if (!sameCut(access.readCurrentCut(), packet.cut) || !access.authority.permits(access.scope, packet.cut.workspaceId)
      || ('taskId' in result && !access.permitsTask(access.scope, result.taskId))) return unavailable
    return freeze(result)
  } catch { return unavailable }
}
