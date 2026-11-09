import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { cpus, platform, release, totalmem } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { assembleTaskContext, estimateContextTokens, loadTaskContext, serializeTaskContext } from '../../packages/core/dist/index.js'
import { collectCandidates } from '../../packages/core/dist/context-candidates.js'
import { cases, digest, makeFixture } from './fixtures.mjs'

const algorithms = ['raw_recent', 'whole_session', 'task_only', 'acmi']
const reserve = 192
function baseline(history, mode, labels, budget) {
  let rows = history
  if (mode === 'whole_session') rows = rows.filter(r => r.kind === 'signal').slice(-10)
  if (mode === 'task_only') rows = rows.filter(r => r.taskId === labels.id && r.kind === 'signal').slice(-14)
  const kept = []
  let remaining = budget - reserve
  for (const row of rows.toReversed()) {
    const cost = estimateContextTokens(row.text) + Number(kept.length > 0)
    if (cost > remaining) continue
    kept.push(row.text)
    remaining -= cost
  }
  return kept.reverse().join('\n')
}

function score(output, labels, pkg = null) {
  const hit = value => output.includes(value)
  const metric = (correct, total) => ({ correct: Number(correct), total })
  const facts = Object.entries(labels.fact)
  const recall = Object.fromEntries(facts.map(([k, value]) => [k, metric(hit(value), 1)]))
  const deps = labels.deps.map(d => {
    const row = pkg?.items.find(x => x.dependency?.resultId === d.id)
    const present = hit(d.text)
    const accepted = pkg ? row?.kind === 'dependency-result' && row.dependency.stage === 'accepted'
      : present && hit(`Review ${d.refId ?? d.id} is accepted`)
    const correctlyUnreviewed = pkg ? row?.kind === 'unreviewed_dependency_output' && row.dependency.stage === d.stage
      : present && !accepted && (d.stage === 'produced' ? hit('Produced (not consumed): ' + d.text)
        : hit(`Review ${d.refId ?? d.id} is ${d.stage}`))
    return {
      correct: d.expected === 'absent' ? !present : d.expected === 'integrated' ? Boolean(accepted) : Boolean(correctlyUnreviewed),
      contamination: d.stage !== 'accepted' && Boolean(accepted),
    }
  })
  const staleMarkers = labels.forbidden.filter(x => x.startsWith('old-decision:') || x.startsWith('stale-attempt:'))
  const foreignMarkers = labels.forbidden.filter(x => !staleMarkers.includes(x))
  const foreign = foreignMarkers.filter(hit).length
  const active = pkg ? pkg.activeNodeId === labels.activeNodeId && pkg.currentState.work === labels.workState
    : hit('Active node ' + labels.activeNodeId) && hit(`Work ${labels.activeNodeId} is ${labels.workState}`)
  const execution = pkg ? pkg.items.some(x => x.kind === 'execution-state' && x.text.includes(`[${labels.executionState}]`))
    : hit(`Execution lead-${labels.activeNodeId} is ${labels.executionState}`)
  return {
    factRetention: metric(facts.filter(([, value]) => hit(value)).length, facts.length),
    activeState: metric(active, 1), executionState: metric(execution, 1),
    decision: recall.decision, constraint: recall.constraint, unresolved: recall.unresolved, nextAction: recall.nextAction,
    conflict: metric(labels.conflict !== null && hit(labels.conflict) && hit(labels.fact.decision)
      && (pkg ? pkg.items.some(x => x.kind === 'decision-conflict' && x.sources.length >= 2) : true), Number(labels.conflict !== null)),
    dependency: metric(deps.filter(d => d.correct).length, deps.length),
    unconsumedContamination: metric(deps.filter(d => d.contamination).length, labels.deps.filter(d => d.stage !== 'accepted').length),
    unrelatedContamination: metric(foreign, foreignMarkers.length),
    staleContamination: metric(staleMarkers.filter(hit).length, staleMarkers.length),
  }
}

const timings = {}
function time(metric, fn) {
  const before = performance.now()
  const result = fn()
  const samples = timings[metric] ??= []
  samples.push(performance.now() - before)
  return result
}
function stats(values) {
  const ordered = values.toSorted((a, b) => a - b)
  const quantile = fraction => ordered[Math.ceil(fraction * ordered.length) - 1]
  return { n: ordered.length, p50: quantile(0.5), p95: quantile(0.95), max: ordered.at(-1) }
}
const scenarios = []
const results = []
const handoffs = []
const probeFamilies = new Set()
for (const variant of cases) {
  const fixture = makeFixture(variant)
  const { graph, makeGraph, scope, history, events, labels, tokenBudget } = fixture
  const prefix = makeGraph(labels.id)
  time('projectionRebuildMs', () => {
    for (const event of events.slice(0, -1)) assert.equal(prefix.append(scope, event), 'applied')
  })
  const checkpoint = JSON.parse(JSON.stringify(prefix.checkpoint(scope)))
  const restored = time('checkpointRestoreMs', () => prefix.restore(scope, checkpoint))
  time('incrementalAppendMs', () => assert.equal(restored.append(scope, events.at(-1)), 'applied'))
  const final = graph.read(scope)
  assert.deepEqual(restored.read(scope), final)
  const active = final.nodes.find(n => n.id === final.activeNodeId)
  time('warmSnapshotReadMs', () => assert.equal(graph.read(scope), final))
  time('candidateCollectionMs', () => collectCandidates(final, active, true, () => {}))
  const request = { taskId: labels.id, tokenBudget, includeDependencyResults: true, policyVersion: 'task-context-v1' }
  const assembled = time('warmAssemblyMs', () => assembleTaskContext(graph, scope, request, digest))
  const metricByMode = {}
  for (const mode of algorithms.slice(0, -1)) {
    const output = baseline(history, mode, labels, tokenBudget)
    const units = estimateContextTokens(output) + reserve
    assert.ok(units <= tokenBudget)
    metricByMode[mode] = { units, ...score(output, labels) }
  }
  if (labels.expectRefusal) {
    assert.equal(assembled.status, 'budget_insufficient')
    metricByMode.acmi = { status: assembled.status, units: 0, ...score('', labels) }
  } else {
    assert.equal(assembled.status, 'ok')
    const pkg = assembled.package
    const wire = time('serializeMs', () => serializeTaskContext(pkg))
    const units = time('tokenEstimationMs', () => estimateContextTokens(wire)) + reserve
    assert.equal(units, pkg.assembly.estimatedTokens)
    assert.ok(units <= tokenBudget)
    const expected = { taskId: pkg.taskId, hash: pkg.assembly.deterministicHash }
    const recovered = time('recoveryLoadMs', () => loadTaskContext(wire, expected, digest))
    assert.deepEqual(recovered, pkg)
    assert.equal(serializeTaskContext(assembleTaskContext(restored, scope, request, digest).package), wire)
    assert.ok(pkg.items.every(item => item.sources.length > 0 && item.sources.every(ref =>
      history[ref.event.localSeq - 1]?.session === ref.event.session.sessionId
      && history[ref.event.localSeq - 1]?.taskId === ref.taskId)))
    const quality = score(wire, labels, pkg)
    assert.equal(quality.activeState.correct, 1)
    assert.equal(quality.executionState.correct, 1)
    assert.equal(quality.factRetention.correct, quality.factRetention.total, `Fact loss: ${variant.family}/${variant.serial}`)
    assert.equal(quality.unrelatedContamination.correct, 0)
    assert.equal(quality.staleContamination.correct, 0)
    assert.equal(quality.unconsumedContamination.correct, 0)
    assert.equal(quality.dependency.correct, quality.dependency.total)
    assert.equal(quality.conflict.correct, quality.conflict.total)
    metricByMode.acmi = { status: 'ok', units, hash: expected.hash, ...quality }
    if (!probeFamilies.has(variant.family)) {
      probeFamilies.add(variant.family)
      handoffs.push({ wire, expected, labels })
    }
  }
  const sizes = { historyRows: history.length, graphEvents: events.length, rawHistoryBytes: Buffer.byteLength(JSON.stringify(history)) }
  scenarios.push({ ...variant, tokenBudget, ...sizes, labels })
  results.push({ serial: variant.serial, family: variant.family, split: variant.split, ...sizes, modes: metricByMode })
}

const child = time('freshProcessBatchMs', () => spawnSync(process.execPath, [fileURLToPath(new URL('./recover.mjs', import.meta.url))], {
  encoding: 'utf8', input: JSON.stringify(handoffs.map(({ wire, expected }) => ({ wire, expected }))), timeout: 10_000,
}))
assert.equal(child.status, 0, child.stderr)
const fresh = JSON.parse(child.stdout)
assert.equal(fresh.length, handoffs.length)
fresh.forEach((row, index) => {
  const { labels } = handoffs[index]
  assert.equal(row.taskId, labels.id)
  assert.equal(row.activeNodeId, labels.activeNodeId)
  assert.equal(row.state, labels.workState)
  assert.deepEqual(row.next, [labels.fact.nextAction])
  assert.deepEqual(row.dependencies.toSorted(), labels.deps.filter(d => d.expected !== 'absent').map(d => [d.id, d.stage]).toSorted())
})

function summarize(rows, mode) {
  const measurements = rows.map(row => row.modes[mode])
  const metrics = Object.entries(measurements[0]).filter(([, v]) => v?.total !== undefined).map(([k]) => k)
  const totals = Object.fromEntries(metrics.map(metric => [metric, measurements.reduce((sum, row) => ({
    correct: sum.correct + row[metric].correct, total: sum.total + row[metric].total,
  }), { correct: 0, total: 0 })]))
  const units = measurements.reduce((n, row) => n + row.units, 0)
  return { ...totals, units, unitsStats: stats(measurements.map(row => row.units)),
    factsPer1000EstimatedTokens: totals.factRetention.correct * 1000 / units,
    emitted: measurements.filter(row => row.units > 0).length }
}

const breakdown = Object.fromEntries(['all', 'development', 'holdout', ...new Set(results.map(row => row.family))].map(slice => {
  const rows = results.filter(row => slice === 'all' || slice === row.split || slice === row.family)
  return [slice, Object.fromEntries(algorithms.map(mode => [mode, summarize(rows, mode)]))]
}))
const report = {
  labelProvenance: 'agent_generated_not_human_reviewed',
  runtime: { node: process.version, platform: platform(), release: release(), arch: process.arch,
    cpu: cpus()[0]?.model, logicalCores: cpus().length, memoryBytes: totalmem() },
  samples: results.length, freshProcessRecoveries: fresh,
  latency: Object.fromEntries(Object.entries(timings).map(([k, v]) => [k, stats(v)])),
  dataSizes: Object.fromEntries(['historyRows', 'graphEvents', 'rawHistoryBytes'].map(k => [k, stats(results.map(row => row[k]))])),
  breakdown, results,
}
const output = process.argv[2]
if (output) {
  mkdirSync(output, { recursive: true })
  for (const [filename, contents] of [['scenarios.json', scenarios], ['results.json', report]]) {
    writeFileSync(join(output, filename), JSON.stringify(contents, null, 2) + '\n')
  }
}
const table = Object.fromEntries(Object.entries(breakdown.all).map(([k, v]) => [k, {
  emitted: v.emitted, factRetention: `${v.factRetention.correct}/${v.factRetention.total}`,
  state: `${v.activeState.correct}/${v.activeState.total}`, dependency: `${v.dependency.correct}/${v.dependency.total}`,
  foreign: `${v.unrelatedContamination.correct}/${v.unrelatedContamination.total}`, p50EstimatedTokens: v.unitsStats.p50,
}]))
console.log(JSON.stringify({ samples: report.samples, fresh: fresh.length, table, latency: report.latency, dataSizes: report.dataSizes }, null, 2))
