import type { AdapterCapabilities, EventRef, NormalizedRuntimeEvent, Offer, RuntimeSessionRef } from '@acmi/contracts'

export type { AdapterCapabilities } from '@acmi/contracts'

const capabilityFields = [
  'sessionEvents', 'messageEvents', 'toolCallEvents', 'causalToolResults', 'subagentEvents',
  'persistentHistory', 'contextInjection', 'taskBindingHooks', 'eventReplay', 'stableSessionIdentity',
] as const

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function only(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key))
}

function id(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256 && value === value.trim()
    && !/[\x00-\x1f\x7f]/.test(value)
}

/** Validate the versioned profile before negotiating its read-only wire capabilities. */
export function parseAdapterCapabilities(value: unknown): AdapterCapabilities | null {
  if (!record(value) || !only(value, ['schemaVersion', 'adapterId', 'adapterVersion', 'runtimeVersion', ...capabilityFields])
    || value.schemaVersion !== 1 || !id(value.adapterId) || !id(value.adapterVersion) || !id(value.runtimeVersion)
    || !capabilityFields.every(key => Object.hasOwn(value, key) && typeof value[key] === 'boolean')
    || value.contextInjection === true || value.taskBindingHooks === true
    || (value.causalToolResults === true && value.toolCallEvents !== true)
    || (value.persistentHistory === true && (value.eventReplay !== true || value.stableSessionIdentity !== true))) return null
  return {
    schemaVersion: 1,
    adapterId: value.adapterId, adapterVersion: value.adapterVersion, runtimeVersion: value.runtimeVersion,
    sessionEvents: value.sessionEvents === true, messageEvents: value.messageEvents === true,
    toolCallEvents: value.toolCallEvents === true, causalToolResults: value.causalToolResults === true,
    subagentEvents: value.subagentEvents === true, persistentHistory: value.persistentHistory === true,
    contextInjection: false, taskBindingHooks: false, eventReplay: value.eventReplay === true,
    stableSessionIdentity: value.stableSessionIdentity === true,
  }
}

/** Storage offers are negotiated separately; a Harness offer cannot claim storage reads. */
export function capabilityOffer(input: AdapterCapabilities): Offer {
  const capabilities = parseAdapterCapabilities(input)
  if (capabilities === null) throw new TypeError('Invalid ACMI adapter capability profile')
  const offered: string[] = []
  if (capabilities.sessionEvents || capabilities.messageEvents || capabilities.toolCallEvents || capabilities.subagentEvents) {
    offered.push('observe-session')
  }
  if (capabilities.causalToolResults) offered.push('causal-tool-pair')
  return { major: 0, minor: 1, offered, required: [] }
}

export function parseRuntimeSessionRef(value: unknown): RuntimeSessionRef | null {
  if (!record(value) || !only(value, ['adapterId', 'instanceId', 'sessionId', 'incarnation'])
    || !id(value.adapterId) || !id(value.instanceId) || !id(value.sessionId) || !id(value.incarnation)) return null
  return { adapterId: value.adapterId, instanceId: value.instanceId, sessionId: value.sessionId, incarnation: value.incarnation }
}

export function parseEventRef(value: unknown): EventRef | null {
  if (!record(value) || !only(value, ['session', 'sourceRevision', 'localSeq']) || !id(value.sourceRevision)
    || typeof value.localSeq !== 'number' || !Number.isSafeInteger(value.localSeq) || value.localSeq < 0) return null
  const session = parseRuntimeSessionRef(value.session)
  return session === null ? null : { session, sourceRevision: value.sourceRevision, localSeq: value.localSeq }
}

/** Validate metadata only. Extract known fields from the source envelope before calling this. */
export function parseNormalizedEvent(value: unknown): NormalizedRuntimeEvent | null {
  if (!record(value)) return null
  const ref = parseEventRef(value.ref)
  if (ref === null) return null
  const { kind, turnId, stepId, agentId, toolCallId } = value
  if (kind === 'tool-call' || kind === 'tool-result') {
    const keys = ['kind', 'ref', 'turnId', 'stepId', 'toolCallId']
    if (kind === 'tool-result') keys.push('originalCall')
    if (!only(value, keys) || !id(turnId) || !id(stepId) || !id(toolCallId)) return null
    if (kind === 'tool-call') return { kind, ref, turnId, stepId, toolCallId }
    const originalCall = parseEventRef(value.originalCall)
    if (originalCall === null && value.originalCall !== null) return null
    return { kind, ref, turnId, stepId, toolCallId, originalCall }
  }
  switch (kind) {
    case 'user': case 'assistant': case 'turn-open': case 'turn-complete': case 'turn-interrupted':
    case 'step-open': case 'step-close': case 'session-open': case 'session-close': case 'agent-open': case 'agent-close':
      if (!only(value, ['kind', 'ref', 'turnId', 'stepId', 'agentId'])
        || (turnId !== undefined && !id(turnId)) || (stepId !== undefined && !id(stepId))
        || (agentId !== undefined && !id(agentId))
        || ((kind === 'agent-open' || kind === 'agent-close') && agentId === undefined)) return null
      return { kind, ref, ...(turnId === undefined ? {} : { turnId }), ...(stepId === undefined ? {} : { stepId }),
        ...(agentId === undefined ? {} : { agentId }) }
    default:
      return null
  }
}
