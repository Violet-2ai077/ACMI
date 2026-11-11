import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { adviseTaskReference, buildLayeredContext, createScopeAuthority, understandLayered } from '../../packages/core/dist/index.js'
import { buildCases, protocol, stories } from './traces.mjs'
import { loadCorpus } from '../phase-0.9.4/corpus.mjs'
import { makeCase, predict } from '../phase-0.9.4/evaluate.mjs'

const hash = value => createHash('sha256').update(value).digest('hex')
const write = (file, data) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' })
const ratio = (n, d) => ({ n, d, rate: d ? n / d : null })
const match = (a, b) => a.status === b.status && a.taskId === b.taskId
const record = ({ status, taskId = null }) => ({ status, taskId })

function accessFor(cut, denied = []) {
  const authority = createScopeAuthority()
  const scope = authority.grant(cut.workspaceId)
  return { authority, scope, sha256: hash, permitsTask: (_, id) => !denied.includes(id), readCurrentCut: () => cut }
}

function legacy(packet) {
  if (!packet) return record({ status: 'unavailable' })
  if (packet.current.actor !== 'user' || packet.current.kind !== 'message') return record({ status: 'no_suggestion' })
  const result = understandLayered(packet)
  const actionable = result.intents.findIndex(i => i.relation === 'existing' || i.relation === 'new')
  const index = actionable < 0 ? 0 : actionable
  const identity = result.identities[index]
  const row = [...packet.active, ...packet.historical].find(c => c.handle === identity?.handle)
  if (row) return record({ status: row.bindable ? 'suggest_active' : 'reference_history', taskId: row.taskId })
  return record({ status: identity?.status && ['unavailable', 'missing', 'ambiguous', 'stale'].includes(identity.status)
    ? 'clarify' : 'no_suggestion' })
}

export function evaluateTrace(c) {
  const access = accessFor(c.input.context.cut, c.denied)
  const { packet } = buildLayeredContext(c.input.context, access)
  const proposed = adviseTaskReference(c.input, access)
  if ('packetDigest' in proposed) assert.equal(proposed.packetDigest, packet?.digest)
  const active = packet?.active.map(x => x.taskId) ?? []
  const historical = packet?.historical.map(x => x.taskId) ?? []
  const { id, cluster, split, language, transform, oracle, invariant } = c
  const exposure = c.denied.some(id => active.includes(id) || historical.includes(id)) || c.input.context.candidates
    .some(row => row.workspaceId !== c.input.context.cut.workspaceId && (active.includes(row.taskId) || historical.includes(row.taskId)))
  return { id, cluster, split, language, transform, oracle, invariant, packetHash: packet?.digest ?? null,
    active, historical, outputs: { legacy: legacy(packet), advice: record(proposed) }, receipt: proposed, exposure }
}

function score(rows, arm) {
  const get = r => r.outputs[arm]
  const n = (list, predicate) => list.filter(predicate).length
  const yes = rows.filter(r => r.oracle.taskId !== null)
  const no = rows.filter(r => r.oracle.taskId === null)
  const issued = yes.filter(r => (r.oracle.status === 'suggest_active' ? r.active : r.historical).includes(r.oracle.taskId))
  const covered = rows.filter(r => get(r).taskId !== null)
  const bases = new Map(rows.filter(r => r.transform === 'base').map(r => [r.cluster, get(r)]))
  const invariants = rows.filter(r => r.invariant && bases.has(r.cluster))
  const correct = r => match(r.oracle, get(r))
  const wrong = r => get(r).taskId !== null && !correct(r)
  return { cases: rows.length, clusters: new Set(rows.map(r => r.cluster)).size,
    exact: ratio(n(rows, correct), rows.length), positives: yes.length, negatives: no.length,
    availability: ratio(issued.length, yes.length), exactGivenIssued: ratio(n(issued, correct), issued.length),
    correctPositiveCoverage: ratio(n(yes, correct), yes.length),
    identityOutputRate: ratio(covered.length, rows.length), exactOnIdentityOutput: ratio(n(covered, correct), covered.length),
    negativeIdentityOutputs: n(no, r => get(r).taskId !== null), wrongIdentityOutputs: n(rows, wrong),
    wrongTaskId: n(yes, r => get(r).taskId !== null && get(r).taskId !== r.oracle.taskId),
    missingOrRefusedPositive: n(yes, r => get(r).taskId === null),
    closedReturnedAsActive: n(rows, r => get(r).status === 'suggest_active' && r.historical.includes(get(r).taskId)),
    outOfViewOutputs: n(covered, r => ![...r.active, ...r.historical].includes(get(r).taskId)),
    exposure: n(rows, r => r.exposure), invariantGroups: new Set(invariants.map(r => r.cluster)).size,
    invariantPairs: ratio(n(invariants, r => match(bases.get(r.cluster), get(r))), invariants.length),
    clarified: n(rows, r => get(r).status === 'clarify'),
    noSuggestion: n(rows, r => get(r).status === 'no_suggestion'),
    unavailable: n(rows, r => get(r).status === 'unavailable'),
    byTransform: Object.fromEntries([...new Set(rows.map(r => r.transform))].map(t => {
      const group = rows.filter(r => r.transform === t)
      return [t, { exact: ratio(n(group, correct), group.length), wrongIdentityOutputs: n(group, wrong) }]
    })),
  }
}

export function runTraces() {
  const cases = buildCases()
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length)
  assert.equal(new Set(stories.map(s => s.id)).size, stories.length)
  const rows = cases.map(evaluateTrace)
  const splits = Object.fromEntries(['dev', 'validation'].map(split => {
    const subset = rows.filter(r => r.split === split)
    return [split, Object.fromEntries(['legacy', 'advice'].map(arm => [arm, score(subset, arm)]))]
  }))
  const v = splits.validation.advice
  const positiveBases = rows.filter(r => r.split === 'validation' && r.transform === 'base' && r.oracle.taskId).length
  const denominators = splits.dev.advice.clusters >= 10 && v.clusters >= 10 && positiveBases >= 10
    && v.negatives >= 10 && v.invariantGroups >= 5
  const safety = Object.values(splits).every(s => {
    const a = s.advice
    return a.wrongIdentityOutputs === 0 && a.closedReturnedAsActive === 0 && a.outOfViewOutputs === 0 && a.exposure === 0
  })
  const contract = safety && v.correctPositiveCoverage.rate >= 0.9 && v.exact.rate === 1
    && v.invariantPairs.rate === 1 && splits.dev.advice.exact.rate === 1
  return { cases, rows, report: { protocol, provenance: 'synthetic_trace_oracle_not_human_or_model_labels',
    decision: !safety ? 'FAIL' : !denominators ? 'INCONCLUSIVE' : contract ? 'PASS_READ_ONLY_CONTRACT' : 'FAIL',
    denominators: { pass: denominators, positiveBases }, safety, providerRequests: 0, holdoutRuns: 0,
    humanLabels: 0, runtimeWrites: 0, stories: stories.length, variants: rows.length, splits } }
}

export function openDiagnostic() {
  const summaries = {}
  for (const split of ['dev', 'validation']) {
    const rows = loadCorpus().filter(c => c.meta.split === split).map(({ input, gold, meta }) => {
      const { packet } = makeCase(input)
      const expected = ['active', 'historical'].includes(gold.identity) ? gold.taskId : null
      if (!packet) return { expected, issued: false, advice: null, legacy: null, family: meta.family }
      const candidates = [...packet.active, ...packet.historical].map(({ handle, bindable, ...row }) => ({
        ...row, workspaceId: packet.cut.workspaceId,
      }))
      const issued = candidates.some(t => t.taskId === expected)
      const complete = input.tasks.filter(t => t.workspaceId === input.workspaceId).every(t => candidates.some(c => c.taskId === t.taskId))
      const out = adviseTaskReference({ enabled: true, catalogComplete: complete,
        context: { cut: packet.cut, current: packet.current, binding: packet.binding, candidates,
          facts: packet.facts, retained: packet.retained } }, accessFor(packet.cut))
      return { expected, issued, advice: out.taskId ?? null, legacy: predict('093-layered', packet).taskId,
        family: meta.family }
    })
    const resolvable = rows.filter(r => r.expected !== null)
    const issued = resolvable.filter(r => r.issued)
    const counts = arm => {
      const covered = rows.filter(r => r[arm] !== null)
      return { identityOutputs: ratio(covered.length, rows.length),
        exactOnOutput: ratio(covered.filter(r => r[arm] === r.expected).length, covered.length),
        exactGivenIssued: ratio(issued.filter(r => r[arm] === r.expected).length, issued.length),
        wrongIdentityOutputs: covered.filter(r => r[arm] !== r.expected).length }
    }
    const families = [...new Set(issued.map(r => r.family))]
    summaries[split] = { n: rows.length, targetAvailable: ratio(issued.length, resolvable.length),
      legacy: counts('legacy'), advice: counts('advice'),
      legacyFailuresGivenIssued: Object.fromEntries(families.map(f =>
        [f, issued.filter(r => r.family === f && r.legacy !== r.expected).length])) }
  }
  return { provenance: 'phase-0.9.4-open-author-provisional-diagnostic-only',
    priorEvidenceSupplied: false, holdoutRuns: 0, providerRequests: 0, summaries }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert(process.argv.length === 3, 'Usage: node benchmark.mjs <new-output-directory>')
  const out = resolve(process.argv[2])
  const { cases, rows, report } = runTraces()
  const inputs = cases.map(({ id, input, denied }) => ({ id, input, denied }))
  const truth = cases.map(({ id, cluster, split, language, transform, trace, oracle }) =>
    ({ id, cluster, split, language, transform, trace, oracle }))
  mkdirSync(out)
  write(join(out, 'inputs.json'), inputs)
  write(join(out, 'oracle.json'), truth)
  write(join(out, 'predictions.json'), rows.map(({ oracle, ...row }) => row))
  write(join(out, 'metrics.json'), report)
  write(join(out, '094-open-diagnostic.json'), openDiagnostic())
  write(join(out, 'manifest.json'), { protocol, clusters: stories.map(({ id, split, language, mode }) => ({ id, split, language, mode })),
    inputsSha256: hash(JSON.stringify(inputs)), oracleSha256: hash(JSON.stringify(truth)), formalHoldout: 0 })
  console.log(JSON.stringify({ decision: report.decision, stories: report.stories, variants: report.variants,
    validation: Object.fromEntries(Object.entries(report.splits.validation).map(([k, { byTransform, ...s }]) => [k, s])) }))
  if (report.decision !== 'PASS_READ_ONLY_CONTRACT') process.exitCode = 1
}
