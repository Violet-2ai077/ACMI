import type {
  Attribution, BindingRecord, HistoryRow, ProjectionInput, TaskId, TaskRecord, ToolCall,
} from '@acmi/contracts'
import { cleanRef, isEventRef, isTaskId, resolveToolResult, sessionKey } from './guards.ts'

interface SessionState {
  readonly cut: string
  seq: number
  binding?: BindingRecord
  readonly calls: Map<number, { event: ToolCall; attribution: Attribution; consumed: boolean }>
  readonly switches: Set<string>
  readonly turns: Map<string, 'open' | 'complete' | 'interrupted'>
  activeTurn: string | undefined
}

const unresolved = (reason: string): Attribution => ({ kind: 'unresolved', reason })
const forward = (binding: BindingRecord | undefined): Attribution =>
  binding === undefined ? unresolved('unbound') : { kind: 'bound', binding, method: 'forward' }

/** Fold already-authorized, normalized facts. Output order is input/display order, never cross-Session causality. */
export function project(
  events: readonly ProjectionInput[],
  seedTasks: readonly TaskRecord[],
  options: { readonly requireTurnEvidence?: boolean } = {},
): readonly HistoryRow[] {
  const workspace = seedTasks[0]?.workspaceId
  const inventory = new Set<TaskId>()
  for (const task of seedTasks) {
    if (!workspace || task.workspaceId !== workspace || !isTaskId(task.taskId) || inventory.has(task.taskId)) {
      throw new Error('Invalid or mixed-workspace task inventory')
    }
    inventory.add(task.taskId)
  }
  const sessions = new Map<string, SessionState>()
  const rows: { row: HistoryRow; state: SessionState; turn?: string }[] = []
  for (const event of events) {
    if (!isEventRef(event.ref)) throw new Error('Invalid event reference')
    const key = sessionKey(event.ref.session)
    let state = sessions.get(key)
    if (state === undefined) {
      state = { cut: event.ref.sourceRevision, seq: -1, calls: new Map(), switches: new Set(), turns: new Map(), activeTurn: undefined }
      sessions.set(key, state)
    }
    if (event.ref.sourceRevision !== state.cut || event.ref.localSeq <= state.seq) {
      throw new Error('Invalid Session source cut or sequence')
    }
    state.seq = event.ref.localSeq
    const turn = event.turnId ?? state.activeTurn
    if (event.kind === 'bind') {
      if (!inventory.has(event.taskId)) throw new Error('Binding references an unknown task')
      state.binding = Object.freeze({ taskId: event.taskId, revision: (state.binding?.revision ?? 0) + 1, effectiveAfter: cleanRef(event.ref) })
      if (turn !== undefined) state.switches.add(turn)
      continue
    }
    if (event.kind === 'turn-open' || event.kind === 'turn-complete' || event.kind === 'turn-interrupted') {
      if (turn !== undefined) {
        state.turns.set(turn, event.kind === 'turn-open' ? 'open' : event.kind === 'turn-complete' ? 'complete' : 'interrupted')
        state.activeTurn = event.kind === 'turn-open' ? turn : undefined
      }
      continue
    }
    if (event.kind !== 'user' && event.kind !== 'assistant' && event.kind !== 'tool-call' && event.kind !== 'tool-result') continue
    let attribution = forward(state.binding)
    const admissibleUserTurn = event.kind !== 'user' || options.requireTurnEvidence !== true
      || (turn !== undefined && state.activeTurn === turn && state.turns.get(turn) === 'open')
    if (!admissibleUserTurn) attribution = unresolved('no-turn')
    if (event.kind === 'tool-call') state.calls.set(state.seq, { event, attribution, consumed: false })
    if (event.kind === 'tool-result') {
      const source = event.originalCall === null ? undefined : state.calls.get(event.originalCall.localSeq)
      if (source === undefined || source.consumed || resolveToolResult(event, source.event) === null) {
        attribution = unresolved('missing-or-invalid-call')
      } else {
        source.consumed = true
        attribution = source.attribution.kind === 'unresolved' ? source.attribution : { ...source.attribution, method: 'original-call' }
      }
    }
    const row = { ref: cleanRef(event.ref), attribution }
    rows.push(event.kind === 'user' && admissibleUserTurn && turn !== undefined ? { row, state, turn } : { row, state })
  }
  return rows.map(({ row, state, turn }) => {
    if (turn === undefined) return row
    const status = state.turns.get(turn)
    if (status === 'open') return { ...row, attribution: unresolved('turn-open') }
    if (status === 'interrupted') return { ...row, attribution: unresolved('turn-incomplete') }
    if (state.switches.has(turn)) return { ...row, attribution: unresolved('binding-changed') }
    return row
  })
}

export function taskHistory(rows: readonly HistoryRow[], taskId: TaskId): readonly HistoryRow[] {
  return rows.filter(row => row.attribution.kind === 'bound' && row.attribution.binding.taskId === taskId)
}
