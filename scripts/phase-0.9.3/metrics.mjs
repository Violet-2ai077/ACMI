const pair = (n, d) => ({ n, d, rate: d ? n / d : null })
const has = (row, key) => Object.hasOwn(row.expected, key)
const sum = (rows, f) => rows.reduce((total, row) => total + Number(f(row)), 0)

function sets(rows, expected, predicted) {
  let tp = 0
  let fp = 0
  let fn = 0
  for (const row of rows) {
    const truth = new Set(expected(row))
    const observed = new Set(predicted(row))
    for (const value of observed) truth.has(value) ? tp++ : fp++
    for (const value of truth) if (!observed.has(value)) fn++
  }
  return { tp, fp, fn, precision: pair(tp, tp + fp), recall: pair(tp, tp + fn), f1: pair(2 * tp, 2 * tp + fp + fn) }
}

const resolvable = (expected) => ['active', 'historical'].includes(expected.status) && typeof expected.targetId === 'string'
const resolved = (observed) => ['active', 'historical'].includes(observed.identity)
const intentKnown = (observed) => ['none', 'discussion', 'existing', 'new'].includes(observed.relation)
const intentOK = (row) => ['relation', 'posture', 'change'].filter(key => has(row, key)).every(key => row[key] === row.expected[key])
const identityOK = (row) => row.identity === row.expected.status && (!resolvable(row.expected) || row.targetId === row.expected.targetId)

function layerConfusion(rows, expected, observed) {
  const matrix = Object.create(null)
  for (const row of rows) {
    const e = expected(row)
    const o = observed(row) ?? 'no_output'
    const cells = matrix[e] ??= Object.create(null)
    cells[o] = (cells[o] ?? 0) + 1
  }
  return matrix
}

function macroF1(matrix) {
  const expectedClasses = Object.keys(matrix)
  if (!expectedClasses.length) return null
  return expectedClasses.reduce((acc, name) => {
    const support = Object.values(matrix[name]).reduce((a, b) => a + b, 0)
    const emitted = Object.values(matrix).reduce((total, row) => total + (row[name] ?? 0), 0)
    return acc + 2 * (matrix[name][name] ?? 0) / (support + emitted)
  }, 0) / expectedClasses.length
}

export function metrics(rows) {
  const acts = rows.filter(row => has(row, 'acts'))
  const intent = rows.filter(row => has(row, 'relation'))
  const identity = rows.filter(row => has(row, 'status'))
  const eligibleIntent = intent.filter(row => row.expected.relation !== 'unknown')
  const eligibleIdentity = identity.filter(row => resolvable(row.expected))
  const claims = rows.filter(row => has(row, 'claims'))
  const mandatory = rows.filter(row => row.expected.mandatory === true)
  const modalKeys = ['quoted', 'negated', 'conditional']
  const flags = acts.flatMap(row => modalKeys.filter(key => has(row, key)).map(key => row.flags?.[key] === row.expected[key]))
  const byRelation = layerConfusion(intent, r => r.expected.relation, r => r.relation)
  const byPosture = layerConfusion(intent.filter(r => has(r, 'posture')), r => r.expected.posture, r => r.posture)
  const active = eligibleIdentity.filter(row => row.expected.status === 'active')
  const historical = eligibleIdentity.filter(row => row.expected.status === 'historical')
  const available = eligibleIdentity.filter(row => row.activeRanks.includes(row.expected.targetId)
    || row.historicalRanks.includes(row.expected.targetId))
  const noAnswer = eligibleIntent.filter(row => !intentKnown(row))
  return {
    focusTurns: rows.length,
    L1: {
      acts: sets(acts, r => r.expected.acts, r => r.acts),
      modalExact: pair(flags.filter(Boolean).length, flags.length),
      spanGold: 'not available in provisional fixture',
    },
    L2: {
      exact: pair(sum(intent, intentOK), intent.length),
      coverage: pair(sum(eligibleIntent, intentKnown), eligibleIntent.length),
      selectivePrecision: pair(sum(intent.filter(intentKnown), intentOK), intent.filter(intentKnown).length),
      relationMacroF1: macroF1(byRelation), postureMacroF1: macroF1(byPosture),
      unnecessaryAbstention: noAnswer.length,
      relationConfusion: byRelation, postureConfusion: byPosture,
    },
    L3: {
      exact: pair(sum(identity, identityOK), identity.length),
      coverage: pair(sum(eligibleIdentity, resolved), eligibleIdentity.length),
      selectivePrecision: pair(sum(identity.filter(resolved), identityOK), identity.filter(resolved).length),
      availableExact: pair(sum(available, identityOK), available.length),
      recallAt1: pair(sum(active, r => r.activeRanks.slice(0, 1).includes(r.expected.targetId)), active.length),
      recallAt3: pair(sum(active, r => r.activeRanks.slice(0, 3).includes(r.expected.targetId)), active.length),
      recallAt8: pair(sum(active, r => r.activeRanks.includes(r.expected.targetId)), active.length),
      historicalRecallAt2: pair(sum(historical, r => r.historicalRanks.includes(r.expected.targetId)), historical.length),
      candidateAbsent: eligibleIdentity.length - available.length,
      closedExact: pair(sum(historical, identityOK), historical.length),
      statusConfusion: layerConfusion(identity, r => r.expected.status, r => r.identity),
      falseMerge: sum(identity, r => resolved(r) && r.expected.targetId !== r.targetId),
      falseSplit: sum(eligibleIdentity, r => r.relation === 'new' || r.identity === 'unassigned'),
      wrongTarget: sum(eligibleIdentity, r => resolved(r) && r.expected.targetId !== r.targetId),
      unsafeForcedAssignment: sum(identity, r => !resolvable(r.expected) && resolved(r)),
    },
    L4: {
      raw: sets(claims, r => r.expected.claims, r => r.rawClaims),
      validated: sets(claims, r => r.expected.claims, r => r.validatedClaims),
      protectedCases: claims.filter(r => r.expected.claims.length > 0).length,
      falseResultAcceptance: sum(rows, r => r.validatedClaims.includes('result-accepted')),
      falseJoinSatisfaction: sum(rows, r => r.validatedClaims.includes('join-satisfied')),
      falseTaskCompletion: sum(rows, r => r.validatedClaims.includes('task-completed')),
      falseDecisionAcceptance: sum(claims, r => r.validatedClaims.includes('decision-accepted') && !r.expected.claims.includes('decision-accepted')),
      falseResultSummary: sum(claims, r => r.validatedClaims.includes('result-summary-proposed') && !r.expected.claims.includes('result-summary-proposed')),
      falseDependency: sum(claims, r => r.validatedClaims.includes('dependency-proposed') && !r.expected.claims.includes('dependency-proposed')),
    },
    L5: {
      nonNoOperation: sum(rows, r => r.authorization !== 'no_operation'),
      foreignCandidateExposure: sum(rows, r => r.foreignExposure),
      graphWriteCapability: false, automaticBindingCapability: false,
    },
    system: {
      mandatoryTriggerRecall: pair(sum(mandatory, r => r.trigger !== 'skip_metadata'), mandatory.length),
      mandatoryAnalysisSuccess: pair(sum(mandatory, r => r.analyzed), mandatory.length),
      mockCallsOnFocus: sum(rows, r => r.analyzed),
      budgetFailures: sum(rows, r => r.reason === 'insufficient_context'),
    },
  }
}

export function clusterIntervals(rows, seed = 9302301, iterations = 2000) {
  const grouped = new Map()
  for (const row of rows) {
    const cluster = grouped.get(row.cluster) ?? []
    cluster.push(row)
    grouped.set(row.cluster, cluster)
  }
  const clusters = [...grouped.values()]
  let rng = seed >>> 0
  const random = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 2 ** 32 }
  const draws = { intentCoverage: [], identityCoverage: [], protectedPrecision: [] }
  if (clusters.length) for (let i = 0; i < iterations; i++) {
    const sample = Array.from({ length: clusters.length }, () => clusters[Math.floor(random() * clusters.length)]).flat()
    const s = metrics(sample)
    if (s.L2.coverage.rate !== null) draws.intentCoverage.push(s.L2.coverage.rate)
    if (s.L3.coverage.rate !== null) draws.identityCoverage.push(s.L3.coverage.rate)
    if (s.L4.validated.precision.rate !== null) draws.protectedPrecision.push(s.L4.validated.precision.rate)
  }
  const intervals = Object.fromEntries(Object.entries(draws).map(([key, values]) => {
    values.sort((a, b) => a - b)
    return [key, { validDraws: values.length, low: values[Math.floor((values.length - 1) * 0.025)] ?? null,
      high: values[Math.ceil((values.length - 1) * 0.975)] ?? null }]
  }))
  return { method: 'percentile cluster bootstrap', clusterCount: clusters.length, seed, iterations, intervals,
    qualification: 'inconclusive_no_human_gold' }
}
