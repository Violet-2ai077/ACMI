import type { DatabaseSync } from 'node:sqlite'
import type { QualificationEvidence, QualificationEvidenceLink } from '@acmi/contracts'
import { boundedText, exactFields, isTaskId, qualificationExcerptLimit, qualificationHex, wellFormedQualificationText } from '@acmi/core'

export interface QualificationSourceCommand {
  readonly synthetic: true
  readonly taskId: string
  readonly factId: string
  readonly expectedRevision: string | null
  readonly excerpt?: string
  readonly start?: number
  readonly totalLength?: number
  readonly revoke?: true
  readonly hostConfirmation?: QualificationEvidence['hostConfirmation']
}
export function validQualificationLink(value: unknown): value is QualificationEvidenceLink {
  return exactFields(value, ['factId', 'sourceRevision', 'evidenceRevision', 'excerptHash']) && qualificationHex(value.factId)
    && boundedText(value.sourceRevision, 1024) && qualificationHex(value.evidenceRevision)
    && (value.excerptHash === null || qualificationHex(value.excerptHash))
}
export function validQualificationSource(cmd: QualificationSourceCommand): boolean {
  return exactFields(cmd, ['synthetic', 'taskId', 'factId', 'expectedRevision', 'excerpt', 'start', 'totalLength', 'revoke', 'hostConfirmation'])
    && cmd.synthetic === true && isTaskId(cmd.taskId) && qualificationHex(cmd.factId)
    && (cmd.expectedRevision === null || qualificationHex(cmd.expectedRevision))
    && (cmd.revoke === undefined || cmd.revoke === true && cmd.expectedRevision !== null
      && cmd.excerpt === undefined && cmd.start === undefined && cmd.totalLength === undefined && cmd.hostConfirmation === undefined)
    && (cmd.excerpt === undefined ? cmd.start === undefined && cmd.totalLength === undefined
      : wellFormedQualificationText(cmd.excerpt, qualificationExcerptLimit))
    && (cmd.hostConfirmation === undefined || exactFields(cmd.hostConfirmation, ['reviewerId', 'reason', 'claimHash']))
}
export function enableQualification(db: DatabaseSync): void {
  db.exec(`BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS qualification_source (
      fact TEXT NOT NULL, generation INTEGER NOT NULL CHECK (generation>0),
      body TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY(fact,generation)
    ) STRICT, WITHOUT ROWID;
    COMMIT;`)
}
