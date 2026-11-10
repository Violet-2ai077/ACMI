import type { RankedTaskCandidate, RuntimeSessionRef, WorkspaceScope } from '@acmi/contracts'
import { canonical, isTaskId, makeQualificationEvidence, type TaskCandidateIndex, wellFormedQualificationText } from '@acmi/core'
import type { LocalGraphStore } from './graph-store.ts'
import { continuityDigest as sha } from './local-digest.ts'
import { runQualificationEvaluation, type QualificationEvaluation, type QualificationMode, type QualificationTurn } from './qualification-evaluation.ts'
import { offlineQualificationAdapter } from './qualification-mocks.ts'

export interface DshQualificationShadowOptions {
  readonly enabled: boolean
  readonly synthetic: boolean
  readonly store: Pick<LocalGraphStore, 'workspaceId' | 'permits' | 'cursor' | 'factAt' | 'read' | 'previewQualification'>
  readonly scope: WorkspaceScope
  readonly session: RuntimeSessionRef
  readonly taskId: string
  readonly from: number
  readonly maxFacts?: number
  readonly catalog: Pick<TaskCandidateIndex, 'retrieve'>
  readonly authorize: (session: RuntimeSessionRef, taskId: string) => boolean
  readonly excerpt?: (factId: string) => string | undefined
  readonly modes?: readonly QualificationMode[]
  readonly signal?: AbortSignal
}
type ShadowResult = { readonly status: 'disabled' | 'unavailable' | 'stale' | 'idle' }
  | { readonly status: 'evaluated'; readonly sourceRevision: string; readonly next: number; readonly facts: number;
      readonly candidates: readonly RankedTaskCandidate[]; readonly evaluations: readonly QualificationEvaluation[] }

/** Call after a trusted Supervisor drain. Reads only bounded committed facts; never submits to the proposal inbox. */
export async function runDshQualificationShadow(options: DshQualificationShadowOptions): Promise<ShadowResult> {
  if (options.enabled !== true || options.synthetic !== true) return { status: 'disabled' }
  const { store, scope, session, taskId } = options
  const allowed = () => {
    try {
      return !options.signal?.aborted && session.adapterId === 'dsh' && session.instanceId === store.workspaceId && isTaskId(taskId)
        && store.permits(scope) && options.authorize(session, taskId)
    } catch { return false }
  }
  if (!allowed()) return { status: 'unavailable' }
  const max = options.maxFacts ?? 32
  const modes = options.modes ?? ['rules', 'scripted', 'structured', 'abstention-first']
  if (!Number.isSafeInteger(options.from) || options.from < 0 || !Number.isSafeInteger(max) || max < 1 || max > 32
    || modes.length < 1 || modes.length > 5 || new Set(modes).size !== modes.length
    || modes.some(m => !['rules', 'scripted', 'adversarial', 'structured', 'abstention-first'].includes(m))) throw new TypeError('Invalid shadow limits')
  const cursor = store.cursor(scope, session)
  const cut = store.read(scope, taskId)
  if (!cursor || !cut || options.from > cursor.next) return { status: 'unavailable' }
  if (options.from === cursor.next) return { status: 'idle' }
  const next = Math.min(cursor.next, options.from + max)
  const facts = []
  const dialogue: QualificationTurn[] = []
  const evidence = []
  for (let seq = options.from; seq < next; seq++) {
    const row = store.factAt(scope, session, seq)
    if (!row || row.fact.source.sourceRevision !== cursor.sourceRevision) continue
    if (row.attribution.kind === 'assigned' && row.attribution.taskId !== taskId) continue
    facts.push(row)
    const kind = row.fact.detail.kind
    const actor = kind === 'user' ? 'user' : kind === 'assistant' ? 'assistant' : kind === 'tool-result' ? 'tool' : undefined
    const excerpt = actor ? options.excerpt?.(row.fact.eventId) : undefined
    if (actor && wellFormedQualificationText(excerpt, 1024)) dialogue.push({ actor, text: excerpt })
    else if (actor) dialogue.push({ actor, text: '' })
    const proof = makeQualificationEvidence(row, taskId, sha, { generation: 1,
      ...(wellFormedQualificationText(excerpt, 1024) ? { excerpt } : {}) })
    if (proof) evidence.push(proof)
  }
  const query = [...dialogue].reverse().find(t => t.actor === 'user' && t.text)?.text
  const currentTaskId = cursor.taskId ?? taskId
  const candidates = options.catalog.retrieve(scope, { session, currentTaskId, ...(query ? { query } : {}) })
  const evaluations: QualificationEvaluation[] = []
  for (const mode of modes) {
    if (!allowed()) return { status: 'unavailable' }
    evaluations.push(await runQualificationEvaluation(offlineQualificationAdapter(mode), {
      synthetic: true, workspaceId: store.workspaceId, dialogue, cut, facts, evidence,
      candidates: candidates.candidates, candidateRevision: candidates.revision, currentTaskId,
      preview: (changes, anchor) => store.previewQualification(scope, taskId, cut.revision, changes, anchor.source),
    }, options.signal ? { signal: options.signal } : {}))
  }
  if (!allowed()) return { status: 'unavailable' }
  if (store.read(scope, taskId)?.revision !== cut.revision || store.cursor(scope, session)?.next !== cursor.next) return { status: 'stale' }
  return { status: 'evaluated', sourceRevision: sha(canonical([session, cursor.sourceRevision ?? null, options.from, next,
    facts.map(r => r.fact.eventId)])), next, facts: facts.length, candidates: candidates.candidates, evaluations }
}
