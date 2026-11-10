import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { analyzeLayered, buildLayeredContext, createScopeAuthority, LayeredCandidateIndex,
  LayeredState, scriptedLayeredProposalAnalyzer, selectLayeredShadowWork } from '../../packages/core/dist/index.js'
import { clusterIntervals, metrics } from './metrics.mjs'

const openCorpus = new URL('./data/open-corpus.json', import.meta.url)
const frozenOpenHash = '1270ca0b508cd505babbcbd4cce18010c94ff273e9c9db51dc1aaffa2fe2aa02'
const sha256 = value => createHash('sha256').update(value).digest('hex')
const arms = {
  'A-single-pass': { singlePass: true },
  'B-hierarchical': {},
  'C-stateful': { state: true },
  'D-event-hybrid': { state: true, trigger: true },
  'no-recent-state': { state: true, trigger: true, memory: false },
  'no-typed-facts': { state: true, trigger: true, facts: false },
  'no-candidate-retrieval': { state: true, trigger: true, candidates: false },
  'no-hierarchy': { state: true, trigger: true, singlePass: true },
  'no-trigger': { state: true },
  'no-closed-hints': { state: true, trigger: true, closed: false },
  'no-span-validation': { state: true, trigger: true, normalizeClaimedOffsets: true },
  'oracle-candidate': { state: true, trigger: true, oracle: true },
}
const factKinds = new Set(['tool-result', 'subagent-completed', 'result-produced', 'result-inspected', 'result-consumed'])
const assertOpen = corpus => {
  assert.equal(corpus.protocol, 'acmi-093-authored-v1')
  assert.ok(corpus.scenarios.length && corpus.scenarios.every(s => ['dev', 'validation'].includes(s.split)))
  const ids = new Set()
  const clusters = new Map()
  for (const scenario of corpus.scenarios) {
    assert(!ids.has(scenario.id), 'Duplicate scenario')
    ids.add(scenario.id)
    const split = clusters.get(scenario.cluster) ?? scenario.split
    assert.equal(split, scenario.split, 'Cluster leakage')
    clusters.set(scenario.cluster, split)
  }
}
const kindOf = (turn) => turn.kind === 'metadata' ? 'metadata'
  : ['tool-result', 'subagent-result'].includes(turn.kind) ? 'causal' : 'message'

function fixtureTasks(scenario) {
  return scenario.tasks.map((row, i) => ({
    taskId: row.id, workspaceId: row.workspace ?? scenario.workspace,
    objective: row.objective, aliases: row.aliases ?? [], status: row.status,
    revision: 1, catalogRevision: 1, lastActivity: scenario.tasks.length - i,
    activeWorkNode: 'work-' + row.id, reason: 'lexical',
  }))
}

// Only the offline negative control ignores analyzer-provided coordinates. All other checks still run.
function rewriteCoordinates(raw, packet, corrupt) {
  const draft = JSON.parse(raw)
  for (const claim of draft.claims) for (const evidence of claim.evidence) {
    if (evidence.source !== 'turn' || evidence.excerpt !== packet.current.text) continue
    evidence.span = corrupt ? { start: -1, end: packet.current.text.length } : { start: 0, end: packet.current.text.length }
  }
  return JSON.stringify(draft)
}
const coordinates = corrupt => ({ propose: (packet, interpretation) =>
  rewriteCoordinates(scriptedLayeredProposalAnalyzer.propose(packet, interpretation), packet, corrupt) })

function summarizedResult(analysis, packet, oracle) {
  const { interpretation, graph, rawClaimKinds } = analysis
  const index = interpretation.intents.findIndex(i => i.relation === 'existing' || i.relation === 'new')
  const chosen = index < 0 ? Math.max(0, interpretation.intents.findIndex(i => i.relation === 'discussion')) : index
  const intent = interpretation.intents[chosen]
  const identity = interpretation.identities[chosen]
  const row = identity?.handle && [...packet.active, ...packet.historical].find(x => x.handle === identity.handle)
  const acts = new Set(interpretation.utterance.flatMap(x => x.acts))
  if (packet.current.kind === 'causal' && packet.facts.length && !acts.size) acts.add('report')
  if (acts.delete('authorization_request')) acts.add('request')
  if (acts.delete('selection')) { acts.add('selection'); acts.add('request') }
  const flags = Object.fromEntries(['negated', 'quoted', 'conditional'].map(key => [key, interpretation.utterance.some(a => a[key])]))
  const validated = graph.status === 'draft' ? graph.claims.map(c => c.kind) : []
  return {
    relation: intent?.relation ?? (packet.current.kind === 'metadata' ? 'none' : 'unknown'),
    posture: intent?.posture ?? (packet.current.kind === 'metadata' ? 'discuss' : 'unknown'),
    change: intent?.change ?? 'unknown',
    identity: identity?.status ?? 'unknown',
    targetId: row?.taskId ?? null,
    acts: [...acts], flags, rawClaims: rawClaimKinds, validatedClaims: validated,
    graphReason: graph.reason,
    authorization: interpretation.authorization,
    activeRanks: packet.active.map(row => row.taskId), historicalRanks: packet.historical.map(row => row.taskId),
    oracle,
  }
}

async function runScenario(scenario, options, timing) {
  const workspaceId = scenario.workspace
  const tasks = fixtureTasks(scenario)
  const own = new Set(tasks.filter(t => t.workspaceId === workspaceId).map(t => t.taskId))
  const authority = createScopeAuthority()
  const scope = authority.grant(workspaceId)
  const access = { authority, scope, sha256, permitsTask: (_, id) => own.has(id) }
  const candidateIndex = new LayeredCandidateIndex(workspaceId, tasks)
  const state = new LayeredState({ now: () => 1, maxRetries: 0 })
  const sessions = new Map()
  let sessionId = 's1'
  const graphNodes = new Map(tasks.filter(row => own.has(row.taskId) && row.status === 'open')
    .map(row => [row.activeWorkNode, { id: row.activeWorkNode, taskId: row.taskId, kind: 'work', state: 'running' }]))
  for (const node of scenario.graph?.nodes ?? []) if (own.has(node.taskId)) graphNodes.set(node.id, node)
  const graphResults = new Map((scenario.graph?.results ?? []).map(result => [result.id, result]))
  const rows = []
  let mockCalls = 0
  let candidateComparisons = 0
  let bytes = 0
  let estimatedTokens = 0
  let maxBytes = 0
  for (const turn of scenario.turns) {
    sessionId = turn.session ?? sessionId
    const session = sessions.get(sessionId) ?? { cursor: 0, bindingTaskId: null, bindingRevision: 0 }
    sessions.set(sessionId, session)
    const fromCursor = session.cursor
    if (Object.hasOwn(turn, 'binding') && turn.binding !== session.bindingTaskId) {
      session.bindingTaskId = turn.binding
      session.bindingRevision++
    }
    const cut = { workspaceId, sessionId, incarnation: 'i1', authorizationEpoch: 1, bindingRevision: session.bindingRevision,
      graphRevision: 1, sourceRevision: 1, candidateRevision: 1, policyVersion: 'preregistered-093-v1', cursor: ++session.cursor }
    const actor = turn.actor ?? 'user'
    const kind = kindOf(turn)
    const current = { id: turn.id, actor, kind, text: kind === 'message' && actor === 'user' ? turn.text : '' }
    const declared = (turn.facts ?? []).filter(fact => factKinds.has(fact.kind) && own.has(fact.taskId))
    const facts = declared.map((fact, index) => ({
      ...cut, id: turn.id + '-fact-' + index, kind: fact.kind, cause: fact.cause, relatedTaskId: fact.taskId,
      relatedWorkNodeId: fact.nodeId, relatedResultId: fact.resultId,
    }))
    for (const fact of declared) {
      if (fact.nodeId && !graphNodes.has(fact.nodeId)) graphNodes.set(fact.nodeId,
        { id: fact.nodeId, taskId: fact.taskId, kind: 'work', state: 'running' })
      if (fact.resultId && fact.nodeId && !graphResults.has(fact.resultId)) graphResults.set(fact.resultId,
        { id: fact.resultId, nodeId: fact.nodeId, cause: fact.cause })
    }
    const graph = { workspaceId, graphRevision: cut.graphRevision, topologyComplete: scenario.graph?.topologyComplete ?? false,
      nodes: [...graphNodes.values()], edges: scenario.graph?.edges ?? [], decisions: scenario.graph?.decisions ?? [],
      results: [...graphResults.values()] }
    const trigger = selectLayeredShadowWork({ actor, kind, cursor: cut.cursor }, options.trigger ? 'gated' : 'ungated')
    const defaultResult = { relation: null, posture: null, identity: null, targetId: null, acts: [],
      rawClaims: [], validatedClaims: [], activeRanks: [], historicalRanks: [], authorization: 'no_operation',
      foreignExposure: false, analyzed: false, reason: trigger }
    const work = ({ memory }) => {
      if (trigger === 'skip_metadata') return { status: 'skip' }
      const start = performance.now()
      const query = { cut, query: current.text, bindingTaskId: session.bindingTaskId }
      if (options.oracle && turn.expected?.targetId) query.explicitTaskIds = [turn.expected.targetId]
      const candidates = options.candidates === false ? { candidates: [], examined: 0 } : candidateIndex.retrieve(query, access)
      candidateComparisons += candidates.examined
      const rows = candidates.candidates.filter(row => options.closed !== false || row.status === 'open')
      const retained = (options.memory === false ? [] : memory.recentIdentities).flatMap(identity => {
        const row = rows.find(x => x.taskId === identity.taskId && x.revision === identity.revision && x.status === 'open')
        return row ? [{ kind: 'identity', ...identity, sourceRevision: cut.sourceRevision, ref: 'hypothesis-' + row.taskId }] : []
      })
      const built = buildLayeredContext({ cut, current, binding: { taskId: session.bindingTaskId },
        facts: options.facts === false ? [] : facts, candidates: rows, retained }, access)
      if (built.status !== 'ready') {
        timing.push(performance.now() - start)
        return { status: 'complete', value: { ...defaultResult, reason: built.status } }
      }
      const packet = built.packet
      const analysis = analyzeLayered(packet, graph, { singlePass: options.singlePass === true,
        ...(options.normalizeClaimedOffsets ? { analyzer: coordinates(false) } : {}) })
      timing.push(performance.now() - start)
      mockCalls++
      bytes += packet.budget.bytes
      maxBytes = Math.max(maxBytes, packet.budget.bytes)
      estimatedTokens += packet.budget.estimatedTokens
      const value = summarizedResult(analysis, packet, options.oracle === true)
      const identity = value.identity === 'active' && packet.active.find(row => row.taskId === value.targetId)
      const updates = options.memory === false || !identity ? undefined : {
        recentIdentities: [{ taskId: identity.taskId, revision: identity.revision, cursor: cut.cursor }],
      }
      const foreignExposure = [...value.activeRanks, ...value.historicalRanks].some(id => !own.has(id))
      return { status: 'complete', value: { ...value, analyzed: true, reason: 'evaluated', foreignExposure }, updates }
    }
    const observed = options.state
      ? await state.run({ cut, fromCursor, bindingTaskId: session.bindingTaskId, digest: sha256(JSON.stringify({ cut, current, facts })) }, work)
      : (() => {
          const result = work({ memory: { recentIdentities: [] } })
          return result.status === 'complete' ? { status: 'evaluated', value: result.value, invalidations: [] } : { status: 'skipped' }
        })()
    if (turn.expected) rows.push({
      scenario: scenario.id, cluster: scenario.cluster, split: scenario.split, language: scenario.language, risk: scenario.risk,
      turnId: turn.id, expected: turn.expected, trigger, invalidations: observed.invalidations ?? [],
      ...(observed.status === 'evaluated' ? observed.value : { ...defaultResult, reason: observed.status }),
    })
  }
  return { rows, work: { mockCalls, candidateComparisons, bytes, maxBytes, estimatedTokens, state: state.metrics() } }
}

const quantile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(p * values.length) - 1] : null
const json = value => JSON.stringify(value, null, 2) + '\n'
const output = process.argv[2]
assert.equal(process.argv.length, 3, 'Usage: node evaluate.mjs <new-output-directory>; open corpus only')
const data = await readFile(openCorpus)
assert.equal(sha256(data), frozenOpenHash, 'Unexpected open corpus bytes; stop rather than silently changing evaluator inputs')
const corpus = JSON.parse(data)
assertOpen(corpus)
const results = { protocol: 'acmi-093-architecture-comparison-v1', provenance: 'deterministic_scripted_mock_not_real_model',
  corpusSha256: frozenOpenHash, holdoutConsumed: false, historicalHoldoutRuns: 0, providerRequests: 0,
  cases: corpus.scenarios.length, arms: {} }
const performanceResults = { unit: 'ms', method: 'uncached per-event retrieval + pack + validation; mock only',
  node: process.version, heapStart: process.memoryUsage().heapUsed, arms: {} }
const intervals = {}
const confusions = {}
for (const [name, options] of Object.entries(arms)) {
  const timings = []
  const runs = []
  for (const scenario of corpus.scenarios) runs.push(await runScenario(scenario, options, timings))
  const rows = runs.flatMap(run => run.rows)
  const summaries = Object.fromEntries(['dev', 'validation'].map(split => [split, metrics(rows.filter(x => x.split === split))]))
  const slice = key => Object.fromEntries([...new Set(rows.map(r => r[key]))].map(value =>
    [value, metrics(rows.filter(row => row[key] === value))]))
  results.arms[name] = { options, rows, summaries, slices: { language: slice('language'), risk: slice('risk') },
    work: runs.map(run => run.work) }
  if (name === 'D-event-hybrid' || ['A-single-pass', 'B-hierarchical', 'C-stateful'].includes(name)) {
    intervals[name] = Object.fromEntries(['dev', 'validation'].map(split => [split, clusterIntervals(rows.filter(x => x.split === split))]))
  }
  confusions[name] = Object.fromEntries(Object.entries(summaries).map(([split, s]) => [split,
    { relation: s.L2.relationConfusion, posture: s.L2.postureConfusion, identity: s.L3.statusConfusion }]))
  performanceResults.arms[name] = { measuredEvents: timings.length, p50: quantile(timings, 0.5), p95: quantile(timings, 0.95),
    heapAfterArm: process.memoryUsage().heapUsed }
}
const directory = resolve(output)
const securityCase = { workspace: 'diagnostic-lab', id: 'coordinates-control', cluster: 'independent-safety-control',
  tasks: [{ id: 't1', status: 'open', objective: 'Paint contact sheets' }] }
const [fixture] = fixtureTasks(securityCase)
const diagnosticAuthority = createScopeAuthority()
const scope = diagnosticAuthority.grant(securityCase.workspace)
const cut = { workspaceId: securityCase.workspace, sessionId: 's', incarnation: 'i', cursor: 1, graphRevision: 1,
  authorizationEpoch: 1, bindingRevision: 1, sourceRevision: 1, candidateRevision: 1, policyVersion: 'diagnostic' }
const built = buildLayeredContext({ cut, current: { id: 'e1', actor: 'user', kind: 'message',
  text: 'Refine objective: prepare monochrome contact sheets' }, binding: { taskId: 't1' }, candidates: [fixture] },
{ authority: diagnosticAuthority, scope, sha256 })
assert.equal(built.status, 'ready')
const graph = { workspaceId: cut.workspaceId, graphRevision: 1, topologyComplete: false, nodes: [], edges: [], decisions: [], results: [] }
const corrupt = analyzeLayered(built.packet, graph, { analyzer: coordinates(true) }).graph
const coordinateAblation = { propose: (packet, interpretation) =>
  rewriteCoordinates(coordinates(true).propose(packet, interpretation), packet, false) }
const counterfactual = analyzeLayered(built.packet, graph, { analyzer: coordinateAblation }).graph
assert.notEqual(corrupt.status, 'draft')
assert.equal(counterfactual.status, 'draft')
results.spanAdversarialControl = { strict: corrupt.status, ignoringClaimedOffsets: counterfactual.status,
  providerRequests: 0, effects: 0, inCorpus: false }
await mkdir(directory)
for (const [name, value] of Object.entries({ 'results.json': results, 'cluster-bootstrap.json': intervals,
  'confusion-matrices.json': confusions, 'performance.json': performanceResults,
  'ablations.json': { controls: results.spanAdversarialControl,
    arms: Object.fromEntries(Object.entries(results.arms).slice(4).map(([key, value]) => [key, value.summaries])) } })) {
  await writeFile(join(directory, name), json(value), { flag: 'wx' })
}
console.log(JSON.stringify({ cases: results.cases, arms: Object.keys(arms).length, providerRequests: 0,
  historicalHoldoutRuns: 0, holdoutConsumed: false }))
