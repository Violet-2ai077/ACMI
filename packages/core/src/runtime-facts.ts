import type { Digest, RuntimeFact, RuntimeSessionRef } from '@acmi/contracts'
import { isEventRef, isTaskId, natural } from './guards.ts'

export const runtimeIdentity = (session: RuntimeSessionRef): string =>
  JSON.stringify([session.adapterId, session.instanceId, session.sessionId, session.incarnation])
export const runtimeFactId = (session: RuntimeSessionRef, seq: number, digest: Digest): string =>
  digest(JSON.stringify([session.adapterId, session.instanceId, session.sessionId, session.incarnation, seq]))
export const boundedText = (value: unknown, limit = 256): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= limit && !/[\x00-\x1f\x7f]/u.test(value)
export const exactFields = (raw: unknown, fields: readonly string[]): raw is Record<string, unknown> =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    && [Object.prototype, null].includes(Object.getPrototypeOf(raw))
    && Object.keys(raw).every(k => fields.includes(k))

export function validateRuntimeFact(input: unknown, workspaceId: string, digest: Digest): input is RuntimeFact {
  if (!exactFields(input, ['version', 'eventId', 'workspaceId', 'source', 'runtimeVersion', 'adapterVersion', 'provenance', 'detail'])
    || input.version !== 'runtime-fact-v1' || input.provenance !== 'runtime_observed' || input.workspaceId !== workspaceId
    || !boundedText(input.runtimeVersion) || !boundedText(input.adapterVersion)
    || !isEventRef(input.source) || !exactFields(input.source, ['session', 'sourceRevision', 'localSeq'])
    || !exactFields(input.source.session, ['adapterId', 'instanceId', 'sessionId', 'incarnation'])
    || input.eventId !== runtimeFactId(input.source.session, input.source.localSeq, digest)) return false
  const d = input.detail
  if (!exactFields(d, ['kind', 'taskId', 'revision', 'turn', 'step', 'callId', 'callSeq', 'parentSessionId',
    'nativeVersion', 'childId', 'childIncarnation', 'mode'])) return false
  switch (d.kind) {
    case 'binding':
      return exactFields(d, ['kind', 'taskId', 'revision']) && isTaskId(d.taskId) && natural(d.revision) && d.revision > 0
    case 'session-seed-boundary':
      return exactFields(d, ['kind', 'parentSessionId']) && (d.parentSessionId === undefined || boundedText(d.parentSessionId))
    case 'subagent-catalog':
      return exactFields(d, ['kind', 'nativeVersion', 'childId', 'childIncarnation', 'mode'])
        && boundedText(d.childId) && typeof d.childIncarnation === 'string' && /^(?:0|[1-9][0-9]{0,15})$/u.test(d.childIncarnation)
        && natural(Number(d.childIncarnation))
        && (d.nativeVersion === 0 && (d.mode === 'continuable' || d.mode === 'one-shot')
          || d.nativeVersion === 1 && (d.mode === 'continuable' || d.mode === 'one-shot' || d.mode === 'unknown')
          || d.nativeVersion === 2 && d.mode === 'external'
          || d.nativeVersion === 3 && (d.mode === 'continuable' || d.mode === 'external'))
    case 'subagent-descriptor':
      return exactFields(d, ['kind', 'nativeVersion', 'mode', 'parentSessionId'])
        && d.nativeVersion === 3 && (d.mode === 'continuable' || d.mode === 'one-shot') && boundedText(d.parentSessionId)
    case 'turn-open': case 'turn-complete': case 'turn-failed': case 'turn-interrupted':
      return exactFields(d, ['kind', 'turn']) && boundedText(d.turn)
    case 'assistant': case 'step-open': case 'step-close':
      return exactFields(d, ['kind', 'turn', 'step']) && boundedText(d.turn) && boundedText(d.step)
    case 'tool-call': case 'tool-result':
      return exactFields(d, d.kind === 'tool-call' ? ['kind', 'turn', 'step', 'callId'] : ['kind', 'turn', 'step', 'callId', 'callSeq'])
        && boundedText(d.turn) && boundedText(d.step) && boundedText(d.callId)
        && (d.callSeq === undefined || (natural(d.callSeq) && d.callSeq < input.source.localSeq))
    case 'session-end': case 'user': case 'runtime-context': case 'compact-start': case 'compact-summary': case 'compact-end': case 'unmapped':
      return exactFields(d, ['kind'])
    default: return false
  }
}
