import type { EventRef, GraphChange, RuntimeFactDetail, RuntimeSessionRef, TaskId } from './index.ts'

export interface QualificationEvidenceLink {
  readonly factId: string
  readonly sourceRevision: string
  readonly evidenceRevision: string
  readonly excerptHash: string | null
}
export interface QualificationExcerpt {
  readonly text: string
  readonly hash: string
  /** Half-open UTF-16 offsets in the original authorized synthetic content. */
  readonly start: number
  readonly end: number
  readonly totalLength: number
  readonly truncated: boolean
}
export type EvidenceRole = 'direct_support' | 'contextual_support' | 'contradiction' | 'negative_evidence'
  | 'runtime_fact' | 'user_confirmation' | 'tool_result_content' | 'subagent_output' | 'host_confirmation'
export interface QualificationEvidence {
  readonly version: 'qualification-evidence-v1'
  readonly factId: string
  readonly taskId: TaskId
  readonly workspaceId: string
  readonly source: EventRef
  readonly detailKind: RuntimeFactDetail['kind']
  readonly actor: 'user' | 'assistant' | 'tool' | 'runtime'
  readonly turn?: string
  readonly step?: string
  readonly excerpt?: QualificationExcerpt
  readonly provenance: 'runtime_metadata' | 'synthetic_host_attested_excerpt'
  readonly hostConfirmation?: { readonly reviewerId: string; readonly reason: string; readonly claimHash: string }
  readonly generation: number
  readonly revision: string
  readonly revoked: boolean
}
export interface GroundingInput {
  readonly workspaceId: string
  readonly taskId: TaskId
  readonly change: GraphChange
  readonly batch?: readonly GraphChange[]
  readonly activeNodeId?: string
  readonly evidence: QualificationEvidence | null
  readonly link: QualificationEvidenceLink | null
}
export type GroundingStatus = 'supported' | 'insufficient' | 'contradicted' | 'unavailable' | 'scope' | 'stale' | 'authority'
export interface GroundingVerdict {
  readonly status: GroundingStatus
  readonly reason: string
  readonly claimHash: string
  readonly role?: EvidenceRole
}
export interface GroundingAudit extends GroundingVerdict {
  readonly changeId: string
  readonly evidence?: {
    readonly link: QualificationEvidenceLink
    readonly source: EventRef
    readonly actor: QualificationEvidence['actor']
    readonly detailKind: QualificationEvidence['detailKind']
    readonly provenance: QualificationEvidence['provenance']
    readonly turn?: string
    readonly step?: string
    readonly range?: Omit<QualificationExcerpt, 'text' | 'hash'>
  }
}
export interface CandidateCatalogEntry {
  readonly workspaceId: string
  readonly taskId: TaskId
  readonly title: string
  readonly objective: string
  readonly status: 'open' | 'closed'
  readonly lastActive: number
  readonly revision: string
  readonly session?: RuntimeSessionRef
}
export interface CandidateLookup {
  readonly currentTaskId?: TaskId
  readonly session?: RuntimeSessionRef
  readonly explicitTaskIds?: readonly TaskId[]
  readonly query?: string
  readonly limit?: number
}
export interface RankedTaskCandidate extends CandidateCatalogEntry {
  readonly access: 'allowed'
  readonly source: 'explicit_reference' | 'current_binding' | 'session_recent' | 'lexical' | 'workspace_recent'
  readonly reason: string
  readonly rank: number
  readonly score: number
  readonly matchingFields: readonly ('title' | 'objective')[]
}
export interface CandidateRetrieval {
  readonly version: 'bounded-task-candidates-v1'
  readonly revision: string
  readonly candidates: readonly RankedTaskCandidate[]
  readonly postingsVisited: number
  readonly examined: number
}
