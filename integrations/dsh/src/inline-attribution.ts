import { z } from 'zod'

const string = z.string().min(1).max(512)
const key = z.enum(['amber', 'indigo'])
const action = z.strictObject({ ref: z.string().regex(/^a[12]$/u), key, task: string, work: string })
const evidence = z.strictObject({ source: z.enum(['current', 'prior']), quote: z.string().min(1).max(160) })
const meta = z.strictObject({
  version: z.literal(1), generation_ref: string, source_user_turn_ref: string,
  user: string, response: string, work: string, support: z.enum(['sufficient', 'ambiguous', 'insufficient']),
  related: z.array(string).max(3), evidence: z.array(evidence).max(2).optional(),
  proposal: z.strictObject({ local_ref: z.string().regex(/^p[0-9]{1,3}$/u), objective: z.string().min(1).max(160) }).optional(),
})
const inline = z.strictObject({ assistant_response: string, acmi_attribution: meta, actions: z.array(action).max(2).optional() })
const baseline = z.strictObject({ assistant_response: string, actions: z.array(z.strictObject({ key })).max(2).optional() })
const posthoc = z.strictObject({ acmi_attribution: meta })

interface Candidate {
  readonly handle: string
  readonly workHandle: string
  readonly taskId: string
  readonly workId: string
  readonly workspace: string
  readonly revision: number
}

interface Cut {
  readonly generation: string
  readonly turnRef: string
  readonly workspace: string
  readonly revision: number
  readonly candidates: readonly Candidate[]
  readonly current: string
  readonly prior: string | null
  readonly toolAvailable: boolean
  readonly binding?: string
}

const special = new Set(['no_task', 'unresolved', 'new'])
const privateForm = /(?:acmi[\s_.-]*attribution|(?:generation|source[\s_.-]*user[\s_.-]*turn)[\s_.-]*ref|assistant[\s_.-]*response|(?:^|[^a-z0-9])[ghuw]_[0-9a-f]{8,}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})/iu

function safeText(text: string, cut: Cut) {
  const normalized = text.normalize('NFKC').toLowerCase()
  const privateValues = [cut.generation, cut.turnRef, ...cut.candidates.flatMap(c => [c.handle, c.workHandle, c.taskId, c.workId])]
  if (!normalized.trim() || /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(normalized)
    || privateForm.test(normalized) || privateValues.some(v => normalized.includes(v.toLowerCase()))) {
    throw new Error('METADATA_ECHO_OR_UNSAFE_TEXT')
  }
  return text
}

function parse(raw: string) {
  if (Buffer.byteLength(raw, 'utf8') > 8192) throw new Error('ENVELOPE_TOO_LARGE')
  try {
    const value: unknown = JSON.parse(raw)
    // Preserve spaces inside strings; canonical JSON rejects duplicate keys and alternate escapes.
    const compact = raw.replace(/"(?:[^"\\]|\\[\s\S])*"|[\t\r\n ]+/gu, s => s.startsWith('"') ? s : '')
    if (JSON.stringify(value) !== compact) throw new Error('non-canonical')
    return value
  } catch {
    throw new Error('MALFORMED_ENVELOPE')
  }
}

function selection(task: string, work: string | null, catalog: ReadonlyMap<string, Candidate>) {
  if (special.has(task)) {
    if (work !== null && work !== '-') throw new Error('WORK_TASK_MISMATCH')
    return { task, work: null }
  }
  const c = catalog.get(task)
  if (!c) throw new Error('UNKNOWN_TASK_HANDLE')
  if (work !== null && c.workHandle !== work) throw new Error('WORK_TASK_MISMATCH')
  return { task: c.taskId, work: c.workId }
}

function project(m: z.infer<typeof meta>, cut: Cut, catalog: ReadonlyMap<string, Candidate>) {
  if (m.generation_ref !== cut.generation || m.source_user_turn_ref !== cut.turnRef) throw new Error('GENERATION_OR_TURN')
  const user = selection(m.user, m.work, catalog)
  const response = selection(m.response, null, catalog)
  if (new Set(m.related).size !== m.related.length || m.related.includes(m.user) || m.related.some(ref => !catalog.has(ref))) {
    throw new Error('RELATED_SCOPE')
  }
  if ((m.user === 'new' || m.response === 'new') !== Boolean(m.proposal)) throw new Error('PROPOSAL_MISMATCH')
  if (m.proposal) safeText(m.proposal.objective, cut)
  const spans = (m.evidence ?? []).map(({ source, quote }) => {
    const text = source === 'current' ? cut.current : cut.prior
    const start = text?.indexOf(quote) ?? -1
    if (start === -1 || text?.lastIndexOf(quote) !== start
      || /^[\udc00-\udfff]|[\ud800-\udbff]$/u.test(quote)) throw new Error('EVIDENCE_SOURCE_OR_SPAN')
    return { source, start, end: start + quote.length }
  })
  return Object.freeze({ status: 'model_attribution_proposed' as const, generation: cut.generation, sourceUserTurn: cut.turnRef,
    user: user.task, response: response.task, work: user.work, support: m.support,
    related: m.related.map(h => selection(h, null, catalog).task), evidence: spans, temporary: m.proposal ?? null })
}

interface Action {
  readonly ref: string
  readonly key: z.infer<typeof key>
  readonly task: string
  readonly work: string | null
}

export function decodeInline(raw: string, stop: string, arm: 'A' | 'B' | 'C', cut: Cut) {
  if (stop !== 'eos' && stop !== 'word') throw new Error('TRUNCATED_OR_UNFINISHED')
  const catalog = new Map(cut.candidates.map(c => [c.handle, c]))
  if (cut.candidates.length > 8 || catalog.size !== cut.candidates.length
    || new Set(cut.candidates.map(c => c.workHandle)).size !== cut.candidates.length
    || cut.candidates.some(c => c.workspace !== cut.workspace || c.revision !== cut.revision)) throw new Error('STALE_OR_SCOPE')
  const rawValue = parse(raw)
  if (arm === 'A') {
    const value = baseline.safeParse(rawValue)
    if (!value.success || cut.toolAvailable !== (value.data.actions !== undefined)) throw new Error('BASELINE_SCHEMA')
    const inherited = cut.binding ? selection(cut.binding, null, catalog) : { task: 'unresolved', work: null }
    const actions: Action[] = (value.data.actions ?? []).map((a, i) => ({ ...a, ref: 'a' + (i + 1), ...inherited }))
    if (new Set(actions.map(a => a.key)).size !== actions.length) throw new Error('DUPLICATE_ACTION')
    return { answer: safeText(value.data.assistant_response, cut), proposal: null, inherited, actions }
  }
  if (arm === 'C') {
    const value = posthoc.safeParse(rawValue)
    if (!value.success) throw new Error('POSTHOC_SCHEMA')
    return { answer: null, proposal: project(value.data.acmi_attribution, cut, catalog), inherited: null, actions: [] }
  }
  const value = inline.safeParse(rawValue)
  if (!value.success || cut.toolAvailable !== (value.data.actions !== undefined)) throw new Error('INLINE_SCHEMA')
  const answer = safeText(value.data.assistant_response, cut)
  const proposal = project(value.data.acmi_attribution, cut, catalog)
  const actions: Action[] = (value.data.actions ?? []).map(a => {
    if (a.task === 'new' || a.task === 'no_task') throw new Error('ACTION_UNRESOLVED_REQUIRED')
    return { ref: a.ref, key: a.key, ...selection(a.task, a.work, catalog) }
  })
  if (new Set(actions.map(a => a.ref)).size !== actions.length || new Set(actions.map(a => a.key)).size !== actions.length) {
    throw new Error('DUPLICATE_ACTION')
  }
  return { answer, proposal, inherited: null, actions }
}

interface Origin {
  readonly workspace: string
  readonly session: string
  readonly callId: string
}

interface Call extends Origin {
  readonly generation: string
  readonly ref: string
  readonly task: string
  readonly work: string | null
  readonly execution: string
  readonly causation: string
}

const callKey = (o: Origin) => JSON.stringify([o.workspace, o.session, o.callId])
const childKey = (workspace: string, execution: string) => JSON.stringify([workspace, execution])

// Experimental append-only correlation, with no graph or binding write API.
export class CausalAttribution {
  readonly #calls = new Map<string, Readonly<Call>>()
  readonly #children = new Map<string, Readonly<Call>>()

  recordCall(call: Call) {
    const id = callKey(call)
    const old = this.#calls.get(id)
    if (old) {
      if ((Object.keys(old) as (keyof Call)[]).some(k => old[k] !== call[k])) throw new Error('CAUSAL_CONFLICT')
      return
    }
    this.#calls.set(id, Object.freeze({ ...call }))
  }

  result(origin: Origin) {
    return this.#calls.get(callKey(origin)) ?? null
  }

  linkChild(origin: Origin, execution: string) {
    const parent = this.result(origin)
    if (!parent || !execution || execution === parent.execution) throw new Error('UNKNOWN_PARENT_OR_CHILD')
    const id = childKey(origin.workspace, execution)
    const old = this.#children.get(id)
    if (old && old !== parent) throw new Error('CHILD_CONFLICT')
    this.#children.set(id, parent)
  }

  childResult(workspace: string, execution: string, status: 'completed' | 'failed' | 'cancelled') {
    const parent = this.#children.get(childKey(workspace, execution))
    return parent ? { execution, parent, status, accepted: false, joinSatisfied: false } : null
  }
}
