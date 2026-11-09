import type { EventRef, TaskId, WorkspaceScope } from './index.ts'

export type WorkNodeId = string
export type ExecutionId = string
export type ResultId = string
export type WorkState = 'planned' | 'ready' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled' | 'superseded'
export type ExecutionState = 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'cancelled'
export type WorkRelation = 'decomposes_into' | 'depends_on' | 'continues_as' | 'joins_into' | 'references'
export type ReviewStage = 'available' | 'inspected' | 'consumed' | 'accepted'
export type DecisionState = 'proposed' | 'accepted' | 'superseded' | 'rejected' | 'disputed' | 'unresolved'

export interface GraphRef { readonly eventId: string; readonly seq: number; readonly source: EventRef }
export interface WorkNode {
  readonly id: WorkNodeId
  readonly title: string
  readonly role: 'work' | 'join'
  readonly state: WorkState
  readonly attempt: number
  readonly declared: GraphRef
  readonly changed: GraphRef
  readonly joinSatisfied?: GraphRef
}
export interface WorkEdge {
  readonly from: WorkNodeId
  readonly to: WorkNodeId
  readonly relation: WorkRelation
  readonly ref: GraphRef
}
export interface AgentExecution {
  readonly id: ExecutionId
  readonly nodeId: WorkNodeId
  readonly attempt: number
  readonly agentId: string
  readonly parentId?: ExecutionId
  readonly state: ExecutionState
  readonly waitingFor?: readonly ExecutionId[]
  readonly started: GraphRef
  readonly changed: GraphRef
}
export interface WorkResult {
  readonly id: ResultId
  readonly nodeId: WorkNodeId
  readonly executionId: ExecutionId
  readonly attempt: number
  readonly summary: string
  readonly verified: boolean
  readonly produced: GraphRef
}
/** An explicit point-in-time result receipt, not permission to read another Task. */
export interface DependencyReceipt {
  readonly workspaceId: string
  readonly taskId: TaskId
  readonly sourceRevision: string
  readonly result: WorkResult
}
export interface RequiredResult {
  readonly id: ResultId
  readonly nodeId: WorkNodeId
  readonly receipt: DependencyReceipt
  readonly ref: GraphRef
}
export interface ResultReview {
  readonly resultId: ResultId
  readonly nodeId: WorkNodeId
  readonly attempt: number
  readonly stage: ReviewStage
  readonly ref: GraphRef
  readonly history: readonly GraphRef[]
}
export type EvidenceContent =
  | { readonly kind: 'constraint' | 'blocker' | 'next-action' | 'unresolved' | 'runtime-state'; readonly text: string }
  | { readonly kind: 'decision'; readonly text: string; readonly topic: string; readonly state: DecisionState; readonly rationale?: string }
  | { readonly kind: 'artifact'; readonly text: string; readonly state: 'verified' | 'unverified' | 'stale' }
  | { readonly kind: 'tool-outcome'; readonly text: string; readonly call: EventRef }
export interface GraphEvidence {
  readonly id: string
  readonly nodeId?: WorkNodeId
  readonly content: EvidenceContent
  readonly ref: GraphRef
  readonly superseded?: GraphRef
}

export type GraphChange =
  | { readonly kind: 'task-opened'; readonly objective: string; readonly criteria: readonly string[] }
  | { readonly kind: 'task-reframed'; readonly objective: string; readonly criteria: readonly string[] }
  | { readonly kind: 'task-closed' }
  | { readonly kind: 'runtime-observed'; readonly factId: string }
  | { readonly kind: 'node-added'; readonly nodeId: WorkNodeId; readonly title: string; readonly role: WorkNode['role'] }
  | { readonly kind: 'edge-added'; readonly from: WorkNodeId; readonly to: WorkNodeId; readonly relation: WorkRelation }
  | { readonly kind: 'work-transitioned'; readonly nodeId: WorkNodeId; readonly state: WorkState }
  | { readonly kind: 'work-progressed'; readonly nodeId: WorkNodeId; readonly summary: string }
  | { readonly kind: 'execution-started'; readonly executionId: ExecutionId; readonly nodeId: WorkNodeId; readonly agentId: string; readonly parentId?: ExecutionId }
  | { readonly kind: 'execution-transitioned'; readonly executionId: ExecutionId; readonly state: ExecutionState; readonly waitingFor?: readonly ExecutionId[] }
  | { readonly kind: 'result-produced'; readonly resultId: ResultId; readonly nodeId: WorkNodeId; readonly executionId: ExecutionId; readonly summary: string; readonly verified: boolean }
  | { readonly kind: 'dependency-required'; readonly resultId: ResultId; readonly nodeId: WorkNodeId; readonly receipt: DependencyReceipt }
  | { readonly kind: 'result-reviewed'; readonly resultId: ResultId; readonly nodeId: WorkNodeId; readonly stage: ReviewStage }
  | { readonly kind: 'join-satisfied'; readonly nodeId: WorkNodeId }
  | { readonly kind: 'mainline-advanced'; readonly nodeId: WorkNodeId }
  | { readonly kind: 'evidence-recorded'; readonly nodeId?: WorkNodeId; readonly content: EvidenceContent; readonly supersedes?: string }
export type TaskGraphEvent = GraphChange & {
  /** Contiguous 1-based sequence from the trusted Task stream, not a Session sequence. */
  readonly seq: number
  readonly id: string
  readonly source: EventRef
  readonly after?: readonly string[]
}
export interface GraphIssue { readonly reason: string; readonly ref: GraphRef }
export interface WorkProgress { readonly nodeId: WorkNodeId; readonly summary: string; readonly ref: GraphRef }
export interface TaskGraphSnapshot {
  readonly version: 'task-graph-v1'
  readonly taskId: TaskId
  readonly sourceRevision: string
  readonly through: number
  readonly pending: number
  readonly task?: { readonly objective: string; readonly criteria: readonly string[]; readonly opened: GraphRef; readonly reframed?: GraphRef; readonly closed?: GraphRef }
  readonly activeNodeId?: WorkNodeId
  readonly position?: GraphRef
  readonly nodes: readonly WorkNode[]
  readonly edges: readonly WorkEdge[]
  readonly executions: readonly AgentExecution[]
  readonly results: readonly WorkResult[]
  readonly dependencies: readonly RequiredResult[]
  readonly reviews: readonly ResultReview[]
  readonly evidence: readonly GraphEvidence[]
  readonly progress: readonly WorkProgress[]
  readonly unresolved: readonly GraphIssue[]
}
export type GraphAppend = 'applied' | 'unresolved' | 'buffered' | 'duplicate' | 'scope-denied' | 'invalid-envelope' | 'limit' | 'conflict'
export interface TaskGraphReader {
  read(scope: WorkspaceScope): TaskGraphSnapshot | null
}
export interface TaskGraphEventWriter {
  append(scope: WorkspaceScope, event: TaskGraphEvent): GraphAppend
}
/** Trusted host SHA-256 (lowercase hex over UTF-8). No host crypto dependency in Core. */
export type Digest = (canonicalText: string) => string
