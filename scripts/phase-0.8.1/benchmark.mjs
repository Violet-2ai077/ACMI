import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { cpus, platform, release, tmpdir, totalmem } from 'node:os'
import { dirname, join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { assembleTaskContext, createScopeAuthority, loadTaskContext, runtimeFactId, serializeTaskContext, TaskGraph, validateRuntimeFact } from '../../packages/core/dist/index.js'
import {
  analyzeTaskDelta, normalizeDshRuntimeFact, openGraphStore, provisionGraphRoot,
} from '../../integrations/dsh/dist/index.js'

const version = 'phase-0.8.1-fixture-v1'
const workspaceId = 'benchmark-081'
const sha = s => createHash('sha256').update(s).digest('hex')
const uuid = n => '08100000-0000-4000-8000-' + n.toString(16).padStart(12, '0')
const families = ['routing', 'delivery', 'review', 'restart', 'children', 'context', 'isolation', 'normalization']
const osTemp = realpathSync(tmpdir())
const base = realpathSync(mkdtempSync(join(osTemp, 'acmi-081-benchmark-')))
const timings = {}
const cases = []
const rows = []
const dbBytes = []
function time(name, fn) {
  const start = performance.now()
  try { return fn() } finally {
    const list = timings[name] ??= []
    list.push(performance.now() - start)
  }
}
function denied(fn, code) { assert.throws(fn, e => e.code === code) }
function fixture(session, seq, detail) {
  return { version: 'runtime-fact-v1', eventId: runtimeFactId(session, seq, sha),
    workspaceId, runtimeVersion: '0.2.2-rc.1', adapterVersion: '0.8.1', provenance: 'runtime_observed',
    source: { session, localSeq: seq, sourceRevision: sha(JSON.stringify(session)) }, detail }
}
function makeIdentity(id, incarnation = '1', adapterId = 'dsh') { return { adapterId, instanceId: workspaceId, sessionId: id, incarnation } }
function sample(family, i, store, open, read, write, writer) {
  const n = families.indexOf(family) * 20 + i + 1
  const task = uuid(n)
  const other = uuid(2000 + n)
  const scope = read.grant(workspaceId)
  const foreign = read.grant('foreign')
  const identity = makeIdentity('session-' + n)
  const cut = () => time('readMs', () => store.read(scope, task))
  const host = makeIdentity('host-' + n, '1', 'acmi-host')
  const counters = { commits: 0, duplicates: 0, gaps: 0, unassigned: 0, unresolved: 0, causal: 0, normalized: 0, provenance: 0,
    proposals: 0, proposalExpected: 0, proposalTruePositive: 0, unresolvedExpected: 0, unresolvedCorrect: 0,
    proposalEvidence: 0, repeatIds: 0, accepted: 0, rejected: 0, stale: 0, falseMutation: 0, dependencyWrong: 0,
    packages: 0, refusals: 0, leaks: 0, restarted: 0, replayedRows: 0 }
  let next = 0
  const add = (change, target = task) => {
    const seq = ++next
    return time('hostAppendMs', () => store.append(writer, target, {
      key: 'host-' + seq, change, source: { session: host, localSeq: seq, sourceRevision: 'host-confirmed-v1' },
    }))
  }
  const seed = (target, title) => {
    add({ kind: 'task-opened', objective: title, criteria: ['Keep exact source'] }, target)
    add({ kind: 'node-added', nodeId: 'main', title: 'Main stage', role: 'work' }, target)
    add({ kind: 'mainline-advanced', nodeId: 'main' }, target)
    for (const state of ['ready', 'running']) add({ kind: 'work-transitioned', nodeId: 'main', state }, target)
  }
  const ingest = (seq, detail, session = identity, assignment) => {
    const f = fixture(session, seq, detail)
    assert.equal(time('validateFactMs', () => validateRuntimeFact(f, workspaceId, sha)), true)
    const result = time('ingestTransactionMs', () => store.ingest(writer, f, 0, assignment))
    if (result.status === 'duplicate') counters.duplicates++
    else {
      counters.commits++
      if (result.attribution.kind === 'unassigned') {
        counters.unassigned++
        if (result.attribution.reason !== 'non-task') counters.unresolved++
      }
      if (f.source.session.incarnation && f.source.sourceRevision && f.eventId) counters.provenance++
    }
    return { f, result }
  }
  const info = { kind: 'assistant', turn: '1', step: '1' }
  const binding = (seq, taskId, revision) => ingest(seq, { kind: 'binding', taskId, revision })
  seed(task, 'Objective for Task ' + n)
  let expectedNext = null
  let active = 'main'
  if (family === 'routing') {
    seed(other, 'FOREIGN-CONTEXT-' + n)
    binding(0, task, 1)
    ingest(1, { kind: 'tool-call', turn: '1', step: '1', callId: 'x' })
    binding(2, other, 2)
    const late = ingest(3, { kind: 'tool-result', turn: '1', step: '1', callId: 'x', callSeq: 1 })
    assert.deepEqual(late.result.attribution, { kind: 'assigned', taskId: task, via: 'original-call' })
    counters.causal++
    assert.equal(ingest(4, info).result.attribution.taskId, other)
    binding(5, task, 3)
    assert.equal(ingest(6, info).result.attribution.taskId, task)
  }
  if (family === 'delivery') {
    denied(() => store.ingest(writer, fixture(identity, 1, info), 0), 'gap')
    counters.gaps++
    binding(0, task, 1)
    ingest(1, info)
    assert.equal(ingest(1, info).result.status, 'duplicate')
    denied(() => store.ingest(writer, fixture(identity, 1, { ...info, step: 'conflicting' }), 0), 'conflict')
    assert.deepEqual(ingest(2, { kind: 'tool-result', turn: '1', step: '1', callId: 'missing' }).result.attribution,
      { kind: 'unassigned', reason: 'missing-cause' })
    assert.equal(ingest(3, { kind: 'user' }).result.attribution.reason, 'ambiguous-user')
    const second = makeIdentity(identity.sessionId, '2')
    assert.notEqual(ingest(0, { kind: 'unmapped' }, second).f.eventId, fixture(identity, 0, { kind: 'unmapped' }).eventId)
    assert.equal(store.cursor(scope, second).bindingRevision, 0)
  }
  if (family === 'review') {
    binding(0, task, 1)
    const ev = ingest(1, info).f
    const before = cut()
    const variants = ['accept', 'reject', 'stale', 'ambiguous', 'tamper']
    const mode = variants[i % variants.length]
    const suggestion = mode === 'ambiguous' ? undefined : {
      kind: 'next-action', evidenceId: ev.eventId, text: 'Review checklist ' + n,
    }
    const facts = store.facts(scope, task)
    const outcome = time('proposalMs', () => analyzeTaskDelta(before, facts, suggestion))
    if (cut().revision !== before.revision) counters.falseMutation++
    if (mode === 'ambiguous') {
      counters.unresolvedExpected++
      assert.equal(outcome.status, 'unresolved')
      counters.unresolvedCorrect++
    } else {
      counters.proposalExpected++
      assert.equal(outcome.status, 'proposed')
      counters.proposals++
      assert.equal(outcome.proposal.changes[0].content.text, suggestion.text)
      counters.proposalTruePositive++
      assert.equal(outcome.proposal.evidence[0].eventId, ev.eventId)
      counters.proposalEvidence++
      assert.equal(analyzeTaskDelta(before, facts, suggestion).proposal.id, outcome.proposal.id)
      counters.repeatIds++
      const proposal = outcome.proposal
      if (mode === 'accept') {
        assert.equal(store.review(writer, proposal, 'accept').status, 'accepted')
        counters.accepted++
        expectedNext = suggestion.text
      } else if (mode === 'reject') {
        assert.equal(store.review(writer, proposal, 'reject').status, 'rejected')
        assert.equal(store.review(writer, proposal, 'accept').status, 'rejected')
        counters.rejected++
      } else if (mode === 'stale') {
        add({ kind: 'work-progressed', nodeId: 'main', summary: 'New revision' })
        denied(() => store.review(writer, proposal, 'accept'), 'revision')
        counters.stale++
      } else denied(() => store.review(writer, { ...proposal, changes: [{ kind: 'task-closed' }] }, 'accept'), 'invalid')
    }
  }
  if (family === 'restart') {
    for (let j = 0; j < i + 2; j++) add({ kind: 'work-progressed', nodeId: 'main', summary: 'Before checkpoint ' + j })
    time('checkpointMs', () => store.checkpoint(writer, task, cut().revision))
    binding(0, task, 1)
    ingest(1, info)
    const wanted = cut()
    store.close()
    store = time('openStoreMs', open)
    assert.deepEqual(time('restoreCutMs', cut), wanted)
    assert.equal(store.metrics().replayed, 1)
    counters.restarted++
    counters.replayedRows = 1
    assert.equal(ingest(1, info).result.status, 'duplicate')
  }
  if (family === 'children') {
    const setup = nodeId => {
      add({ kind: 'node-added', nodeId, title: nodeId, role: 'work' })
      for (const state of ['ready', 'running']) add({ kind: 'work-transitioned', nodeId, state })
    }
    setup('child-b')
    setup('child-c')
    add({ kind: 'node-added', nodeId: 'join', title: 'Integrate verified results', role: 'join' })
    for (const from of ['child-b', 'child-c']) add({ kind: 'edge-added', from, to: 'join', relation: 'joins_into' })
    add({ kind: 'edge-added', from: 'main', to: 'join', relation: 'continues_as' })
    ingest(0, { kind: 'turn-open', turn: '1' }, identity, { taskId: task, nodeId: 'main' })
    const parent = cut().snapshot.executions[0]
    const b = makeIdentity(identity.sessionId + '-b')
    const c = makeIdentity(identity.sessionId + '-c')
    const assign = nodeId => ({ taskId: task, nodeId, parentExecutionId: parent.id })
    ingest(0, { kind: 'turn-open', turn: '1' }, b, assign('child-b'))
    ingest(0, { kind: 'turn-open', turn: '1' }, c, assign('child-c'))
    const failed = i % 2 === 1
    if (failed) {
      ingest(1, { kind: 'turn-failed', turn: '1' }, c)
      for (const state of ['failed', 'ready', 'running']) add({ kind: 'work-transitioned', nodeId: 'child-c', state })
      ingest(2, { kind: 'turn-open', turn: '2' }, c, assign('child-c'))
    }
    const workers = cut().snapshot.executions.filter(row => row.parentId === parent.id && row.state === 'running')
    assert.equal(workers.length, 2)
    const waiting = i % 3 === 0
    if (waiting) add({ kind: 'execution-transitioned', executionId: parent.id, state: 'waiting', waitingFor: workers.map(x => x.id) })
    assert.equal(cut().snapshot.executions[0].state, waiting ? 'waiting' : 'running')
    for (const worker of workers) add({ kind: 'result-produced', resultId: worker.nodeId, nodeId: worker.nodeId,
      executionId: worker.id, summary: 'Explicitly verified ' + worker.nodeId, verified: true })
    ingest(1, { kind: 'turn-complete', turn: '1' }, b)
    ingest(failed ? 3 : 1, { kind: 'turn-complete', turn: failed ? '2' : '1' }, c)
    assert.equal(cut().snapshot.reviews.length, 0)
    for (const nodeId of ['child-b', 'child-c']) add({ kind: 'work-transitioned', nodeId, state: 'completed' })
    for (const resultId of ['child-b', 'child-c']) for (const stage of ['available', 'inspected', 'consumed']) {
      add({ kind: 'result-reviewed', nodeId: 'join', resultId, stage })
    }
    denied(() => add({ kind: 'join-satisfied', nodeId: 'join' }), 'invalid')
    for (const resultId of ['child-b', 'child-c']) add({ kind: 'result-reviewed', nodeId: 'join', resultId, stage: 'accepted' })
    add({ kind: 'join-satisfied', nodeId: 'join' })
    if (waiting) add({ kind: 'execution-transitioned', executionId: parent.id, state: 'running' })
    ingest(1, { kind: 'turn-complete', turn: '1' })
    add({ kind: 'work-transitioned', nodeId: 'main', state: 'completed' })
    add({ kind: 'mainline-advanced', nodeId: 'join' })
    active = 'join'
  }
  if (family === 'context') {
    binding(0, task, 1)
    for (const [index, kind] of ['compact-start', 'compact-summary', 'compact-end', 'runtime-context'].entries()) {
      assert.equal(ingest(index + 1, { kind }).result.attribution.kind, 'unassigned')
    }
  }
  if (family === 'isolation') {
    assert.equal(store.read(foreign, task), null)
    assert.equal(store.peek(foreign, task), null)
    assert.deepEqual(store.facts(foreign, task), [])
    denied(() => store.append(write.grant('foreign'), task, { change: { kind: 'task-closed' } }), 'unavailable')
    const foreignFact = { ...fixture(identity, 0, { kind: 'unmapped' }), workspaceId: 'foreign' }
    denied(() => store.ingest(writer, foreignFact, 0), 'invalid')
  }
  if (family === 'normalization') {
    const header = { id: identity.sessionId, createdAt: n, origin: 'subagent', parentSession: 'parent-' + n }
    const tool = { type: 'tool/call', seq: 1, data: { turn: 1, step: 1, callId: 'tool', arguments: 'RAW-SECRET' } }
    const result = { type: 'tool/result', seq: 2, surfaceOp: 'append', sourceEventSeqs: [1],
      data: { turn: 1, step: 1, message: { toolCallId: 'tool', content: 'RAW-SECRET' } } }
    for (const [event, kind] of [[{ type: 'session/end-seed', seq: 0, data: {} }, 'session-seed-boundary'], [tool, 'tool-call'], [result, 'tool-result']]) {
      const normalized = time('normalizeMs', () => normalizeDshRuntimeFact(header, event, workspaceId, 0))
      assert.equal(normalized.detail.kind, kind)
      assert.equal(JSON.stringify(normalized).includes('RAW-SECRET'), false)
      assert.equal(normalized.source.session.incarnation, String(n))
      counters.normalized++
    }
  }
  const budget = family === 'context' && i % 4 === 0 ? 100 : 20000
  const selected = cut()
  const graph = new TaskGraph({ taskId: task, workspaceId, authority: read, digest: sha })
  const events = store.events(scope, task).map(r => r.event)
  for (const event of events.slice(0, -1)) assert.equal(graph.append(scope, event), 'applied')
  assert.equal(time('incrementalProjectionMs', () => graph.append(scope, events.at(-1))), 'applied')
  assert.deepEqual(graph.read(scope), selected.snapshot)
  const reader = { read: () => store.peek(scope, task)?.snapshot ?? null }
  const request = { taskId: task, policyVersion: 'task-context-v1', includeDependencyResults: true, tokenBudget: budget }
  const pkg = time('warmAssemblyMs', () => assembleTaskContext(reader, scope, request, sha))
  if (budget === 100) {
    assert.equal(pkg.status, 'budget_insufficient')
    counters.refusals++
  } else {
    assert.equal(pkg.status, 'ok')
    assert.equal(pkg.package.activeNodeId, active)
    assert.equal(pkg.package.taskId, task)
    assert.equal(pkg.package.assembly.sourceRevision, selected.snapshot.sourceRevision)
    assert.ok(pkg.package.items.every(item => item.sources.length > 0))
    assert.ok(pkg.package.assembly.estimatedTokens <= budget)
    const serialized = serializeTaskContext(pkg.package)
    const expected = { taskId: task, hash: pkg.package.assembly.deterministicHash }
    assert.ok(time('packageLoadMs', () => loadTaskContext(serialized, expected, sha)))
    const text = JSON.stringify(pkg.package)
    counters.leaks += Number(text.includes('FOREIGN-CONTEXT-'))
    assert.equal(counters.leaks, 0)
    assert.equal(pkg.package.assembly.deterministicHash, assembleTaskContext(reader, scope, request, sha).package.assembly.deterministicHash)
    if (expectedNext) assert.ok(text.includes(expectedNext))
    if (family === 'children') {
      const deps = pkg.package.items.filter(item => item.dependency)
      counters.dependencyWrong = Number(deps.length !== 2 || deps.some(item => item.dependency.stage !== 'accepted'))
      assert.equal(counters.dependencyWrong, 0)
    }
    counters.packages++
  }
  read.revoke(scope)
  assert.equal(store.peek(scope, task), null)
  assert.equal(counters.falseMutation, 0)
  cases.push({ n, family, variant: i, labelProvenance: 'agent_generated_not_human_reviewed', active, budget,
    task, expectedNext, expectedPackage: budget !== 100 })
  rows.push({ n, family, graphRows: selected.snapshot.through, ...counters })
  return store
}

try {
  const memoryBefore = process.memoryUsage()
  for (const family of families) {
    const root = join(base, family)
    mkdirSync(root)
    provisionGraphRoot(root, workspaceId)
    const read = createScopeAuthority()
    const write = createScopeAuthority()
    const writer = write.grant(workspaceId)
    const open = () => openGraphStore({ root, workspaceId, read, write })
    let store = open()
    try {
      for (let i = 0; i < 20; i++) store = sample(family, i, store, open, read, write, writer)
      dbBytes.push(statSync(join(root, 'graph.sqlite')).size)
    } finally { store.close() }
  }
  const metrics = {}
  for (const row of rows) for (const [name, value] of Object.entries(row)) {
    if (typeof value === 'number' && name !== 'n') metrics[name] = (metrics[name] ?? 0) + value
  }
  const latency = Object.fromEntries(Object.entries(timings).map(([name, values]) => {
    const ordered = values.toSorted((a, b) => a - b)
    const q = p => ordered[Math.ceil(p * ordered.length) - 1]
    return [name, { n: values.length, p50: q(0.5), p95: q(0.95), max: ordered.at(-1) }]
  }))
  const report = { version, samples: cases.length, metrics, latency, dbBytes,
    memoryBefore, memoryAfter: process.memoryUsage(), maximumRssKiB: process.resourceUsage().maxRSS,
    runtime: { node: process.version, os: platform(), release: release(), arch: process.arch, cpu: cpus()[0]?.model,
      logicalCpus: cpus().length, totalMemory: totalmem() }, cases: rows }
  const output = process.argv[2]
  if (output) {
    mkdirSync(output, { recursive: true })
    for (const [name, value] of [['phase-0.8.1-scenarios.json', cases], ['phase-0.8.1-results.json', report]]) {
      writeFileSync(join(output, name), JSON.stringify(value, null, 2) + '\n')
    }
  }
  console.log(JSON.stringify({ samples: report.samples, metrics, latency, dbBytes, maximumRssKiB: report.maximumRssKiB }, null, 2))
} finally {
  if (dirname(base) !== osTemp || !/^acmi-081-benchmark-[A-Za-z0-9]+$/u.test(base.slice(osTemp.length + 1))) {
    throw new Error('Unsafe benchmark cleanup path')
  }
  rmSync(base, { recursive: true, force: true })
}
