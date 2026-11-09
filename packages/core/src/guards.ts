import { features } from '@acmi/contracts'
import type {
  AttributionProposal, CausalReference, EventRef, Negotiation, Offer, ProposalGuardInput,
  RuntimeSessionRef, ScopeAuthority, ToolCall, ToolResult, WorkspaceScope,
} from '@acmi/contracts'

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function natural(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

const token = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 512
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
export const isTaskId = (value: unknown): value is string => typeof value === 'string' && uuid.test(value)

export function isEventRef(value: unknown): value is EventRef {
  if (!record(value) || !record(value.session)) return false
  const { session } = value
  return token(session.adapterId) && token(session.instanceId) && token(session.sessionId) && token(session.incarnation)
    && token(value.sourceRevision) && natural(value.localSeq)
}

export function sessionKey(value: RuntimeSessionRef): string {
  return JSON.stringify([value.adapterId, value.instanceId, value.sessionId, value.incarnation])
}

export function cleanRef(value: EventRef): EventRef {
  const { adapterId, instanceId, sessionId, incarnation } = value.session
  return Object.freeze({
    session: Object.freeze({ adapterId, instanceId, sessionId, incarnation }),
    sourceRevision: value.sourceRevision,
    localSeq: value.localSeq,
  })
}

export function sameRef(left: EventRef, right: unknown): boolean {
  return isEventRef(right) && sessionKey(left.session) === sessionKey(right.session)
    && left.sourceRevision === right.sourceRevision && left.localSeq === right.localSeq
}

export function createScopeAuthority(): ScopeAuthority {
  const grants = new WeakMap<object, string>()
  return {
    grant(workspaceId) {
      if (!token(workspaceId)) throw new Error('Invalid workspace identity')
      const grant = Object.freeze({}) as WorkspaceScope
      grants.set(grant, workspaceId)
      return grant
    },
    revoke(grant) { grants.delete(grant) },
    permits(grant, workspaceId) {
      return typeof grant === 'object' && grant !== null && grants.get(grant) === workspaceId
    },
  }
}

export function authorizeScope(authority: Pick<ScopeAuthority, 'permits'>, scope: unknown, workspaceId: string): boolean {
  return authority.permits(scope, workspaceId)
}

function names(value: unknown): value is readonly string[] {
  if (!Array.isArray(value) || value.length > 32) return false
  const entries: readonly unknown[] = [...value]
  return entries.every(name => typeof name === 'string' && /^[a-z0-9-]{1,64}$/u.test(name))
    && new Set(entries).size === entries.length
}

function offer(value: unknown): value is Offer {
  return record(value) && natural(value.major) && natural(value.minor) && names(value.offered) && names(value.required)
}

export function negotiate(local: Offer, remote: unknown): Negotiation {
  if (!offer(local) || !offer(remote) || local.major !== 0 || remote.major !== local.major) {
    return { ok: false, code: 'unsupported-protocol' }
  }
  const enabled = features.filter(feature => local.offered.includes(feature) && remote.offered.includes(feature))
  const enabledNames = new Set<string>(enabled)
  if ([...local.required, ...remote.required].some(name => !enabledNames.has(name))) {
    return { ok: false, code: 'missing-capability' }
  }
  return { ok: true, major: local.major, minor: Math.min(local.minor, remote.minor), enabled }
}

export function resolveToolResult(result: ToolResult, call: ToolCall): CausalReference | null {
  if (!isEventRef(call.ref) || !isEventRef(result.ref) || !sameRef(call.ref, result.originalCall)
    || sessionKey(call.ref.session) !== sessionKey(result.ref.session) || call.ref.sourceRevision !== result.ref.sourceRevision
    || call.ref.localSeq >= result.ref.localSeq || !token(call.turnId) || call.turnId !== result.turnId
    || !token(call.stepId) || call.stepId !== result.stepId || !token(call.toolCallId) || call.toolCallId !== result.toolCallId) return null
  return { kind: 'tool-result-of', call: cleanRef(call.ref) }
}

export function validateProposal(input: ProposalGuardInput, raw: unknown): AttributionProposal {
  const reject: AttributionProposal = { action: 'uncertain', reasonCode: 'invalid-proposal', evidenceRefs: [], policyVersion: input.policyVersion }
  if (!record(raw) || Object.keys(raw).some(key => !['action', 'candidateTaskId', 'reasonCode', 'evidenceRefs'].includes(key))
    || typeof raw.reasonCode !== 'string' || !/^[a-z0-9-]{1,64}$/u.test(raw.reasonCode)
    || !Array.isArray(raw.evidenceRefs) || raw.evidenceRefs.length > 16) return reject
  const evidenceRefs: EventRef[] = []
  for (const requested of raw.evidenceRefs as readonly unknown[]) {
    const match = input.evidenceRefs.find(ref => sameRef(ref, requested))
    if (match === undefined) return reject
    evidenceRefs.push(cleanRef(match))
  }
  const base = { reasonCode: raw.reasonCode, evidenceRefs, policyVersion: input.policyVersion }
  if (raw.action === 'continue_current' || raw.action === 'switch_existing') {
    const id = raw.candidateTaskId
    const rows = input.candidates.filter(task => task.taskId === id)
    const task = rows[0]
    if (!isTaskId(id) || (raw.action === 'continue_current') !== (input.currentTaskId === id)
      || evidenceRefs.length === 0 || rows.length !== 1 || task?.status !== 'open'
      || !authorizeScope(input.authority, input.scope, task.workspaceId)) return reject
    return { ...base, action: raw.action, candidateTaskId: id }
  }
  if (raw.candidateTaskId !== undefined) return reject
  if (raw.action === 'create_new' || raw.action === 'no_task' || raw.action === 'uncertain') return { ...base, action: raw.action }
  return reject
}
