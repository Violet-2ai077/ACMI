import type {
  AdapterCapabilities, Cancellation, EventRef, HarnessAdapter, NormalizedRuntimeEvent,
  ProjectionInput, RuntimeSessionRef, ScopeAuthority, ToolCall, WorkspaceScope,
} from '@acmi/contracts'
import { authorizeScope, resolveToolResult } from '@acmi/core'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session'
import { nextBinding } from './records.ts'
import type { DshJournal } from './scoped-read.ts'

export const DSH_VERSION = '0.2.2-rc.1'
export const DSH_ADAPTER_VERSION = '0.1.0-alpha.1'

export const dshCapabilities: AdapterCapabilities = Object.freeze({
  schemaVersion: 1, adapterId: 'dsh', adapterVersion: DSH_ADAPTER_VERSION, runtimeVersion: DSH_VERSION,
  sessionEvents: false, messageEvents: true, toolCallEvents: true, causalToolResults: true,
  subagentEvents: false, persistentHistory: false, contextInjection: false, taskBindingHooks: false,
  eventReplay: true, stableSessionIdentity: true,
})
export const dshJournalCapabilities: AdapterCapabilities = Object.freeze({ ...dshCapabilities, persistentHistory: true })

export function journalSourceRevision(partitionId: string, revision: string): string {
  return createHash('sha256').update(JSON.stringify([partitionId, revision])).digest('hex')
}

export interface DshSessionCut {
  readonly header: SessionHeader
  readonly events: readonly SessionEvent[]
  readonly inheritedEventCount: number
  readonly sourceRevision: string
}

export function dshSessionRef(header: Pick<SessionHeader, 'id' | 'createdAt'>, instanceId: string): RuntimeSessionRef {
  return Object.freeze({
    adapterId: dshCapabilities.adapterId, instanceId, sessionId: header.id, incarnation: String(header.createdAt),
  })
}

function sameSession(left: RuntimeSessionRef, right: RuntimeSessionRef): boolean {
  return left.adapterId === right.adapterId && left.instanceId === right.instanceId
    && left.sessionId === right.sessionId && left.incarnation === right.incarnation
}

function nat(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Normalize one authorized native cut. Delimiters, inherited rows and raw content stay inside this adapter. */
export function normalizeDshCut(cut: DshSessionCut, instanceId: string): readonly ProjectionInput[] {
  if (!nat(cut.inheritedEventCount) || cut.inheritedEventCount > cut.events.length || !nat(cut.header.createdAt)
    || !cut.header.id || !instanceId || !cut.sourceRevision) throw new Error('ACMI_DSH_INVALID_CUT')
  const session = dshSessionRef(cut.header, instanceId)
  const normalized: ProjectionInput[] = []
  const calls = new Map<number, ToolCall>()
  let previousSeq = -1
  let bindingRevision = 0
  let currentTurn: string | undefined
  for (const event of cut.events) {
    if (!nat(event.seq) || event.seq !== previousSeq + 1) throw new Error('ACMI_DSH_INVALID_SEQUENCE')
    previousSeq = event.seq
    if (event.seq < cut.inheritedEventCount) continue
    const ref: EventRef = Object.freeze({ session, sourceRevision: cut.sourceRevision, localSeq: event.seq })
    switch (event.type) {
      case 'turn/start':
        if (!nat(event.data.turn)) throw new Error('ACMI_DSH_INVALID_TURN')
        currentTurn = String(event.data.turn)
        normalized.push({ kind: 'turn-open', ref, turnId: currentTurn })
        break
      case 'turn/end': {
        if (!nat(event.data.turn)) throw new Error('ACMI_DSH_INVALID_TURN')
        const turnId = String(event.data.turn)
        normalized.push({ kind: event.data.reason.kind === 'completed' ? 'turn-complete' : 'turn-interrupted', ref, turnId })
        if (currentTurn === turnId) currentTurn = undefined
        break
      }
      case 'step/start':
      case 'step/end':
      case 'assistant/message': {
        if (event.type === 'assistant/message' && event.surfaceOp !== 'append') break
        if (!nat(event.data.turn) || !nat(event.data.step)) throw new Error('ACMI_DSH_INVALID_STEP')
        const kind = event.type === 'step/start' ? 'step-open' : event.type === 'step/end' ? 'step-close' : 'assistant'
        normalized.push({ kind, ref, turnId: String(event.data.turn), stepId: String(event.data.step) })
        break
      }
      case 'user/message':
        if (event.surfaceOp === 'append' && event.data.source.kind === 'user') {
          normalized.push({ kind: 'user', ref, ...(currentTurn === undefined ? {} : { turnId: currentTurn }) })
        }
        break
      case 'tool/call': {
        if (!nat(event.data.turn) || !nat(event.data.step) || !event.data.callId) throw new Error('ACMI_DSH_INVALID_CALL')
        const call: ToolCall = {
          kind: 'tool-call', ref, turnId: String(event.data.turn), stepId: String(event.data.step), toolCallId: event.data.callId,
        }
        calls.set(event.seq, call)
        normalized.push(call)
        break
      }
      case 'tool/result': {
        if (event.surfaceOp !== 'append') break
        const { turn, step, message } = event.data
        if (!nat(turn) || !nat(step) || !message.toolCallId) throw new Error('ACMI_DSH_INVALID_RESULT')
        const candidateSeq = event.sourceEventSeqs?.length === 1 ? event.sourceEventSeqs[0] : undefined
        const call = candidateSeq === undefined ? undefined : calls.get(candidateSeq)
        const result = {
          kind: 'tool-result' as const, ref, turnId: String(turn), stepId: String(step),
          toolCallId: message.toolCallId, originalCall: call?.ref ?? null,
        }
        const causal = call !== undefined && resolveToolResult(result, call) !== null
        if (causal) calls.delete(call.ref.localSeq)
        normalized.push({ ...result, originalCall: causal ? result.originalCall : null })
        break
      }
      default: {
        const binding = nextBinding(event, cut.header.id, bindingRevision)
        if (binding === undefined) break
        bindingRevision = binding.revision
        normalized.push({ kind: 'bind', ref, taskId: binding.taskId, ...(currentTurn === undefined ? {} : { turnId: currentTurn }) })
      }
    }
  }
  return normalized
}

export interface DshHarnessSource {
  readonly authority: Pick<ScopeAuthority, 'permits'>
  readonly workspaceId: string
  readonly instanceId: string
  /** Trusted composition only. This callback is invoked after scope and runtime identity checks. */
  read(session: RuntimeSessionRef, cancel: Cancellation): Promise<DshSessionCut | undefined>
}

export function createDshHarnessAdapter(source: DshHarnessSource): HarnessAdapter {
  let tail = Promise.resolve()
  function permitted(scope: WorkspaceScope, cancel: Cancellation): boolean {
    return !cancel.cancelled && authorizeScope(source.authority, scope, source.workspaceId)
  }
  async function* observeSession(session: RuntimeSessionRef, scope: WorkspaceScope, cancel: Cancellation) {
    if (!permitted(scope, cancel) || session.adapterId !== dshCapabilities.adapterId || session.instanceId !== source.instanceId) return
    // The guarded native reader admits only one decoder at a time.
    const reading = tail.then(() => permitted(scope, cancel) ? source.read(session, cancel) : undefined)
    tail = reading.then(() => undefined, () => undefined)
    const cut = await reading
    if (cut === undefined || !permitted(scope, cancel) || !sameSession(session, dshSessionRef(cut.header, source.instanceId))) return
    for (const row of normalizeDshCut(cut, source.instanceId)) {
      if (!permitted(scope, cancel)) return
      if (row.kind !== 'bind') yield row
    }
  }
  return {
    adapterId: dshCapabilities.adapterId, adapterVersion: dshCapabilities.adapterVersion,
    async getCapabilities() {
      return { major: 0, minor: 1, offered: ['observe-session', 'causal-tool-pair'], required: [] }
    },
    observeSession,
    async resolveCausality(event: NormalizedRuntimeEvent, scope, cancel) {
      if (event.kind !== 'tool-result' || event.originalCall === null || !permitted(scope, cancel)) return null
      let call: ToolCall | undefined
      for await (const row of observeSession(event.ref.session, scope, cancel)) {
        if (row.ref.sourceRevision !== event.ref.sourceRevision) return null
        if (row.kind === 'tool-call' && row.ref.localSeq === event.originalCall.localSeq) call = row
        if (row.ref.localSeq === event.ref.localSeq) {
          if (row.kind !== 'tool-result' || call === undefined) return null
          const requested = resolveToolResult(event, call)
          return requested === null ? null : resolveToolResult(row, call)
        }
      }
      return null
    },
  }
}
import { createHash } from 'node:crypto'

/** Verified persisted harness specialization; the journal already pins one Workspace and format. */
export function createDshJournalHarnessAdapter(journal: DshJournal, authority: Pick<ScopeAuthority, 'permits'>): HarnessAdapter {
  return createDshHarnessAdapter({
    authority, workspaceId: journal.partitionId, instanceId: journal.partitionId,
    async read(session, cancel) {
      const deadline = AbortSignal.timeout(6_000)
      const snapshot = await journal.inspect(session.sessionId, deadline)
      if (snapshot === undefined || cancel.cancelled || String(snapshot.header.createdAt) !== session.incarnation) return
      const artifact = await journal.read(snapshot, deadline)
      return {
        header: artifact.meta, inheritedEventCount: artifact.inheritedEventCount, events: artifact.events,
        sourceRevision: journalSourceRevision(journal.partitionId, snapshot.revision),
      }
    },
  })
}
