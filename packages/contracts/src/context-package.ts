import type { EventRef, TaskId } from './index.ts'
import type { GraphRef, ReviewStage, WorkNodeId, WorkState } from './task-graph.ts'

export interface ContextAssemblyRequest {
  readonly taskId: TaskId
  readonly activeNodeId?: WorkNodeId
  readonly tokenBudget: number
  readonly policyVersion: 'task-context-v1'
  readonly includeDependencyResults: boolean
}
export type ContextKind = 'objective' | 'active-work' | 'execution-state' | 'work-status' | 'constraint' | 'blocker'
  | 'decision' | 'decision-conflict' | 'next-action' | 'unresolved' | 'graph-issue' | 'runtime-state' | 'artifact'
  | 'tool-outcome' | 'progress' | 'completed-result' | 'dependency-result' | 'unreviewed_dependency_output'
export type OmissionReason = 'low_relevance' | 'duplicate' | 'superseded' | 'unverified' | 'not_consumed' | 'stale'
  | 'budget_exceeded' | 'policy_disabled' | 'unsupported_source'
export interface ContextSource {
  readonly taskId: TaskId
  readonly event: EventRef
  readonly graph?: Pick<GraphRef, 'eventId' | 'seq'>
}
export interface ContextItem {
  readonly id: string
  readonly kind: ContextKind
  readonly taskId: TaskId
  readonly nodeId?: WorkNodeId
  readonly status: 'active' | 'verified' | 'unverified' | 'disputed' | 'unresolved'
  readonly tier: 0 | 1 | 2 | 3
  readonly text: string
  readonly sources: readonly ContextSource[]
  readonly reason: 'required_state' | 'active_work' | 'related_work' | 'explicit_dependency' | 'unresolved_evidence'
  readonly truncated?: true
  readonly dependency?: {
    readonly taskId: TaskId
    readonly resultId: string
    readonly stage: 'produced' | ReviewStage
    readonly producerVerified: boolean
    readonly sourceRevision?: string
  }
}
export interface TaskContextPackage {
  readonly schemaVersion: 'task-context-package-v1'
  readonly taskId: TaskId
  readonly activeNodeId: WorkNodeId
  readonly currentState: { readonly task: 'open' | 'closed'; readonly work: WorkState; readonly attempt: number }
  readonly items: readonly ContextItem[]
  readonly omissions: Readonly<Record<OmissionReason, number>>
  readonly assembly: {
    readonly policyVersion: ContextAssemblyRequest['policyVersion']
    readonly sourceRevision: string
    readonly graphVersion: 'task-graph-v1'
    readonly tokenBudget: number
    readonly reservedTokens: number
    readonly estimatedTokens: number
    readonly estimator: 'utf8-byte-upper-estimate-v1'
    readonly deterministicHash: string
    readonly includedCount: number
    readonly omittedCount: number
  }
}
export type ContextAssemblyResult = {
  readonly status: 'ok'
  readonly package: TaskContextPackage
  /** Host diagnostics; never add these to the model envelope. No foreign candidate IDs. */
  readonly diagnostics: readonly { readonly id: string; readonly reason: OmissionReason }[]
} | { readonly status: 'invalid_request' | 'unavailable' | 'unresolved' }
  | { readonly status: 'budget_insufficient'; readonly minimumEstimatedTokens: number }
