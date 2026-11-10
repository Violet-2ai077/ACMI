export interface UnderstandingCut {
  readonly workspaceId: string
  readonly sessionId: string
  readonly incarnation: string
  readonly authorizationEpoch: number
  readonly bindingRevision: number
  readonly graphRevision: number
  readonly sourceRevision: number
  readonly candidateRevision: number
  readonly policyVersion: string
  readonly cursor: number
}

export type UnderstandingActor = 'user' | 'assistant' | 'tool' | 'subagent' | 'host'
export type UnderstandingEventKind = 'message' | 'causal' | 'binding' | 'authorization' | 'metadata' | 'closed'
export interface UnderstandingSpan { readonly start: number; readonly end: number }
export interface UnderstandingTurn {
  readonly id: string
  readonly actor: UnderstandingActor
  readonly kind: UnderstandingEventKind
  readonly text: string
  readonly digest: string
}
export type UnderstandingFactKind = 'tool-call' | 'tool-result' | 'subagent-completed' | 'result-produced'
  | 'binding-changed' | 'graph-conflict' | 'authorization-changed' | 'join-checked' | 'execution-completed'
  | 'result-inspected' | 'result-consumed'

export interface UnderstandingFact {
  readonly workspaceId: string
  readonly sessionId: string
  readonly incarnation: string
  readonly cursor: number
  readonly sourceRevision: number
  readonly id: string
  readonly kind: UnderstandingFactKind
  readonly cause?: string
  readonly relatedTaskId?: string
  readonly relatedWorkNodeId?: string
  readonly relatedResultId?: string
  readonly contentDigest?: string
}

export type UnderstandingCandidateReason = 'explicit' | 'binding' | 'recent' | 'lexical' | 'historical' | 'oracle'
export interface UnderstandingTaskInput {
  readonly taskId: string
  readonly workspaceId: string
  readonly catalogRevision: number
  readonly revision: number
  readonly status: 'open' | 'closed'
  readonly objective: string
  readonly aliases?: readonly string[]
  readonly scope?: string
  readonly activeWorkNode?: string
  readonly lastActivity: number
  readonly acceptedDecisions?: readonly string[]
  readonly blockers?: readonly string[]
  readonly project?: string
  readonly reason: UnderstandingCandidateReason
}
export interface LayeredUnderstandingCandidate extends Omit<UnderstandingTaskInput, 'workspaceId'> {
  readonly handle: string
  readonly bindable: boolean
}

export interface UnderstandingRetained {
  readonly kind: 'identity' | 'unresolved' | 'proposal'
  readonly ref: string
  readonly cursor: number
  readonly sourceRevision: number
  readonly taskId?: string
  readonly revision?: number
}
export type UnderstandingOmission = {
  readonly section: 'active' | 'historical' | 'facts' | 'retained'
  readonly reason: 'candidate_limit' | 'item_limit' | 'invalid_summary' | 'stale_revision' | 'budget'
  readonly count: number
}
export interface UnderstandingBudget {
  readonly bytes: number
  readonly estimatedTokens: number
  readonly maxBytes: number
  readonly maxEstimatedTokens: number
  readonly estimator: 'ascii4-unicode1-v1'
}
export interface UnderstandingContextInput {
  readonly cut: UnderstandingCut
  readonly current: Omit<UnderstandingTurn, 'digest'>
  readonly binding: { readonly taskId: string | null }
  readonly candidates?: readonly UnderstandingTaskInput[]
  readonly facts?: readonly UnderstandingFact[]
  readonly retained?: readonly UnderstandingRetained[]
}

/** A bounded, read-only observation. This is not a TaskContextPackage or an authorization. */
export interface UnderstandingContextPackage {
  readonly schemaVersion: 'understanding-context/v0.1'
  readonly cut: UnderstandingCut
  readonly current: UnderstandingTurn
  readonly binding: UnderstandingContextInput['binding']
  readonly active: readonly LayeredUnderstandingCandidate[]
  readonly historical: readonly LayeredUnderstandingCandidate[]
  readonly facts: readonly UnderstandingFact[]
  readonly retained: readonly UnderstandingRetained[]
  readonly omissions: readonly UnderstandingOmission[]
  readonly budget: UnderstandingBudget
  readonly digest: string
}

export type UnderstandingAct = 'question' | 'report' | 'suggestion' | 'rejection' | 'selection' | 'acceptance'
  | 'correction' | 'authorization_request' | 'acknowledgement' | 'social' | 'unknown'
export type UnderstandingRelation = 'none' | 'discussion' | 'existing' | 'new' | 'unknown'
export type UnderstandingPosture = 'discuss' | 'continue' | 'switch' | 'return' | 'pause' | 'wait' | 'resume' | 'close' | 'unknown'
export type UnderstandingSemanticChange = 'preserve' | 'refine' | 'scope' | 'objective' | 'state' | 'unknown'
export interface UnderstandingActSpan {
  readonly span: UnderstandingSpan
  readonly acts: readonly UnderstandingAct[]
  readonly actor: UnderstandingActor
  readonly quoted: boolean
  readonly negated: boolean
  readonly conditional: boolean
  readonly hypothetical: boolean
  readonly temporal: 'prior' | 'future' | 'current'
}
export interface UnderstandingIntentSpan {
  readonly span: UnderstandingSpan
  readonly relation: UnderstandingRelation
  readonly posture: UnderstandingPosture
  readonly change: UnderstandingSemanticChange
}
export type UnderstandingIdentity =
  | { readonly status: 'active' | 'historical'; readonly handle: string; readonly reason: 'explicit' | 'binding' | 'recent' | 'contrastive' }
  | { readonly status: 'ambiguous' | 'missing' | 'unavailable' | 'stale' | 'unassigned' | 'unknown'; readonly reason: string }
