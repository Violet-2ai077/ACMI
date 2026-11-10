import type { RuntimeFact, RuntimeFactDetail, RuntimeSessionRef } from '@acmi/contracts'
import { runtimeFactId, validateRuntimeFact } from '@acmi/core'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-subagent'
import { dshSessionRef, DSH_VERSION } from './harness.ts'
import { nextBinding } from './records.ts'
import { continuityDigest } from './local-digest.ts'

export const runtimeFactAdapterVersion = '0.8.1'
export const lifecycleFactAdapterVersion = '0.8.2'
export const dshRuntimeIdentity = (header: SessionHeader, workspaceId: string): RuntimeSessionRef => dshSessionRef(header, workspaceId)

/** Pure projection of one native log row. One sequence position is preserved even for ignored payloads. */
export function normalizeDshRuntimeFact(
  header: SessionHeader, event: SessionEvent, workspaceId: string, bindingRevision: number, legacy = false,
): RuntimeFact {
  const session = dshRuntimeIdentity(header, workspaceId)
  const binding = nextBinding(event, header.id, bindingRevision)
  let detail: RuntimeFactDetail = { kind: 'unmapped' }
  if (binding) detail = { kind: 'binding', taskId: binding.taskId, revision: binding.revision }
  else switch (event.type) {
    case 'session/end-seed':
      detail = { kind: 'session-seed-boundary', ...(header.origin === 'subagent' && header.parentSession
        ? { parentSessionId: header.parentSession } : {}) }
      break
    case 'subagent/catalog': {
      const data = event.data
      if (!legacy && Number.isSafeInteger(data?.childCreatedAt) && typeof data.childId === 'string') {
        detail = { kind: 'subagent-catalog', nativeVersion: data.version, childId: data.childId,
          childIncarnation: String(data.childCreatedAt), mode: data.mode }
      }
      break
    }
    case 'subagent/descriptor':
      if (!legacy && header.origin === 'subagent' && header.parentSession && event.data?.version === 3) {
        detail = { kind: 'subagent-descriptor', nativeVersion: 3, mode: event.data.mode, parentSessionId: header.parentSession }
      }
      break
    case 'turn/start':
      detail = { kind: 'turn-open', turn: String(event.data.turn) }
      break
    case 'turn/end':
      detail = { kind: event.data.reason.kind === 'completed' ? 'turn-complete'
        : event.data.reason.kind === 'error' ? 'turn-failed' : 'turn-interrupted', turn: String(event.data.turn) }
      break
    case 'step/start': case 'step/end': case 'assistant/message':
      if (event.type !== 'assistant/message' || event.surfaceOp === 'append') {
        detail = { kind: event.type === 'step/start' ? 'step-open' : event.type === 'step/end' ? 'step-close' : 'assistant',
          turn: String(event.data.turn), step: String(event.data.step) }
      }
      break
    case 'user/message':
      if (String(event.data.source.kind) === 'runtime-context') detail = { kind: 'runtime-context' }
      else if (event.surfaceOp === 'append' && event.data.source.kind === 'user') detail = { kind: 'user' }
      break
    case 'tool/call':
      detail = { kind: 'tool-call', turn: String(event.data.turn), step: String(event.data.step), callId: event.data.callId }
      break
    case 'tool/result': {
      if (event.surfaceOp !== 'append') break
      const callSeq = event.sourceEventSeqs?.length === 1 ? event.sourceEventSeqs[0] : undefined
      detail = { kind: 'tool-result', turn: String(event.data.turn), step: String(event.data.step),
        callId: event.data.message.toolCallId, ...(callSeq !== undefined && callSeq < event.seq ? { callSeq } : {}) }
      break
    }
    default:
      if (String(event.type) === 'compaction/start') detail = { kind: 'compact-start' }
      else if (String(event.type) === 'compaction/summary') detail = { kind: 'compact-summary' }
      else if (String(event.type) === 'compaction/end') detail = { kind: 'compact-end' }
  }
  const fact: RuntimeFact = {
    version: 'runtime-fact-v1', workspaceId, runtimeVersion: DSH_VERSION,
    adapterVersion: detail.kind === 'subagent-catalog' || detail.kind === 'subagent-descriptor'
      ? lifecycleFactAdapterVersion : runtimeFactAdapterVersion,
    eventId: runtimeFactId(session, event.seq, continuityDigest), provenance: 'runtime_observed', detail,
    source: { session, localSeq: event.seq, sourceRevision: continuityDigest(JSON.stringify(['dsh-epoch-v1', session])) },
  }
  if (!validateRuntimeFact(fact, workspaceId, continuityDigest)) throw new Error('invalid runtime fact')
  return fact
}
