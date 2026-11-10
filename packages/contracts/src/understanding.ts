import type { EventRef, GraphChange, GraphStreamCut, StoredRuntimeFact, TaskId } from './index.ts'
import type { GroundingAudit, QualificationEvidenceLink } from './qualification.ts'

export type UnderstandingIntent =
  | { readonly kind: 'continue_current' | 'switch_existing'; readonly taskId: TaskId }
  | { readonly kind: 'create_new'; readonly objective: string }
  | { readonly kind: 'no_task' | 'uncertain' }
export interface UnderstandingCandidate {
  readonly workspaceId: string
  readonly taskId: TaskId
  readonly alias: string
  readonly objective: string
  readonly revision: string
}
export interface SyntheticUserExcerpt {
  readonly evidenceId: string
  readonly provenance: 'synthetic_host_excerpt'
  readonly text: string
}
export type UnderstandingMode = 'rules' | 'rules-scripted' | 'structured-mock' | 'abstention-first'
export interface UnderstandingInput {
  readonly cut: GraphStreamCut
  readonly candidates: readonly UnderstandingCandidate[]
  readonly currentTaskId?: TaskId
  readonly facts: readonly StoredRuntimeFact[]
  readonly anchorId: string
  readonly user?: SyntheticUserExcerpt
  readonly now: number
  readonly ttlMs: number
  readonly budget: number
  readonly pending?: readonly string[]
}
export interface UnderstandingEvidence {
  readonly eventId: string
  readonly source: EventRef
  readonly kind: StoredRuntimeFact['fact']['detail']['kind']
  readonly provenance: 'runtime_observed'
}
export interface UnderstandingChange {
  readonly id: string
  readonly evidenceId: string
  readonly change: GraphChange
}
export interface UnderstandingProposal {
  readonly version: 'understanding-proposal-v1'
  readonly policy: 'incremental-understanding-v1'
  readonly mode: UnderstandingMode
  readonly id: string
  readonly status: 'proposed'
  readonly workspaceId: string
  readonly taskId: TaskId
  readonly graphRevision: string
  readonly projectionRevision: string
  readonly sourceRevision: string
  readonly candidateRevision: string
  readonly evidence: readonly UnderstandingEvidence[]
  readonly intent: UnderstandingIntent
  readonly userEvidence?: { readonly evidenceId: string; readonly excerptHash: string; readonly provenance: SyntheticUserExcerpt['provenance'] }
  readonly changes: readonly UnderstandingChange[]
  readonly provenance: 'deterministic_rules' | 'scripted_model_mock' | 'explicit_user_instruction'
  readonly unresolved: readonly string[]
  readonly createdAt: number
  readonly expiresAt: number
  readonly supersessionKey: string
  readonly grounding?: { readonly policy: 'qualification-evidence-v1'; readonly link: QualificationEvidenceLink | null }
}
export interface UnderstandingPacket {
  readonly anchorId: string
  readonly task: { readonly objective: string; readonly criteria: readonly string[]; readonly activeNodeId?: string }
  readonly candidates: readonly { readonly taskId: TaskId; readonly alias: string; readonly objective: string }[]
  readonly facts: readonly { readonly eventId: string; readonly kind: UnderstandingEvidence['kind'] }[]
  readonly nodes: readonly { readonly id: string; readonly title: string; readonly state: string;
    readonly description?: string; readonly criteria?: readonly string[] }[]
  readonly edges: readonly { readonly from: string; readonly to: string; readonly relation: string }[]
  readonly executions: readonly { readonly id: string; readonly nodeId: string; readonly state: string }[]
  readonly results: readonly { readonly id: string; readonly nodeId: string }[]
  readonly decisions: readonly { readonly id: string; readonly topic: string; readonly state: string }[]
  readonly reviews: readonly { readonly resultId: string; readonly nodeId: string; readonly stage: string;
    readonly disposition?: 'rejected' | 'superseded' }[]
  readonly pending: readonly string[]
  readonly user?: SyntheticUserExcerpt
}
export interface UnderstandingModel {
  // Only a detached packet; no store, grant, path or runtime object.
  readonly propose: (packet: UnderstandingPacket) => Promise<string> | string
}
export type UnderstandingDisposition = 'accepted' | 'rejected' | 'expired' | 'superseded' | 'conflicted'
export interface UnderstandingReviewReceipt {
  readonly proposalId: string
  readonly status: UnderstandingDisposition
  readonly reviewer: { readonly type: 'trusted_host'; readonly id: string }
  readonly acceptedChangeIds: readonly string[]
  readonly rejectedChangeIds: readonly string[]
  readonly expectedRevision: string
  readonly resultingRevision: string
  readonly reason: string
  readonly timestamp: number
  readonly evidence: readonly UnderstandingEvidence[]
  readonly grounding?: readonly GroundingAudit[]
}
