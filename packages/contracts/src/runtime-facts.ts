import type { EventRef, TaskId, WorkspaceScope } from './index.ts'
import type { GraphChange, TaskGraphEvent, TaskGraphSnapshot, WorkNodeId } from './task-graph.ts'

export type RuntimeFactDetail =
  | { readonly kind: 'binding'; readonly taskId: TaskId; readonly revision: number }
  | { readonly kind: 'session-seed-boundary'; readonly parentSessionId?: string }
  | { readonly kind: 'session-end' | 'user' | 'runtime-context' | 'compact-start' | 'compact-summary' | 'compact-end' | 'unmapped' }
  | { readonly kind: 'turn-open' | 'turn-complete' | 'turn-failed' | 'turn-interrupted'; readonly turn: string }
  | { readonly kind: 'assistant' | 'step-open' | 'step-close' | 'tool-call' | 'tool-result'; readonly turn: string; readonly step: string;
      readonly callId?: string; readonly callSeq?: number }

export interface RuntimeFact {
  readonly version: 'runtime-fact-v1'
  readonly eventId: string
  readonly workspaceId: string
  readonly source: EventRef
  readonly runtimeVersion: string
  readonly adapterVersion: string
  readonly provenance: 'runtime_observed'
  readonly detail: RuntimeFactDetail
}
export type RuntimeAttribution =
  | { readonly kind: 'assigned'; readonly taskId: TaskId; readonly via: 'explicit-binding' | 'original-call' | 'original-turn' | 'host-source' }
  | { readonly kind: 'unassigned'; readonly reason: 'unbound' | 'missing-cause' | 'ambiguous-user' | 'non-task' | 'unregistered-task' }
export interface StoredRuntimeFact {
  readonly fact: RuntimeFact
  readonly attribution: RuntimeAttribution
  readonly observedAt: string
}
export interface RuntimeCursor {
  readonly next: number
  readonly bindingRevision: number
  readonly taskId?: TaskId
  readonly sourceRevision?: string
}

export interface GraphStreamCut {
  readonly workspaceId: string
  readonly revision: string
  readonly snapshot: TaskGraphSnapshot
}
export interface GraphEventDraft {
  readonly change: GraphChange
  readonly source: EventRef
  readonly key: string
}
export interface StoredGraphEvent {
  readonly version: 'graph-stream-v1'
  readonly workspaceId: string
  readonly taskId: TaskId
  readonly event: TaskGraphEvent
  readonly idem: string
  readonly previous: string
  readonly observedAt: string
  readonly provenance: 'host_confirmed' | 'deterministically_derived'
  readonly proposalId?: string
}
export interface GraphEventRecord extends StoredGraphEvent { readonly hash: string }
export interface GraphAppendReceipt {
  readonly status: 'committed' | 'duplicate'
  readonly sequence: number
  readonly revision: string
  readonly eventId: string
}
export interface GraphStreamReader {
  read(scope: WorkspaceScope, taskId: TaskId): GraphStreamCut | null
  events(scope: WorkspaceScope, taskId: TaskId, after?: number, limit?: number): readonly GraphEventRecord[]
}
export interface GraphStreamWriter {
  append(writer: WorkspaceScope, taskId: TaskId, draft: GraphEventDraft, expectedRevision?: string): GraphAppendReceipt
  checkpoint(writer: WorkspaceScope, taskId: TaskId, expectedRevision: string): void
}
export type SemanticSuggestion =
  | { readonly kind: 'decompose'; readonly evidenceId: string; readonly parent: WorkNodeId; readonly stages: readonly { readonly id: WorkNodeId; readonly title: string }[] }
  | { readonly kind: 'next-action'; readonly evidenceId: string; readonly text: string }
  | { readonly kind: 'decision'; readonly evidenceId: string; readonly topic: string; readonly text: string }
  | { readonly kind: 'objective'; readonly evidenceId: string; readonly objective: string; readonly criteria: readonly string[] }
  | { readonly kind: 'dependency'; readonly evidenceId: string; readonly from: string; readonly to: string; readonly relation: 'depends_on' | 'joins_into' }
  | { readonly kind: 'advance'; readonly evidenceId: string; readonly nodeId: string }
  | { readonly kind: 'work-result'; readonly evidenceId: string; readonly nodeId: string; readonly executionId: string; readonly resultId: string; readonly text: string }
  | { readonly kind: 'result-review'; readonly evidenceId: string; readonly nodeId: string; readonly resultId: string; readonly stage: 'inspected' | 'consumed' | 'accepted' }
  | { readonly kind: 'join'; readonly evidenceId: string; readonly nodeId: string }
export interface GraphProposal {
  readonly version: 'graph-proposal-v1'
  readonly policy: 'bounded-suggestions-v1'
  readonly id: string
  readonly taskId: TaskId
  readonly workspaceId: string
  readonly baseRevision: string
  readonly sourceRevision: string
  readonly status: 'proposed'
  readonly requiresConfirmation: true
  readonly provenance: 'heuristic_proposed'
  readonly suggestion: SemanticSuggestion
  readonly evidence: readonly { readonly eventId: string; readonly source: EventRef; readonly provenance: 'runtime_observed' }[]
  readonly changes: readonly GraphChange[]
}
