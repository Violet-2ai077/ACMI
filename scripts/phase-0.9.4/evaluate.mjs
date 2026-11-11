import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildLayeredContext, createScopeAuthority, LayeredCandidateIndex, LayeredState,
  scriptedLayeredProposalAnalyzer, selectLayeredShadowWork,
  understandLayered, validateLayeredClaims } from '../../packages/core/dist/index.js'
import { literalMention, normalizedMention } from '../../packages/core/dist/layered-candidates.js'
import { acts, evidenceSpan, exact, identities, intents, operations, policy, sha, spanOK, write } from './contract.mjs'
import { loadCorpus } from './corpus.mjs'
import { clusterBootstrap, score } from './metrics.mjs'

export const arms = {
  deterministic: 'literal_name_baseline',
  '093-layered': '093_deterministic_rules',
  hierarchical: 'scripted_not_model_output',
  incremental: 'scripted_not_model_output',
  hybrid: 'scripted_not_model_output',
  'abstention-first': 'exact_literal_abstention_baseline',
}

function environment(input) {
  const authority = createScopeAuthority()
  const workspaceId = input.workspaceId
  const scope = authority.grant(workspaceId)
  const own = new Set(input.tasks.filter(t => t.workspaceId === workspaceId).map(t => t.taskId))
  const access = { authority, scope, sha256: sha, permitsTask: (_, id) => own.has(id) }
  const tasks = input.tasks.map(t => ({ ...t, activeWorkNode: 'work-' + t.taskId }))
  const graph = { workspaceId, graphRevision: 1, topologyComplete: false, nodes: tasks
    .filter(t => own.has(t.taskId) && t.status === 'open').map(t => ({ id: t.activeWorkNode, taskId: t.taskId, kind: 'work', state: 'running' })),
    edges: [], decisions: [], results: [] }
  return { access, own, index: new LayeredCandidateIndex(workspaceId, tasks), graph }
}

export function makeCase(input, turn = input.turns.at(-1), env = environment(input), options = {}) {
  const prior = input.turns.slice(0, input.turns.indexOf(turn) + 1).filter(t => t.session === turn.session)
  const cut = { workspaceId: input.workspaceId, sessionId: turn.session, incarnation: 'i1', authorizationEpoch: 1,
    bindingRevision: 1, graphRevision: 1, sourceRevision: 1, candidateRevision: 1, policyVersion: policy, cursor: prior.length }
  const binding = { taskId: input.bindingSession === turn.session ? input.binding : null }
  const { actor, kind, id } = turn
  const current = { actor, kind, id, text: actor === 'user' ? turn.text : '' }
  const retrieved = env.index.retrieve({ cut, query: current.text, bindingTaskId: binding.taskId }, env.access)
  const facts = input.facts.flatMap(({ turn, ...f }) => {
    const cursor = prior.findIndex(t => t.id === turn) + 1
    return cursor && env.own.has(f.relatedTaskId)
      ? [{ ...f, workspaceId: cut.workspaceId, sessionId: cut.sessionId, incarnation: cut.incarnation, sourceRevision: cut.sourceRevision, cursor }]
      : []
  })
  const candidates = retrieved.candidates.filter(c => !options.activeOnly || c.status === 'open')
  const built = buildLayeredContext({ cut, current, binding, facts: options.noFacts ? [] : facts, candidates }, env.access)
  const packet = built.packet
  const ranks = { active: packet?.active.map(t => t.taskId) ?? [], historical: packet?.historical.map(t => t.taskId) ?? [] }
  assert([...ranks.active, ...ranks.historical].every(id => env.own.has(id)), 'Cross-workspace exposure')
  return { packet, ranks, status: built.status, graph: env.graph, examined: retrieved.examined }
}

const base = packet => ({ packetDigest: packet.digest, identity: 'unresolved', taskId: null,
  intent: 'uncertain', acts: [], operation: 'none', confidence: 0,
  draft: { cut: packet.cut, claims: [] } })
const rowIdentity = row => ({ identity: row.bindable ? 'active' : 'historical', taskId: row.taskId })
const layerIntent = x => !x || x.relation === 'unknown' ? 'uncertain' : x.relation === 'none' ? 'none'
  : x.relation === 'new' ? 'new' : x.relation === 'discussion' ? 'discuss'
    : x.change === 'objective' ? 'change' : x.change === 'refine' ? 'refine'
      : intents.includes(x.posture) ? x.posture : 'uncertain'

export function predict(arm, packet, memory = [], options = {}) {
  assert(Object.hasOwn(arms, arm))
  const out = base(packet)
  const text = normalizedMention(packet.current.text)
  const candidates = [...packet.active, ...packet.historical]
  const literals = candidates.filter(row => [row.objective, ...(row.aliases ?? [])].some(word => literalMention(text, word)))
  if (arm === 'deterministic' || arm === 'abstention-first') {
    const safeLiteral = !/["“「]|\b(?:not|if|unless|suppose)\b|不是|如果|别/u.test(text)
    if (literals.length === 1 && (arm === 'deterministic' || safeLiteral)) {
      Object.assign(out, rowIdentity(literals[0]), { confidence: 0.95 })
    } else if (literals.length > 1) out.identity = 'ambiguous'
    return out
  }
  const layer = understandLayered(packet, { singlePass: options.singlePass === true })
  const select = layer.intents.findIndex(x => x.relation === 'existing' || x.relation === 'new')
  const index = select < 0 ? Math.max(0, layer.intents.findIndex(x => x.relation === 'discussion')) : select
  const value = layer.identities[index]
  const intent = layerIntent(layer.intents[index])
  const mapped = { unassigned: 'new', unknown: intent === 'none' ? 'none' : 'unresolved', stale: 'unavailable' }
  const row = candidates.find(c => value?.handle === c.handle)
  const utterance = layer.utterance.flatMap(s => {
    const names = s.acts.map(act => act === 'authorization_request' ? 'request'
      : act === 'acceptance' ? 'explicit_acceptance' : act)
    if (s.quoted || s.hypothetical) names.push('quoted')
    return names.filter(x => acts.includes(x)).map(act => ({ act, ...evidenceSpan(packet.current, s.span.start, s.span.end) }))
  })
  Object.assign(out, row ? rowIdentity(row) : { identity: mapped[value?.status] ?? value?.status ?? 'unresolved' },
    { intent, acts: utterance, confidence: row ? value.reason === 'explicit' ? 0.95 : 0.65 : 0,
      draft: JSON.parse(scriptedLayeredProposalAnalyzer.propose(packet, layer)) })
  if (arm === '093-layered') return out
  if (out.identity === 'unresolved' && ['continue', 'refine', 'change', 'pause', 'wait'].includes(intent)) {
    const bound = packet.active.find(c => c.taskId === packet.binding.taskId)
    if (bound && !literals.length && !/[?？]/u.test(text)) Object.assign(out, rowIdentity(bound), { confidence: 0.55 })
  }
  if (['incremental', 'hybrid'].includes(arm) && ['return', 'resume'].includes(intent) && !exact(out.identity) && !literals.length) {
    const recent = memory.find(m => m.taskId !== packet.binding.taskId)
    const row = packet.active.find(c => c.taskId === recent?.taskId && c.revision === recent.revision)
    if (row) Object.assign(out, rowIdentity(row), { confidence: 0.55 })
  }
  out.operation = ['ambiguous', 'missing', 'unavailable'].includes(out.identity) ? 'clarify' : out.draft.claims.length ? 'review' : 'none'
  return out
}

async function attempt(adapter, packet, signal) {
  const timeout = new Error('adapter timeout')
  timeout.code = 'timeout'
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(() => adapter(packet, signal)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(timeout), 1000) }),
    ])
  } finally { clearTimeout(timer) }
}

export async function runAdapter(fixture, adapter) {
  const { packet, graph } = fixture
  const receipt = { policy, promptVersion: 'offline-094-v1', attempts: 0, packetHash: packet?.digest ?? null,
    outputHash: null, inputBudget: packet?.budget ?? null, modelTokens: null, cost: null, providerRequests: 0 }
  const finish = (status, extra = {}) => ({ ...receipt, status, ...extra })
  if (!packet) return finish(fixture.status)
  let raw
  for (let i = 0; i < 2; i++) {
    receipt.attempts++
    const controller = new AbortController()
    const start = performance.now()
    try {
      raw = await attempt(adapter, packet, controller.signal)
      if (performance.now() - start > 1000) throw Object.assign(new Error('late adapter'), { code: 'timeout' })
      break
    } catch (error) {
      controller.abort()
      if (error?.code !== 'timeout' || i === 1) return finish(error?.code === 'timeout' ? 'timeout' : 'adapter_error')
    }
  }
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 16384) return finish('output_budget_or_type')
  receipt.outputHash = sha(raw)
  let row
  try { row = JSON.parse(raw) } catch { return finish('parse_error') }
  const fields = ['packetDigest', 'identity', 'taskId', 'intent', 'acts', 'operation', 'confidence', 'draft']
  if (!row || Object.keys(row).length !== fields.length || fields.some(k => !Object.hasOwn(row, k))
    || !identities.includes(row.identity) || !intents.includes(row.intent) || !operations.includes(row.operation)
    || !Number.isFinite(row.confidence) || row.confidence < 0 || row.confidence > 1
    || !Array.isArray(row.acts) || row.acts.length > 32 || !row.acts.every(a => acts.includes(a?.act))
    || !row.draft || !Array.isArray(row.draft.claims)) return finish('schema_error')
  if (row.packetDigest !== packet.digest) return finish('stale_output')
  if (exact(row.identity) ? !(row.identity === 'active' ? packet.active : packet.historical).some(c => c.taskId === row.taskId)
    : row.taskId !== null) return finish('candidate_fence')
  if (!row.acts.every(a => spanOK([packet.current], a))) return finish('evidence_error')
  const validation = validateLayeredClaims(packet, graph, row.draft)
  const { draft, ...result } = row
  return finish('ok', { result, rawClaims: draft.claims.slice(0, 16).map(c => graphKind(c?.kind)),
    guardedClaims: validation.drafts.map(c => graphKind(c.kind)),
    validation: validation.status === 'draft' ? 'draft' : validation.reason,
    proposalReceipts: validation.claims })
}

function graphKind(kind) {
  if (typeof kind !== 'string') return 'invalid'
  const prefix = kind.split('-')[0]
  return { worknode: 'work_node', work: 'lifecycle', execution: 'lifecycle', mainline: 'lifecycle', next: 'next_action' }[prefix]
    ?? (['objective', 'decision', 'constraint', 'result', 'dependency', 'branch', 'join'].includes(prefix) ? prefix : 'invalid')
}

export async function controls(fixture) {
  const { packet } = fixture
  const run = mutate => runAdapter(fixture, p => JSON.stringify(mutate(base(p))))
  const stale = await run(r => ({ ...r, packetDigest: 'stale' }))
  const foreign = await run(r => ({ ...r, identity: 'active', taskId: 'not-in-scope' }))
  const malformed = await run(r => ({ ...r, automaticBind: true }))
  const fabricated = await run(r => ({ ...r, acts: [{ act: 'request', ...evidenceSpan(packet.current), quote: 'invented' }] }))
  const staleDraft = await run(r => ({ ...r, draft: { ...r.draft, cut: { ...r.draft.cut, graphRevision: 0 } } }))
  const valid = await run(r => r)
  return { staleRejected: stale.status === 'stale_output', foreignRejected: foreign.status === 'candidate_fence',
    schemaRejected: malformed.status === 'schema_error', evidenceRejected: fabricated.status === 'evidence_error',
    staleDraftRejected: staleDraft.validation === 'scope-or-revision-fence-mismatch', validAccepted: valid.status === 'ok' }
}

export async function proposalControls() {
  const { input } = loadCorpus().find(c => c.input.binding && c.input.turns.at(-1).actor === 'user')
  const probe = text => makeCase({ ...input, facts: [], turns: [{ ...input.turns.at(-1), text }] })
  const fixture = probe('Refine objective: verify the cold-room latch')
  const adapter = p => predict('093-layered', p)
  const good = await runAdapter(fixture, p => JSON.stringify(adapter(p)))
  const reject = async mutate => {
    const r = await runAdapter(fixture, p => {
      const out = adapter(p)
      mutate(out.draft.claims[0])
      return JSON.stringify(out)
    })
    return r.status === 'ok' && r.guardedClaims.length === 0 && r.validation !== 'no-claims'
  }
  const oversized = probe('请先停。'.repeat(900))
  const historical = loadCorpus().find(c => c.gold.identity === 'historical')
  const h = makeCase(historical.input)
  return { positiveDraft: good.guardedClaims?.[0] === 'objective',
    inventedSourceRejected: await reject(c => { c.evidence[0].id = 'unknown-source' }),
    inventedExcerptRejected: await reject(c => { c.evidence[0].excerpt = 'not the current turn' }),
    unissuedHandleRejected: await reject(c => { c.taskHandle = 'foreign-handle' }),
    currentTextBudgetRefused: oversized.status === 'insufficient_context',
    historyReadOnly: h.packet.historical.length > 0 && h.packet.historical.every(c => !c.bindable) }
}

async function replay(input, name, env) {
  const state = new LayeredState({ now: () => 1, maxRetries: 0 })
  const prefix = { analyzed: 0, refused: 0, metadataSkipped: 0 }
  for (const turn of input.turns.slice(0, -1)) {
    const { packet } = makeCase(input, turn, env)
    if (!packet) { prefix.refused++; continue }
    await state.run({ cut: packet.cut, fromCursor: packet.cut.cursor - 1, bindingTaskId: packet.binding.taskId,
      digest: packet.digest }, ({ memory }) => {
      if (name === 'hybrid' && selectLayeredShadowWork({ ...turn, cursor: packet.cut.cursor }, 'gated') === 'skip_metadata') {
        prefix.metadataSkipped++
        return { status: 'skip' }
      }
      prefix.analyzed++
      const predicted = predict('hierarchical', packet)
      const row = packet.active.find(c => c.taskId === predicted.taskId)
      const recentIdentities = row
        ? [{ taskId: row.taskId, revision: row.revision, cursor: packet.cut.cursor }, ...memory.recentIdentities.filter(r => r.taskId !== row.taskId)].slice(0, 8)
        : memory.recentIdentities
      return { status: 'complete', value: null, updates: { recentIdentities } }
    })
  }
  return { state, prefix }
}

async function evaluated(input, fixture, env, arm) {
  if (!fixture.packet || !['incremental', 'hybrid'].includes(arm))
    return runAdapter(fixture, p => JSON.stringify(predict(arm, p)))
  const { state, prefix } = await replay(input, arm, env)
  const { packet } = fixture
  const observed = await state.run({ cut: packet.cut, fromCursor: packet.cut.cursor - 1,
    bindingTaskId: packet.binding.taskId, digest: packet.digest }, async ({ memory }) => ({
    status: 'complete', value: await runAdapter(fixture, p => JSON.stringify(predict(arm, p, memory.recentIdentities))),
  }))
  return { ...(observed.value ?? { status: 'state-' + observed.status }), prefix }
}

const bySplit = (rows, fn) => Object.fromEntries(['dev', 'validation'].map(s => [s, fn(rows.filter(r => r.split === s))]))
export async function evaluate() {
  const corpus = loadCorpus()
  const rows = Object.fromEntries(Object.keys(arms).map(k => [k, []]))
  const onlyActive = []
  const singlePass = []
  const noFacts = []
  const timings = []
  let counterexamples
  for (const { input, gold, meta } of corpus) {
    const start = performance.now()
    const env = environment(input)
    const fixture = makeCase(input, input.turns.at(-1), env)
    timings.push(performance.now() - start)
    const diag = makeCase(input, input.turns.at(-1), env, { activeOnly: true })
    const factless = makeCase(input, input.turns.at(-1), env, { noFacts: true })
    const makeRow = (f, observed) => ({ id: input.id, cluster: meta.storyline, split: meta.split, language: meta.language,
      family: meta.family, risk: meta.risk, gold, ranks: f.ranks, topologyComplete: f.graph.topologyComplete, ...observed })
    for (const arm of Object.keys(arms)) rows[arm].push(makeRow(fixture, await evaluated(input, fixture, env, arm)))
    onlyActive.push(makeRow(diag, await evaluated(input, diag, env, '093-layered')))
    singlePass.push(makeRow(fixture, await runAdapter(fixture, p => JSON.stringify(predict('093-layered', p, [], { singlePass: true })))))
    noFacts.push(makeRow(factless, await evaluated(input, factless, env, '093-layered')))
    if (!counterexamples && fixture.packet?.current.text) counterexamples = await controls(fixture)
  }
  assert(counterexamples && Object.values(counterexamples).every(Boolean))
  Object.assign(counterexamples, await proposalControls())
  assert(Object.values(counterexamples).every(Boolean), JSON.stringify(counterexamples))
  assert(Object.values(rows).every(r => r.every((x, i) => x.packetHash === rows.deterministic[i].packetHash)), 'Unequal packet')
  const summaries = Object.fromEntries(Object.entries(rows).map(([arm, r]) => [arm, bySplit(r, score)]))
  const identity = {
    activeOnly: bySplit(onlyActive, score),
    activePlusHistorical: summaries['093-layered'],
    availableFailures: rows['093-layered'].filter(r => exact(r.gold.identity)
      && [...r.ranks.active, ...r.ranks.historical].includes(r.gold.taskId)
      && (r.gold.taskId !== r.result?.taskId || r.gold.identity !== r.result?.identity))
      .map(r => ({ id: r.id, split: r.split, family: r.family, gold: r.gold.identity, resolved: r.result?.identity, wrongId: exact(r.result?.identity) })),
    diagnostic: 'Oracle ceiling is availability only; expected ID never injected into packets.',
  }
  const splits = (r, key) => Object.fromEntries([...new Set(r.map(x => x[key]))].sort().map(value => [value, score(r.filter(x => x[key] === value))]))
  const metrics = { policy, arms, providerRequests: 0, holdoutRuns: 0, humanReviewed: 0, controls: counterexamples,
    summaries, intervals: Object.fromEntries(Object.entries(rows).map(([arm, r]) => [arm, bySplit(r, clusterBootstrap)])),
    ablations: { singlePass: bySplit(singlePass, score), noFacts: bySplit(noFacts, score) },
    prefix: Object.fromEntries(['incremental', 'hybrid'].map(k => [k, rows[k].reduce((acc, { prefix }) => {
      for (const key of Object.keys(acc)) acc[key] += prefix?.[key] ?? 0
      return acc
    }, { analyzed: 0, refused: 0, metadataSkipped: 0 })])),
    validationSlices: { family: splits(rows['093-layered'].filter(r => r.split === 'validation'), 'family'),
      language: splits(rows['093-layered'].filter(r => r.split === 'validation'), 'language') } }
  const p = q => timings.sort((a, b) => a - b)[Math.ceil(q * timings.length) - 1]
  return { metrics, identity, predictions: Object.fromEntries(Object.entries(rows).map(([arm, r]) =>
    [arm, r.map(({ gold, ...x }) => x)])), performance: { scope: 'local index + packet only', n: timings.length, p50ms: p(.5), p95ms: p(.95) } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert(process.argv.length === 3, 'Usage: node evaluate.mjs <new-output-directory>; frozen open corpus only')
  const out = resolve(process.argv[2])
  const { metrics, identity, predictions, performance } = await evaluate()
  mkdirSync(out)
  write(join(out, 'metrics.json'), metrics)
  write(join(out, 'identity-resolution.json'), identity)
  write(join(out, 'predictions.json'), predictions)
  write(join(out, 'performance.json'), performance)
  write(join(out, 'confusion-matrices.json'), Object.fromEntries(Object.entries(metrics.summaries).map(([arm, s]) =>
    [arm, Object.fromEntries(Object.entries(s).map(([split, data]) => [split, data.confusions]))])))
  console.log(JSON.stringify({ arms: Object.keys(arms), validation: metrics.summaries['093-layered'].validation, controls: metrics.controls }))
}
