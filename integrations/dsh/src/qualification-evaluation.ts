import { performance } from 'node:perf_hooks'
import type { GraphChange, GraphStreamCut, GroundingVerdict, QualificationEvidence, QualificationEvidenceLink,
  RankedTaskCandidate, StoredRuntimeFact, UnderstandingIntent } from '@acmi/contracts'
import { buildUnderstandingPacket, canonical, compileUnderstandingOperations, estimateContextTokens, exactFields, isTaskId,
  parseUnderstandingOutput, qualificationHex, understandingOutputSchema, understandingTopologyRisk,
  validateGroundedChange, validateRuntimeFact, wellFormedQualificationText, type UnderstandingOperation } from '@acmi/core'
import { continuityDigest as sha } from './local-digest.ts'
import { validQualificationLink } from './qualification-store.ts'

const kinds = ['continue_current', 'switch_existing', 'create_new', 'no_task', 'uncertain'] as const
type Intent = UnderstandingIntent['kind']
export type QualificationMode = 'rules' | 'scripted' | 'adversarial' | 'structured' | 'abstention-first'
export interface QualificationTurn {
  readonly actor: 'user' | 'assistant' | 'tool' | 'subagent'
  readonly text: string
}
export interface QualificationHostInput {
  readonly synthetic: true
  readonly workspaceId: string
  readonly dialogue: readonly QualificationTurn[]
  readonly candidates: readonly RankedTaskCandidate[]
  readonly currentTaskId?: string
  readonly candidateRevision?: string
  readonly cut?: GraphStreamCut
  readonly facts?: readonly StoredRuntimeFact[]
  readonly evidence?: readonly QualificationEvidence[]
  /** Trusted read-only check using the actual projection reducer; no writer crosses the adapter boundary. */
  readonly preview?: (changes: readonly GraphChange[], evidence: QualificationEvidence) => string | null
}
type PacketTurn = { readonly id: string; readonly actor: QualificationTurn['actor']; readonly text?: string; readonly truncated?: true }
export interface QualificationPacket {
  readonly version: 'qualification-input-v1'
  readonly graphRevision: string
  readonly sourceRevision: string
  readonly candidateRevision: string
  readonly currentTaskId: string | null
  readonly candidates: readonly { readonly taskId: string; readonly title: string; readonly objective: string }[]
  readonly dialogue: readonly PacketTurn[]
  readonly omittedTurns: number
  readonly evidence: readonly { readonly link: QualificationEvidenceLink; readonly actor: QualificationEvidence['actor'];
    readonly detailKind: QualificationEvidence['detailKind'] }[]
  readonly nodes: readonly { readonly id: string; readonly title: string; readonly state: string }[]
}
export interface QualificationUsage {
  readonly inputTokens: number | null
  readonly outputTokens: number | null
  readonly cost: number | null
  readonly currency: string | null
}
export interface QualificationAdapter {
  readonly metadata: { readonly provider: 'offline'; readonly name: string; readonly mode: QualificationMode }
  readonly respond: (request: { readonly packet: QualificationPacket; readonly systemPromptVersion: string;
    readonly developerPromptVersion: string; readonly outputSchema: typeof qualificationOutputSchema }, signal: AbortSignal) =>
    string | { readonly text: string; readonly usage?: QualificationUsage } | Promise<string | { readonly text: string; readonly usage?: QualificationUsage }>
}
export interface QualificationEvalOptions {
  readonly timeoutMs?: number
  readonly retries?: number
  readonly signal?: AbortSignal
  readonly budget?: number
  /** Reserved feature flag. Phase 0.9.1 has no Provider transport, even with this flag set. */
  readonly enableProviderTransport?: false
}
type Response = {
  readonly version: 'qualification-output-v1'
  readonly graphRevision: string
  readonly sourceRevision: string
  readonly candidateRevision: string
  readonly intent: Intent
  readonly taskId: string | null
  readonly userEvidence: string | null
  readonly operations: readonly { readonly operation: UnderstandingOperation; readonly evidence: QualificationEvidenceLink }[]
}
export interface QualificationEvaluation {
  readonly status: 'evaluated' | 'failed'
  readonly mode: QualificationMode
  readonly model: string
  readonly provider: 'offline'
  readonly provenance: 'deterministic_rules' | 'scripted_not_model_output'
  readonly systemPromptVersion: string
  readonly developerPromptVersion: string
  readonly realProviderRequests: 0
  readonly responseHash: string | null
  readonly usage: QualificationUsage
  readonly attempts: number
  readonly elapsedMs: number
  readonly packetUnits: number
  readonly omittedTurns: number
  readonly error?: string
  readonly prediction?: { readonly intent: Intent; readonly taskId: string | null; readonly operationKinds: readonly string[];
    readonly claims: readonly string[] }
  readonly guard: { readonly status: 'qualified' | 'withheld'; readonly reasons: readonly string[];
    readonly changes: readonly GraphChange[]; readonly evidence: readonly GroundingVerdict[] }
}
const hexSchema = { type: 'string', pattern: '^[a-f0-9]{64}$' }
const nullableHex = { anyOf: [hexSchema, { type: 'null' }] }
const linkSchema = { type: 'object', additionalProperties: false, required: ['factId', 'sourceRevision', 'evidenceRevision', 'excerptHash'],
  properties: { factId: hexSchema, sourceRevision: { type: 'string', minLength: 1, maxLength: 1024 }, evidenceRevision: hexSchema,
    excerptHash: nullableHex } }
const responseFields = ['version', 'graphRevision', 'sourceRevision', 'candidateRevision', 'intent', 'taskId', 'userEvidence', 'operations']
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) deepFreeze(nested)
    Object.freeze(value)
  }
  return value
}
export const qualificationOutputSchema = deepFreeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'object', additionalProperties: false,
  required: responseFields,
  properties: { version: { const: 'qualification-output-v1' }, graphRevision: hexSchema, sourceRevision: hexSchema, candidateRevision: hexSchema,
    intent: { enum: kinds }, taskId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] }, userEvidence: nullableHex,
    operations: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false, required: ['operation', 'evidence'],
      properties: { operation: understandingOutputSchema.items, evidence: linkSchema } } } },
})
const systemPromptVersion = 'q91-offline-task-intent-v1'
const developerPromptVersion = 'q91-closed-evidence-json-v1'
const maxOutput = 8192
const claimLabel = (op: UnderstandingOperation) => op.kind === 'decision' ? 'decision-' + op.state
  : op.kind === 'result-review' ? 'result-' + op.stage : op.kind === 'work-result' ? 'result-observed' : op.kind
const nullUsage: QualificationUsage = Object.freeze({ inputTokens: null, outputTokens: null, cost: null, currency: null })
const safeInt = (v: number, lo: number, hi: number) => Number.isSafeInteger(v) && v >= lo && v <= hi
const asciiKey = (id: unknown) => typeof id === 'string' && /^[A-Za-z0-9_.:-]{1,96}$/u.test(id)

function readResponse(raw: string): { response?: Response; error?: string } {
  if (typeof raw !== 'string' || raw.length > maxOutput) return { error: 'output-limit' }
  if (/[\ud800-\udfff]/u.test(raw)) return { error: 'malformed-unicode' }
  let value: unknown
  try { value = JSON.parse(raw) } catch { return { error: 'invalid-json' } }
  const pending = [value]
  while (pending.length) {
    const v = pending.pop()
    if (typeof v === 'string' && /[\ud800-\udfff]/u.test(v)) return { error: 'malformed-unicode' }
    if (v && typeof v === 'object') pending.push(...Object.values(v))
  }
  if (!exactFields(value, responseFields) || value.version !== 'qualification-output-v1'
    || !qualificationHex(value.graphRevision) || !qualificationHex(value.sourceRevision) || !qualificationHex(value.candidateRevision)
    || !kinds.some(k => k === value.intent) || value.taskId !== null && typeof value.taskId !== 'string'
    || value.userEvidence !== null && !qualificationHex(value.userEvidence)
    || !Array.isArray(value.operations) || value.operations.length > 8) return { error: 'schema' }
  const ops = value.operations
  if (ops.some(o => !exactFields(o, ['operation', 'evidence']) || !validQualificationLink(o.evidence))
    || !parseUnderstandingOutput(JSON.stringify(ops.map(o => o.operation)))) return { error: 'schema' }
  return { response: value as unknown as Response }
}
const linkFor = (e: QualificationEvidence): QualificationEvidenceLink => ({
  factId: e.factId, sourceRevision: e.source.sourceRevision, evidenceRevision: e.revision, excerptHash: e.excerpt?.hash ?? null,
})
function buildPacket(input: QualificationHostInput, budget: number): QualificationPacket | null {
  if (input.synthetic !== true || !wellFormedQualificationText(input.workspaceId, 512) || input.candidates.length > 8
    || input.cut && input.cut.workspaceId !== input.workspaceId) throw new TypeError('Invalid synthetic evaluation input')
  const candidates = input.candidates.filter(c => c.workspaceId === input.workspaceId && c.status === 'open' && c.access === 'allowed'
    && isTaskId(c.taskId) && wellFormedQualificationText(c.title, 160) && wellFormedQualificationText(c.objective, 512))
    .map(({ taskId, title, objective }) => ({ taskId, title, objective }))
  if (new Set(candidates.map(c => c.taskId)).size !== candidates.length) throw new TypeError('Duplicate candidate')
  const rows = input.dialogue.slice(-16)
  const dialogue: PacketTurn[] = rows.map(({ actor, text }, i) => {
    if (!['user', 'assistant', 'tool', 'subagent'].includes(actor)) throw new TypeError('Unknown dialogue actor')
    const bounded = text.slice(0, 1024)
    const content = ['user', 'assistant'].includes(actor) && wellFormedQualificationText(bounded, 1024) ? bounded : undefined
    const truncated = content !== undefined && text.length > content.length
    return { id: sha(canonical([input.workspaceId, input.dialogue.length - rows.length + i, actor, content ?? null, truncated])),
      actor, ...(content !== undefined ? { text: content } : {}), ...(truncated ? { truncated: true as const } : {}) }
  })
  const cut = input.cut
  const evidence = (input.evidence ?? []).slice(-16).filter(e => e.workspaceId === input.workspaceId
    && !e.revoked && cut?.snapshot.taskId === e.taskId)
    .map(e => ({ link: linkFor(e), actor: e.actor, detailKind: e.detailKind }))
  const nodes = (cut?.snapshot.nodes.slice(-24) ?? []).map(({ id, title, state }) => ({ id, title, state }))
  const body = { version: 'qualification-input-v1', graphRevision: cut?.revision ?? sha('no-graph'),
    sourceRevision: sha(canonical([input.workspaceId, dialogue, evidence])),
    candidateRevision: input.candidateRevision && qualificationHex(input.candidateRevision)
      ? input.candidateRevision : sha(canonical(candidates)),
    currentTaskId: candidates.some(c => c.taskId === input.currentTaskId) ? input.currentTaskId! : null,
    candidates, evidence, nodes } as const
  while (true) {
    const packet = { ...body, dialogue: [...dialogue], omittedTurns: input.dialogue.length - dialogue.length }
    if (estimateContextTokens(canonical(packet)) + 192 <= budget) return deepFreeze(packet)
    if (dialogue.length <= 1) return null
    dialogue.shift()
  }
}
const routeAmbiguity = /[?\uff1f]|\b(?:or|maybe|which|might|not sure|do not|don't)\b|\u8fd8\u662f|\u53ef\u80fd|\u4e0d\u786e\u5b9a/iu
const separateWork = /\b(?:new|separate|unrelated|different)\s+(?:task|ticket|issue|workstream|request|goal|objective)\b|\u5355\u72ec|\u53e6\u5f00|\u65b0\u4efb\u52a1|\u53e6\u4e00\u4ef6/iu
const routeText = (text: string) => text.normalize('NFKC').trim().replace(/[.!\u3002\uff01]$/u, '').trim().toLowerCase()
function explicitRoute(packet: QualificationPacket, input: string): string | undefined {
  if (routeAmbiguity.test(input)) return undefined
  const text = routeText(input)
  const named = /^(?:(?:please )?(?:switch to|return to|resume|back to|continue|pick up|revisit)\s+|(?:\u56de\u5230|\u5207\u6362\u5230|\u63a5\u7740|\u7ee7\u7eed|\u6062\u590d)\s*)(.+)$/u.exec(text)?.[1]
  if (!named) return undefined
  const exact = packet.candidates.filter(c => c.taskId === named || routeText(c.title) === named)
  return exact.length === 1 ? exact[0]!.taskId : undefined
}
function validateResponse(input: QualificationHostInput, packet: QualificationPacket, response: Response): QualificationEvaluation['guard'] {
  const reasons: string[] = []
  const proof: GroundingVerdict[] = []
  const changes: GraphChange[] = []
  const currentUser = [...packet.dialogue].reverse().find(t => t.actor === 'user' && t.text)
  const expectedUser = currentUser?.id ?? null
  if (response.graphRevision !== packet.graphRevision || response.sourceRevision !== packet.sourceRevision
    || response.candidateRevision !== packet.candidateRevision) reasons.push('stale-revision')
  const selecting = response.intent === 'switch_existing' || response.intent === 'continue_current'
  const candidate = packet.candidates.find(c => c.taskId === response.taskId)
  if (selecting && !candidate || !selecting && response.taskId !== null) reasons.push('unauthorized-task-id')
  if (response.intent !== 'uncertain' && (response.userEvidence !== expectedUser || !currentUser || currentUser.truncated)) {
    reasons.push('user-evidence-unavailable')
  }
  if (response.intent === 'continue_current' && response.taskId !== packet.currentTaskId
    || response.intent === 'switch_existing' && response.taskId === packet.currentTaskId) reasons.push('binding-intent-mismatch')
  if (response.intent === 'switch_existing' && candidate && currentUser?.text) {
    if (explicitRoute(packet, currentUser.text) !== candidate.taskId) reasons.push('task-reference-not-explicit')
  }
  if (response.intent === 'continue_current' && candidate && currentUser?.text) {
    const text = routeText(currentUser.text)
    if (routeAmbiguity.test(text) || separateWork.test(text)
      || !/^(?:continue(?: current(?: task)?)?(?:[.!]$|$|:)|split into:|parallel:|\u62c6\u5206:|\u7ee7\u7eed[.!\u3002]?$)/u.test(text)
        && explicitRoute(packet, currentUser.text) !== candidate.taskId) {
      reasons.push('continuation-not-explicit')
    }
  }
  if (response.intent === 'create_new' && currentUser?.text
    && (!/^(?:new (?:task|objective|issue)|separate task|\u65b0\u4efb\u52a1|\u53e6\u5f00)\s*:\s*\S/iu.test(currentUser.text.normalize('NFKC'))
      || routeAmbiguity.test(currentUser.text))) {
    reasons.push('new-task-goal-not-explicit')
  }
  if (response.operations.length) {
    const cut = input.cut
    const taskId = cut?.snapshot.taskId
    if (!cut || !taskId || (response.intent !== 'continue_current' && response.intent !== 'uncertain')) {
      reasons.push('graph-task-not-authorized')
    } else {
      const first = response.operations[0]!.evidence
      const boundedFacts = (input.facts ?? []).slice(-32).filter(r => validateRuntimeFact(r.fact, input.workspaceId, sha)
        && r.fact.source.session.instanceId === input.workspaceId)
      const latestUserFact = [...boundedFacts].reverse().find(r => r.fact.detail.kind === 'user')
      const facts = boundedFacts.filter(r => r.attribution.kind === 'assigned' && r.attribution.taskId === taskId)
      const row = facts.find(r => r.fact.eventId === first.factId)
      const record = (input.evidence ?? []).slice(-16).find(e => e.factId === first.factId && e.taskId === taskId && e.workspaceId === input.workspaceId)
      const stable = row && record && canonical(row.fact.source) === canonical(record.source)
      if (!stable || !packet.evidence.some(e => canonical(e.link) === canonical(first))
        || response.operations.some(o => canonical(o.evidence) !== canonical(first))) reasons.push('evidence-link-invalid')
      else if (record?.actor === 'user' && (latestUserFact?.fact.eventId !== first.factId || currentUser?.truncated
        || currentUser?.text !== record.excerpt?.text)) reasons.push('user-evidence-superseded-or-unavailable')
      else if (row && record) {
        const text = record.actor === 'user' ? record.excerpt?.text : undefined
        const visible = buildUnderstandingPacket({ cut, candidates: [], facts, anchorId: row.fact.eventId, now: 0, ttlMs: 1, budget: 32768,
          ...(text && !/[\x00-\x1f\x7f]/u.test(text) ? { user: { provenance: 'synthetic_host_excerpt', evidenceId: row.fact.eventId, text } } : {}) }, sha)
        if (!visible) reasons.push('graph-budget')
        else {
          const allocate = (slot: string) => slot.startsWith('native:') ? 'native:' + sha(canonical([
            JSON.stringify([row.fact.source.session.adapterId, row.fact.source.session.instanceId, row.fact.source.session.sessionId,
              row.fact.source.session.incarnation]), slot.slice(7)]))
            : 'q91:' + sha(canonical([cut.revision, first.factId, slot])).slice(0, 32)
          const compiled = compileUnderstandingOperations(response.operations.map(o => o.operation), cut.snapshot, visible, row.fact, allocate)
          reasons.push(...compiled.unresolved)
          const activeNodeId = cut.snapshot.activeNodeId
          for (const change of compiled.changes) {
            proof.push(validateGroundedChange({ workspaceId: input.workspaceId, taskId, change, batch: compiled.changes,
              evidence: record, link: first, ...(activeNodeId ? { activeNodeId } : {}) }, sha))
          }
          for (const verdict of proof) if (verdict.status !== 'supported') reasons.push(verdict.reason)
          const topology = understandingTopologyRisk(cut.snapshot, compiled.changes)
          if (topology) reasons.push(topology)
          if (compiled.changes.length) {
            const risk = input.preview ? input.preview(deepFreeze(compiled.changes), record) : 'projection-preview-required'
            if (risk) reasons.push(risk)
          }
          changes.push(...compiled.changes)
        }
      }
    }
  }
  return { status: reasons.length ? 'withheld' : 'qualified', reasons: [...new Set(reasons)],
    changes: reasons.length ? [] : changes, evidence: proof }
}

export class RetryableQualificationError extends Error {}
class Stopped extends Error {
  constructor(readonly code: 'timeout' | 'cancelled') { super(code) }
}
async function attempt<T>(run: (signal: AbortSignal) => T | Promise<T>, ms: number, external?: AbortSignal): Promise<T> {
  if (external?.aborted) throw new Stopped('cancelled')
  const ctrl = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  try {
    const stop = new Promise<never>((_, reject) => {
      const halt = (code: 'timeout' | 'cancelled') => { ctrl.abort(); reject(new Stopped(code)) }
      timer = setTimeout(() => halt('timeout'), ms)
      onAbort = () => halt('cancelled')
      external?.addEventListener('abort', onAbort, { once: true })
    })
    const value = await Promise.race([Promise.resolve().then(() => run(ctrl.signal)), stop])
    if (ctrl.signal.aborted) throw new Stopped(external?.aborted ? 'cancelled' : 'timeout')
    return value
  } finally {
    clearTimeout(timer)
    if (onAbort) external?.removeEventListener('abort', onAbort)
  }
}
function readUsage(raw: unknown): QualificationUsage {
  if (!exactFields(raw, ['inputTokens', 'outputTokens', 'cost', 'currency'])) return nullUsage
  const tokens = (n: unknown) => typeof n === 'number' && safeInt(n, 0, 100_000_000) ? n : null
  const currency = typeof raw.currency === 'string' && /^[A-Z]{3}$/u.test(raw.currency) ? raw.currency : null
  const cost = currency && typeof raw.cost === 'number' && Number.isFinite(raw.cost) && raw.cost >= 0 ? raw.cost : null
  return { inputTokens: tokens(raw.inputTokens), outputTokens: tokens(raw.outputTokens), cost, currency: cost === null ? null : currency }
}

/** Offline only. A provider-marked adapter is rejected before its callback can run. */
export async function runQualificationEvaluation(adapter: QualificationAdapter, input: QualificationHostInput,
  options: QualificationEvalOptions = {},
): Promise<QualificationEvaluation> {
  const { metadata } = adapter
  if (metadata.provider !== 'offline' || (options.enableProviderTransport !== undefined && options.enableProviderTransport !== false)) {
    throw new TypeError('Qualification is offline-only')
  }
  if (!asciiKey(metadata.name) || !['rules', 'scripted', 'adversarial', 'structured', 'abstention-first'].includes(metadata.mode)) {
    throw new TypeError('Invalid offline adapter metadata')
  }
  const budget = options.budget ?? 8192, timeout = options.timeoutMs ?? 1000, retries = options.retries ?? 0
  if (!safeInt(budget, 128, 32768) || !safeInt(timeout, 5, 10_000) || !safeInt(retries, 0, 2)) throw new RangeError('Invalid evaluation budget')
  const start = performance.now()
  const packet = buildPacket(input, budget)
  let attempts = 0
  let responseHash: string | null = null
  let usage = nullUsage
  const receipt = () => ({ mode: metadata.mode, model: metadata.name, provider: 'offline' as const,
    provenance: ['rules', 'abstention-first'].includes(metadata.mode) ? 'deterministic_rules' as const : 'scripted_not_model_output' as const,
    systemPromptVersion, developerPromptVersion, realProviderRequests: 0 as const, responseHash, usage, attempts,
    elapsedMs: performance.now() - start, packetUnits: packet ? estimateContextTokens(canonical(packet)) + 192 : 0,
    omittedTurns: packet?.omittedTurns ?? input.dialogue.length })
  const fail = (error: string): QualificationEvaluation => ({ ...receipt(), status: 'failed', error,
    guard: { status: 'withheld', reasons: [error], changes: [], evidence: [] } })
  if (options.signal?.aborted) return fail('cancelled')
  if (!packet) return fail('input-budget')
  while (attempts <= retries) {
    try {
      attempts++
      const returned = await attempt(signal => adapter.respond({ packet, systemPromptVersion, developerPromptVersion,
        outputSchema: qualificationOutputSchema }, signal), timeout, options.signal)
      const raw = typeof returned === 'string' ? returned : returned?.text
      if (typeof raw === 'string' && raw.length <= maxOutput && !/[\ud800-\udfff]/u.test(raw)) responseHash = sha(raw)
      if (typeof returned === 'object' && returned) usage = readUsage(returned.usage)
      const { response, error } = readResponse(raw)
      if (!response) return fail(error ?? 'schema')
      const guard = validateResponse(input, packet, response)
      return { ...receipt(), status: 'evaluated',
        prediction: { intent: response.intent, taskId: response.taskId, operationKinds: response.operations.map(o => o.operation.kind),
          claims: response.operations.map(o => claimLabel(o.operation)) }, guard }
    } catch (error) {
      if (error instanceof Stopped) return fail(error.code)
      if (!(error instanceof RetryableQualificationError) || attempts > retries) return fail('adapter-error')
    }
  }
  return fail('adapter-error')
}
