import type {
  GroundingAudit, QualificationEvidenceLink, StoredRuntimeFact, SyntheticUserExcerpt, UnderstandingMode, UnderstandingProposal, UnderstandingReviewReceipt,
} from '@acmi/contracts'
import { boundedText, exactFields, isTaskId, understandingCandidateLimit, understandingFactLimit } from '@acmi/core'
import type { DatabaseSync } from 'node:sqlite'
import { validQualificationLink } from './qualification-store.ts'

export interface UnderstandingTarget {
  readonly taskId: string
  readonly currentTaskId?: string
  readonly candidates: readonly { readonly taskId: string; readonly alias: string }[]
  readonly budget?: number
  readonly ttlMs?: number
  readonly mode?: UnderstandingMode
}
export interface UnderstandingRequest extends UnderstandingTarget {
  readonly synthetic: true
  readonly evidenceIds: readonly string[]
  readonly anchorId: string
  readonly user?: SyntheticUserExcerpt
  readonly pending?: readonly string[]
  readonly grounding?: QualificationEvidenceLink
}
export interface UnderstandingPage {
  readonly after: number
  readonly through: number
  readonly facts: readonly StoredRuntimeFact[]
}
export interface UnderstandingCursorMove {
  readonly after: number
  readonly through: number
  readonly limit: number
}
export interface UnderstandingInboxItem {
  readonly proposal: UnderstandingProposal
  readonly risks: readonly string[]
  readonly grounding?: readonly GroundingAudit[]
  readonly review?: UnderstandingReviewReceipt
}
export interface UnderstandingReviewCommand {
  readonly decision: 'accept' | 'reject'
  readonly reviewerId: string
  readonly reason: string
}
export interface SavedUnderstanding {
  readonly request: UnderstandingRequest
  readonly modelJson?: string
  readonly item: UnderstandingInboxItem
}
export interface SavedUnderstandingReview {
  readonly command: UnderstandingReviewCommand
  readonly receipt: UnderstandingReviewReceipt
}
export const digestId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/u.test(v)
const boundedInt = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max
export function validUnderstandingRequest(r: UnderstandingRequest): boolean {
  return exactFields(r, ['synthetic', 'taskId', 'currentTaskId', 'candidates', 'evidenceIds', 'anchorId', 'user',
    'budget', 'ttlMs', 'mode', 'pending', 'grounding'])
    && r.synthetic === true && isTaskId(r.taskId) && (r.currentTaskId === undefined || isTaskId(r.currentTaskId))
    && Array.isArray(r.candidates) && r.candidates.length <= understandingCandidateLimit
    && r.candidates.every(c => exactFields(c, ['taskId', 'alias']) && isTaskId(c.taskId)
      && typeof c.alias === 'string' && /^[A-Za-z0-9_.:-]{1,96}$/u.test(c.alias))
    && new Set(r.candidates.map(c => c.taskId)).size === r.candidates.length
    && (r.currentTaskId === undefined || r.candidates.some(c => c.taskId === r.currentTaskId))
    && Array.isArray(r.evidenceIds) && r.evidenceIds.length >= 1 && r.evidenceIds.length <= understandingFactLimit
    && r.evidenceIds.every(digestId) && new Set(r.evidenceIds).size === r.evidenceIds.length
    && digestId(r.anchorId) && r.evidenceIds.includes(r.anchorId)
    && (r.user === undefined || exactFields(r.user, ['evidenceId', 'text', 'provenance'])
      && r.user.evidenceId === r.anchorId && r.user.provenance === 'synthetic_host_excerpt' && boundedText(r.user.text, 1024))
    && (r.pending === undefined || Array.isArray(r.pending) && r.pending.length <= 8 && r.pending.every(digestId))
    && (r.grounding === undefined || validQualificationLink(r.grounding) && r.grounding.factId === r.anchorId)
    && (r.budget === undefined || boundedInt(r.budget, 1, 32_768))
    && (r.ttlMs === undefined || boundedInt(r.ttlMs, 1, 3_600_000))
    && (r.mode === undefined || ['rules', 'rules-scripted', 'structured-mock', 'abstention-first'].includes(r.mode))
}
export function enableUnderstanding(db: DatabaseSync) {
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS understanding_proposal (
      id TEXT NOT NULL PRIMARY KEY, task TEXT NOT NULL, supersession TEXT NOT NULL, body TEXT NOT NULL, hash TEXT NOT NULL
    ) STRICT;
    CREATE INDEX IF NOT EXISTS understanding_by_task ON understanding_proposal(task);
    CREATE INDEX IF NOT EXISTS understanding_by_source ON understanding_proposal(supersession);
    CREATE TABLE IF NOT EXISTS understanding_review (
      id TEXT PRIMARY KEY REFERENCES understanding_proposal(id), body TEXT NOT NULL, hash TEXT NOT NULL
    ) STRICT, WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS understanding_applied (
      supersession TEXT PRIMARY KEY, id TEXT NOT NULL REFERENCES understanding_review(id)
    ) STRICT, WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS understanding_cursor (
      task TEXT PRIMARY KEY, through INTEGER NOT NULL CHECK(through > 0)
    ) STRICT, WITHOUT ROWID;
    COMMIT;`)
}
