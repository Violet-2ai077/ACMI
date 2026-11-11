import { exact, protectedKinds, seed } from './contract.mjs'

export const ratio = (n, d) => ({ n, d, rate: d ? n / d : null })
const count = (rows, predicate) => rows.filter(predicate).length
const correct = ({ gold, result }) => Boolean(result && gold.identity === result.identity && gold.taskId === result.taskId)
const resolvable = r => exact(r.gold.identity)
const issued = r => resolvable(r) && (r.gold.identity === 'active' ? r.ranks.active : r.ranks.historical).includes(r.gold.taskId)
const shouldAbstain = r => !resolvable(r) && !['none', 'new'].includes(r.gold.identity)
const abstains = r => r.result && !exact(r.result.identity) && !['none', 'new'].includes(r.result.identity)
const supported = r => r.gold.claims.filter(c => c.support === 'supported').map(c => c.kind)
const protectedOnly = values => values.filter(k => protectedKinds.includes(k))
const classes = (rows, expected, predicted) => {
  const m = {}
  for (const r of rows) {
    const a = expected(r), b = predicted(r) ?? '(no-output)'
    m[a] ??= {}
    m[a][b] = (m[a][b] ?? 0) + 1
  }
  return m
}
function sets(rows, expected, predicted) {
  let tp = 0, expectedN = 0, predictedN = 0
  for (const r of rows) {
    const e = new Set(expected(r)), p = new Set(predicted(r))
    expectedN += e.size; predictedN += p.size
    tp += [...p].filter(x => e.has(x)).length
  }
  return { precision: ratio(tp, predictedN), recall: ratio(tp, expectedN), f1: ratio(2 * tp, expectedN + predictedN) }
}
const spanKey = s => [s.act, s.actor, s.turn, s.start, s.end].join(':')

export function score(rows) {
  const active = rows.filter(r => r.gold.identity === 'active')
  const historical = rows.filter(r => r.gold.identity === 'historical')
  const eligible = rows.filter(resolvable)
  const available = rows.filter(issued)
  const predicted = rows.filter(r => exact(r.result?.identity))
  const assumed = eligible.filter(r => exact(r.result?.identity))
  const answered = rows.filter(r => r.gold.intent !== 'uncertain')
  const falseMerge = count(rows, r => r.result?.identity === 'active' && r.result.taskId !== r.gold.taskId)
  const falseSplit = count(rows, r => r.result?.identity === 'new' && (resolvable(r) || ['missing', 'unavailable', 'out_of_scope'].includes(r.gold.identity)))
  const classStatus = s => {
    const p = rows.filter(r => r.result?.identity === s)
    return { precision: ratio(count(p, r => r.gold.identity === s), p.length),
      recall: ratio(count(p, r => r.gold.identity === s), count(rows, r => r.gold.identity === s)) }
  }
  const precision = ratio(count(predicted, correct), predicted.length)
  const retrieval = k => ratio(count(active, r => r.ranks.active.slice(0, k).includes(r.gold.taskId)), active.length)
  const intentsCovered = answered.filter(r => r.result && r.result.intent !== 'uncertain')
  return {
    n: rows.length,
    retrieval: { at1: retrieval(1), at3: retrieval(3), at8: retrieval(8),
      closedAt2: ratio(count(historical, issued), historical.length),
      available: ratio(available.length, eligible.length),
      oracleAvailabilityCeiling: ratio(eligible.length, eligible.length), unavailableByRetrieval: eligible.length - available.length,
      candidateAvailableButIncorrect: available.length - count(available, correct) },
    identity: { conditionalExact: ratio(count(available, correct), available.length),
      endToEnd: ratio(count(rows, correct), rows.length), resolvableExact: ratio(count(eligible, correct), eligible.length),
      coverage: ratio(assumed.length, eligible.length), coveredAccuracy: precision,
      selectiveRisk: ratio(predicted.length - precision.n, predicted.length),
      abstentionPrecision: ratio(count(rows, r => abstains(r) && shouldAbstain(r)), count(rows, abstains)),
      abstentionRecall: ratio(count(rows, r => abstains(r) && shouldAbstain(r)), count(rows, shouldAbstain)),
      historicalExact: ratio(count(historical, correct), historical.length), ambiguous: classStatus('ambiguous'),
      unavailable: classStatus('unavailable'), missing: classStatus('missing'), outOfScope: classStatus('out_of_scope'),
      falseMerge, falseSplit, weightedCost: falseMerge * 10 + falseSplit * 3,
      wrongTaskSelection: count(predicted, r => resolvable(r) && r.result.taskId !== r.gold.taskId),
      highRiskFalseMerge: count(rows, r => r.risk === 'high' && r.result?.identity === 'active' && r.result.taskId !== r.gold.taskId),
      riskCoverage: [0, 0.5, 0.75, 0.9, 1].map(threshold => {
        const selected = predicted.filter(r => r.result.confidence >= threshold)
        return { threshold, coverage: ratio(selected.length, rows.length), risk: ratio(selected.length - count(selected, correct), selected.length) }
      }),
    },
    act: sets(rows, r => r.gold.acts.map(a => a.act), r => r.result?.acts.map(a => a.act) ?? []),
    span: sets(rows, r => r.gold.acts.map(spanKey), r => r.result?.acts.map(spanKey) ?? []),
    intent: { exact: ratio(count(rows, r => r.gold.intent === r.result?.intent), rows.length),
      coverage: ratio(intentsCovered.length, answered.length),
      coveredExact: ratio(count(intentsCovered, r => r.gold.intent === r.result.intent), intentsCovered.length) },
    graph: {
      raw: sets(rows, supported, r => r.rawClaims ?? []),
      guarded: sets(rows, supported, r => r.guardedClaims ?? []),
      protectedRaw: sets(rows, r => protectedOnly(supported(r)), r => protectedOnly(r.rawClaims ?? [])),
      protectedGuarded: sets(rows, r => protectedOnly(supported(r)), r => protectedOnly(r.guardedClaims ?? [])),
      guardRejected: count(rows, r => r.validation && !['draft', 'no-claims'].includes(r.validation)),
      completeProtectedEligible: count(rows, r => r.topologyComplete && protectedOnly(supported(r)).length > 0),
    },
    operation: { exact: ratio(count(rows, r => r.gold.operation === r.result?.operation), rows.length), executed: 0 },
    confusions: { identity: classes(rows, r => r.gold.identity, r => r.result?.identity),
      intent: classes(rows, r => r.gold.intent, r => r.result?.intent),
      operation: classes(rows, r => r.gold.operation, r => r.result?.operation) },
  }
}

export function clusterBootstrap(rows) {
  const grouped = new Map()
  for (const r of rows) {
    const g = grouped.get(r.cluster) ?? [0, 0]
    const e = new Set(supported(r))
    const p = [...new Set(protectedOnly(r.guardedClaims ?? []))]
    g[0] += p.filter(k => e.has(k)).length
    g[1] += p.length
    grouped.set(r.cluster, g)
  }
  const groups = [...grouped.values()], results = []
  let state = seed
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296)
  for (let i = 0; i < 2000; i++) {
    let n = 0, d = 0
    for (let j = 0; j < groups.length; j++) {
      const [a, b] = groups[Math.floor(random() * groups.length)]
      n += a; d += b
    }
    if (d) results.push(n / d)
  }
  results.sort((a, b) => a - b)
  const valid = results.length >= 1900
  return { seed, clusters: groups.length, repetitions: 2000, defined: results.length,
    interval: valid ? [results[Math.floor(0.025 * (results.length - 1))], results[Math.floor(0.975 * (results.length - 1))]] : null }
}
