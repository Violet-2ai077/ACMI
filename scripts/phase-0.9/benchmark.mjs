import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { cpus, platform, release, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import * as core from '../../packages/core/dist/index.js'
import { openGraphStore, provisionGraphRoot } from '../../integrations/dsh/dist/index.js'
import { provenance, scenarios, seed, sha, version } from './scenarios.mjs'

const output = process.argv[2]
assert(output, 'Usage: node scripts/phase-0.9/benchmark.mjs <output-directory>')
const corpus = scenarios()
const modes = ['rules', 'rules-scripted', 'structured-mock', 'abstention-first']
const classes = ['continue_current', 'switch_existing', 'create_new', 'no_task', 'uncertain']
const splits = ['development', 'validation', 'holdout']
const workspace = 'synthetic-phase-0.9'
const now = Date.UTC(2026, 10, 10)
const templates = new Map()
const taskFixtures = new Set()
for (const c of corpus) {
  assert(!templates.has(c.template) || templates.get(c.template) === c.split)
  assert(!taskFixtures.has(c.taskFixture))
  templates.set(c.template, c.split)
  taskFixtures.add(c.taskFixture)
}
assert(corpus.length >= 300)
const splitHashes = Object.fromEntries(splits.map(split => [split, sha(core.canonical(corpus.filter(c => c.split === split)))]))
const osTemp = realpathSync(tmpdir())
const temporary = mkdtempSync(join(osTemp, 'acmi-09-benchmark-'))
const dataFile = join(temporary, 'synthetic-history.jsonl')
const latency = { analysis: [], graphValidation: [], stage: [], reviewApply: [], full: [], incremental: [] }
const size = { events: [], candidates: [], historyBytes: [], estimatedUnits: [], deltaBytes: [] }
const timing = (label, run) => {
  const start = performance.now()
  const value = run()
  latency[label].push(performance.now() - start)
  return value
}
const stats = a => {
  const n = a.length
  const sorted = a.toSorted((a, b) => a - b)
  return n ? { n, p50: sorted[Math.ceil(n / 2) - 1], p95: sorted[Math.ceil(n * 0.95) - 1], max: sorted.at(-1) } : { n }
}
const objectText = f => 'Maintain ' + f.item
const alternative = f => f.similar ? 'Different performance objective for ' + f.item : 'Independent objective ' + f.aliasB
const session = (sessionId, instanceId = workspace) => ({ adapterId: 'fixture', instanceId, sessionId, incarnation: '1' })
const ref = (id, localSeq) => ({ session: id, localSeq, sourceRevision: 'synthetic-epoch' })
const eventRow = (taskId, source, detail) => ({
  fact: { version: 'runtime-fact-v1', eventId: core.runtimeFactId(source.session, source.localSeq, sha), workspaceId: source.session.instanceId,
    source, detail, provenance: 'runtime_observed', runtimeVersion: 'synthetic', adapterVersion: 'synthetic' },
  attribution: { kind: 'assigned', taskId, via: 'host-source' }, observedAt: new Date(now).toISOString(),
})
function bootstrap(f, live) {
  const host = session('host')
  const rows = []
  const add = (change, source = ref(host, rows.length)) => rows.push({ change, source, key: 'seed:' + rows.length })
  add({ kind: 'task-opened', objective: objectText(f), criteria: ['All checks pass'] })
  for (const nodeId of ['root', 'left', 'right', 'final']) add({ kind: 'node-added', nodeId, title: nodeId, role: 'work' })
  add({ kind: 'mainline-advanced', nodeId: 'root' })
  for (const nodeId of ['root', 'left']) {
    add({ kind: 'work-transitioned', nodeId, state: 'ready' })
    add({ kind: 'work-transitioned', nodeId, state: 'running' })
  }
  add({ kind: 'edge-added', from: 'root', to: 'left', relation: 'depends_on' })
  add({ kind: 'execution-started', nodeId: 'left', executionId: 'run-left', agentId: 'fixture' })
  add({ kind: 'result-produced', nodeId: 'left', executionId: 'run-left', resultId: 'report', summary: 'Left report', verified: true })
  if (f.kind === 'tool-result') {
    add({ kind: 'execution-started', nodeId: 'root', executionId: 'run-root', agentId: 'fixture' }, ref(live, 0))
    add({ kind: 'execution-transitioned', executionId: 'run-root', state: 'completed' }, ref(live, 3))
  }
  if (f.priorReview) add({ kind: 'result-reviewed', nodeId: 'root', resultId: 'report', stage: 'available' })
  if (f.priorReview === 'inspected') add({ kind: 'result-reviewed', nodeId: 'root', resultId: 'report', stage: 'inspected' })
  if (f.conflict) add({ kind: 'evidence-recorded', content: { kind: 'decision', topic: 'format', text: 'Use prior format', state: 'accepted' } })
  return rows
}
function setup(c) {
  const f = c.fixture
  const identity = session(c.id)
  const authority = core.createScopeAuthority()
  const scope = authority.grant(workspace)
  const graph = new core.TaskGraph({ taskId: f.a, workspaceId: workspace, authority, digest: sha })
  const drafts = bootstrap(f, identity)
  for (const [i, row] of drafts.entries()) assert.equal(graph.append(scope, { ...row.change, seq: i + 1, id: row.key, source: row.source }), 'applied')
  const snapshot = graph.read(scope)
  const cut = { workspaceId: workspace, revision: sha(snapshot.sourceRevision + '/store'), snapshot }
  const kind = f.kind ?? 'user'
  const before = kind === 'tool-result'
    ? [eventRow(f.a, ref(identity, 0), { kind: 'turn-open', turn: 't' }),
      eventRow(f.a, ref(identity, 1), { kind: 'tool-call', turn: 't', step: 's', callId: 'c' })]
    : f.interleave ? [eventRow(f.a, ref(identity, 0), { kind: 'user' }), eventRow(f.unrelated, ref(identity, 1), { kind: 'user' })]
      : f.multiSession ? [eventRow(f.a, ref(session(c.id + '-older'), 0), { kind: 'user' })] : []
  const detail = kind === 'tool-result' ? { kind, turn: 't', step: 's', callId: 'c', callSeq: 1 } : kind === 'user' ? { kind } : { kind, turn: 't' }
  const anchor = eventRow(f.a, ref(identity, f.multiSession ? 0 : before.length), detail)
  const candidates = [
    { workspaceId: workspace, taskId: f.a, alias: f.aliasA, objective: objectText(f), revision: cut.revision },
    { workspaceId: workspace, taskId: f.b, alias: f.aliasB, objective: alternative(f), revision: sha(f.b) },
    ...(f.foreign ? [{ workspaceId: 'excluded-synthetic-workspace', taskId: f.unrelated, alias: 'excluded',
      objective: 'UNRELATED_FIXTURE_MARKER', revision: sha(f.unrelated) }] : []),
  ]
  const input = { cut, candidates, currentTaskId: f.a, facts: [...before, anchor], anchorId: anchor.fact.eventId,
    now, ttlMs: 300000, budget: f.budget ?? 16384,
    ...(f.user ? { user: { evidenceId: anchor.fact.eventId, text: f.user, provenance: 'synthetic_host_excerpt' } } : {}) }
  return { input, graph, scope, drafts, anchor }
}
function shape(changes) {
  const newNodes = new Map(changes.filter(x => x.change.kind === 'node-added').map(x => [x.change.nodeId, x.change.title]))
  const node = id => newNodes.get(id) ?? id
  return changes.map(({ change: c }) => {
    if (c.kind === 'node-added') return ['node', c.role, c.title].join(':')
    if (c.kind === 'edge-added') return ['edge', c.relation, node(c.from) + '>' + node(c.to)].join(':')
    if (c.kind === 'node-refined') return ['refine', c.nodeId, c.description].join(':')
    if (c.kind === 'work-transitioned') return ['work', c.nodeId, c.state].join(':')
    if (c.kind === 'result-observed') return [c.kind, c.nodeId, c.executionId, c.summary].join(':')
    if (c.kind === 'result-reviewed') return [c.kind, c.nodeId, c.resultId, c.stage].join(':')
    if (c.kind === 'evidence-recorded') {
      const d = c.content
      if (d.kind === 'decision') return [d.kind, d.state, d.topic, d.text].join(':')
      if (d.kind === 'constraint') return [d.kind, c.nodeId ?? 'task', d.category, d.validity, d.explicit, d.text].join(':')
      if (d.kind === 'result-assessment') return ['result', d.state, d.resultId, d.text].join(':')
      return [d.kind, c.nodeId ?? 'task', d.text].join(':')
    }
    return c.kind
  })
}
function validate(data, p) {
  if (!p.changes.length) return null
  const { graph, scope, input } = data
  const preview = graph.restore(scope, graph.checkpoint(scope))
  for (const [i, { id, change, evidenceId }] of p.changes.entries()) {
    const source = p.evidence.find(e => e.eventId === evidenceId)?.source
    if (!source) return 'missing-evidence'
    const result = preview.append(scope, { ...change, id, seq: input.cut.snapshot.through + i + 1, source })
    if (result !== 'applied') return preview.read(scope)?.unresolved.at(-1)?.reason ?? result
  }
  return core.understandingTopologyRisk(input.cut.snapshot, p.changes.map(x => x.change)) ?? null
}
const ratio = (a, b) => b ? a / b : null
function prf(tp, fp, fn) {
  return { tp, fp, fn, precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn), f1: ratio(2 * tp, 2 * tp + fp + fn) }
}
function metrics(rows) {
  const intent = Object.fromEntries(classes.map(k => [k, prf(
    rows.filter(r => r.intent === k && r.expectedIntent === k).length,
    rows.filter(r => r.intent === k && r.expectedIntent !== k).length,
    rows.filter(r => r.intent !== k && r.expectedIntent === k).length,
  )]))
  const byGraph = pred => {
    let tp = 0, fp = 0, fn = 0
    for (const row of rows) {
      const actual = new Set(row.changes.filter(pred)), expected = new Set(row.expectedChanges.filter(pred))
      tp += [...actual].filter(x => expected.has(x)).length
      fp += [...actual].filter(x => !expected.has(x)).length
      fn += [...expected].filter(x => !actual.has(x)).length
    }
    return prf(tp, fp, fn)
  }
  const routing = new Set(['continue_current', 'switch_existing'])
  const targeted = rows.filter(r => routing.has(r.expectedIntent))
  return { n: rows.length, intent,
    falseMerge: rows.filter(r => routing.has(r.intent) && (r.expectedIntent === 'create_new'
      || routing.has(r.expectedIntent) && r.taskId !== r.expectedTask)).length,
    falseSplit: rows.filter(r => r.intent === 'create_new' && routing.has(r.expectedIntent)).length,
    abstention: rows.filter(r => r.intent === 'uncertain').length,
    abstentionRate: ratio(rows.filter(r => r.intent === 'uncertain').length, rows.length),
    candidateSelection: { correct: targeted.filter(r => r.taskId === r.expectedTask).length, total: targeted.length },
    graph: { all: byGraph(() => true), workNode: byGraph(x => /^(node|refine):/.test(x)),
      dependency: byGraph(x => x.startsWith('edge:depends_on:')), branchJoin: byGraph(x => /^(node:join|edge:(joins_into|references|continues_as|decomposes_into)):/.test(x)),
      state: byGraph(x => x.startsWith('work:')), decisions: byGraph(x => x.startsWith('decision:')) },
    exactDecomposition: rows.filter(r => r.expectedChanges.some(x => x.startsWith('edge:decomposes_into:'))
      && core.canonical(r.changes.toSorted()) === core.canonical(r.expectedChanges.toSorted())).length,
    validEvidenceRefs: rows.reduce((a, r) => a + r.validEvidence, 0),
    evidenceRefs: rows.reduce((a, r) => a + r.evidence, 0),
    anchorCoverage: rows.filter(r => r.anchorCovered).length,
    stableReanalysis: rows.filter(r => r.stableId).length,
    duplicateChanges: rows.reduce((a, r) => a + r.duplicates, 0),
    unresolved: { hits: rows.filter(r => r.reasonMatched).length, opportunities: rows.filter(r => r.expectedReason).length },
    cycleRejections: rows.filter(r => r.risk === 'edge-cycle').length,
    unrelatedTaskContamination: rows.filter(r => r.unrelated).length,
    crossWorkspaceLeakage: rows.filter(r => r.crossWorkspace).length,
    unauthorizedIdAcceptance: rows.filter(r => r.arbitraryId).length,
    resultAcceptanceFalsePositive: rows.filter(r => r.resultAccepted).length,
    falseJoinSatisfaction: rows.filter(r => r.joinSatisfied).length,
    falseTaskCompletion: rows.filter(r => r.taskClosed).length,
  }
}

function hostCase(c, data) {
  const root = join(temporary, c.id)
  mkdirSync(root)
  provisionGraphRoot(root, workspace)
  const read = core.createScopeAuthority(), write = core.createScopeAuthority()
  const scope = read.grant(workspace), writer = write.grant(workspace)
  const store = openGraphStore({ root, workspaceId: workspace, read, write, understanding: true })
  try {
    const f = c.fixture
    for (const row of data.drafts) store.append(writer, f.a, row)
    store.append(writer, f.b, { source: ref(session('host'), 0), key: 'candidate',
      change: { kind: 'task-opened', objective: alternative(f), criteria: ['Verify candidate'] } })
    for (const { fact } of data.input.facts) store.ingest(writer, fact, 0, { taskId: f.a, nodeId: 'root' })
    const req = { synthetic: true, taskId: f.a, currentTaskId: f.a, candidates: [{ taskId: f.a, alias: f.aliasA }, { taskId: f.b, alias: f.aliasB }],
      anchorId: data.anchor.fact.eventId, evidenceIds: data.input.facts.map(x => x.fact.eventId),
      ...(data.input.user ? { user: data.input.user } : {}) }
    const before = store.read(scope, f.a)
    const model = f.model ? JSON.stringify(f.model) : undefined
    const item = timing('stage', () => store.stageUnderstanding(scope, writer, req, model))
    assert.deepEqual(store.read(scope, f.a), before)
    assert.equal(store.stageUnderstanding(scope, writer, req, model).proposal.id, item.proposal.id)
    if (c.expected.review === 'stale') {
      store.append(writer, f.a, { source: ref(session('host'), 1), key: 'stale-head',
        change: { kind: 'evidence-recorded', nodeId: 'root', content: { kind: 'runtime-state', text: 'New observed revision' } } })
    }
    const preApply = store.read(scope, f.a)
    const decision = { decision: 'accept', reviewerId: 'synthetic-host', reason: 'Benchmark checked diff and evidence' }
    const receipt = timing('reviewApply', () => store.reviewUnderstanding(writer, item.proposal.id, decision))
    const blocked = c.expected.review !== null
    assert.equal(receipt.status, blocked ? 'conflicted' : 'accepted', c.id)
    if (c.expected.review === 'stale') assert.equal(receipt.reason, 'stale-revision')
    if (c.expected.review === 'cycle') assert.equal(receipt.reason, 'edge-cycle')
    const applied = store.read(scope, f.a)
    if (blocked) assert.deepEqual(applied, preApply)
    else assert.equal(applied.snapshot.through - preApply.snapshot.through, item.proposal.changes.length)
    assert.deepEqual(store.reviewUnderstanding(writer, item.proposal.id, decision), receipt)
    assert.equal(receipt.acceptedChangeIds.length, blocked ? 0 : item.proposal.changes.length)
    assert.equal(receipt.rejectedChangeIds.length, blocked ? item.proposal.changes.length : 0)
    assert.equal(receipt.evidence.length, item.proposal.evidence.length)
    assert.equal(receipt.reviewer.type, 'trusted_host')
    assert.equal(receipt.expectedRevision, item.proposal.graphRevision)
    assert.equal(receipt.resultingRevision, applied.revision)
    assert.equal(applied.snapshot.task.closed, undefined)
    assert(applied.snapshot.nodes.every(n => !n.joinSatisfied))
    assert(applied.snapshot.reviews.every(r => r.stage !== 'accepted'))
    return { scenario: c.id, status: receipt.status, reason: receipt.reason, appliedEvents: receipt.acceptedChangeIds.length,
      idempotent: true, reviewComplete: true, proposalOnlyMutations: 0 }
  } finally { store.close() }
}

try {
  const rows = []
  const host = []
  const history = Array.from({ length: 2048 }, (_, i) => ({ id: 'synthetic-noise-' + i, event: 'stream-chunk', payload: 'x'.repeat(256) }))
    .map(x => JSON.stringify(x)).join('\n') + '\n'
  for (const c of corpus) {
    const data = setup(c)
    const { input, anchor } = data
    const packet = core.buildUnderstandingPacket(input, sha)
    const script = c.fixture.model ? JSON.stringify(c.fixture.model) : undefined
    for (const mode of modes) {
      const json = ['rules-scripted', 'structured-mock'].includes(mode) && packet ? script : undefined
      const p = timing('analysis', () => core.analyzeUnderstanding(input, sha, json, mode))
      const risk = timing('graphValidation', () => validate(data, p))
      const wire = core.canonical([p, packet])
      const keys = new Set(input.facts.filter(r => r.attribution.taskId === c.taskFixture).map(r => r.fact.eventId))
      const changes = risk ? [] : shape(p.changes)
      const resultAccepted = p.changes.some(x => x.change.kind === 'result-reviewed' && x.change.stage === 'accepted')
      rows.push({ scenario: c.id, family: c.family, split: c.split, mode, intent: p.intent.kind, taskId: p.intent.taskId ?? null,
        expectedIntent: c.expected.intent, expectedTask: c.expected.taskId, changes, proposed: shape(p.changes), expectedChanges: c.expected.changes,
        risk, unresolved: p.unresolved, expectedReason: c.expected.reason,
        reasonMatched: !!c.expected.reason && (p.unresolved.includes(c.expected.reason) || risk === c.expected.reason),
        evidence: p.evidence.length, validEvidence: p.evidence.filter(e => keys.has(e.eventId)).length,
        anchorCovered: p.evidence.some(e => e.eventId === anchor.fact.eventId),
        stableId: core.analyzeUnderstanding({ ...input, now: input.now + 1 }, sha, json, mode).id === p.id,
        duplicates: p.changes.length - new Set(p.changes.map(x => x.id)).size,
        unrelated: wire.includes(c.fixture.unrelated) || wire.includes('UNRELATED_FIXTURE_MARKER') || wire.includes('UNTRUSTED_BODY_FIXTURE'),
        crossWorkspace: wire.includes('excluded-synthetic-workspace'), arbitraryId: wire.includes('missing-uuid'),
        resultAccepted, joinSatisfied: p.changes.some(x => x.change.kind === 'join-satisfied'),
        taskClosed: p.changes.some(x => x.change.kind === 'task-closed') })
    }
    if (['decompose', 'join', 'stale', 'cycle', 'refine', 'result-rejected', 'result-produced'].includes(c.family)) host.push(hostCase(c, data))
    const delta = input.facts.filter(r => r.attribution.taskId === c.taskFixture)
    size.events.push(delta.length)
    size.deltaBytes.push(Buffer.byteLength(core.canonical(delta)))
    size.candidates.push(packet?.candidates.length ?? 0)
    size.estimatedUnits.push(packet ? core.estimateContextTokens(core.canonical(packet)) + 192 : 0)
    if (c.split !== 'development') {
      writeFileSync(dataFile, history + input.facts.map(x => JSON.stringify(x)).join('\n'))
      const a = timing('incremental', () => core.analyzeUnderstanding({ ...input, facts: delta }, sha, script, 'structured-mock'))
      const b = timing('full', () => {
        const bytes = readFileSync(dataFile)
        size.historyBytes.push(bytes.length)
        const facts = bytes.toString('utf8').split('\n').map(line => JSON.parse(line)).filter(r => r.attribution?.taskId === c.taskFixture)
        return core.analyzeUnderstanding({ ...input, facts: facts.slice(-32) }, sha, script, 'structured-mock')
      })
      assert.equal(a.id, b.id)
    }
  }
  const summary = Object.fromEntries(modes.map(mode => [mode, Object.fromEntries(['all', ...splits].map(split =>
    [split, metrics(rows.filter(r => r.mode === mode && (split === 'all' || r.split === split)))]))]))
  const safety = ['unrelatedTaskContamination', 'crossWorkspaceLeakage', 'unauthorizedIdAcceptance', 'resultAcceptanceFalsePositive',
    'falseJoinSatisfaction', 'falseTaskCompletion', 'duplicateChanges']
  for (const mode of modes) for (const key of safety) assert.equal(summary[mode].all[key], 0, mode + '/' + key)
  assert(rows.every(r => r.validEvidence === r.evidence && r.stableId))
  const report = { version, seed, labelProvenance: provenance, splitHashes, corpusHash: sha(core.canonical(corpus)),
    splitSizes: Object.fromEntries(splits.map(split => [split, corpus.filter(c => c.split === split).length])),
    cases: corpus.length, templateCount: templates.size, modelRequests: { realProvider: 0, scriptedResponses: rows.filter(r =>
      ['rules-scripted', 'structured-mock'].includes(r.mode) && corpus.find(c => c.id === r.scenario).fixture.model).length },
    summary, latencyMs: Object.fromEntries(Object.entries(latency).map(([k, a]) => [k, stats(a)])),
    volumes: { incrementalHistoryBytesRead: 0, fullHistoryBytesRead: stats(size.historyBytes),
      estimatedPacketUnits: stats(size.estimatedUnits), deltaEvents: stats(size.events), candidateCount: stats(size.candidates),
      serializedDeltaBytes: stats(size.deltaBytes) },
    host: { samples: host.length, accepted: host.filter(r => r.status === 'accepted').length,
      staleRejected: host.filter(r => r.reason === 'stale-revision').length, cycleRejected: host.filter(r => r.reason === 'edge-cycle').length,
      applyIdempotent: host.filter(r => r.idempotent).length, reviewComplete: host.filter(r => r.reviewComplete).length,
      proposalOnlyMutations: 0, cases: host },
    runtime: { node: process.version, os: platform(), release: release(), cpu: cpus()[0]?.model, logicalCpus: cpus().length }, rows }
  const dest = resolve(output)
  mkdirSync(dest, { recursive: true })
  for (const [file, value] of [['phase-0.9-scenarios.json', corpus], ['phase-0.9-results.json', report]]) {
    writeFileSync(join(dest, file), JSON.stringify(value, null, 2) + '\n')
  }
  console.log(JSON.stringify({ cases: report.cases, splitSizes: report.splitSizes, splitHashes, corpusHash: report.corpusHash,
    latencyMs: report.latencyMs, volumes: report.volumes, modelRequests: report.modelRequests,
    host: { ...report.host, cases: undefined }, safety: Object.fromEntries(safety.map(k => [k, summary['structured-mock'].all[k]])) }, null, 2))
} finally {
  const resolved = realpathSync(temporary)
  assert.equal(dirname(resolved), osTemp)
  assert.match(resolved.slice(osTemp.length + 1), /^acmi-09-benchmark-[A-Za-z0-9]+$/u)
  rmSync(resolved, { recursive: true, force: true })
}
