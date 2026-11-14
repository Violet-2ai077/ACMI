import { readFileSync } from 'node:fs'
import { dirname, basename, join } from 'node:path'
import { CONDITIONS, hash } from '../protocol/contracts.mjs'
import { openLedger } from '../ledger/store.mjs'
import { readRaw } from '../evaluator/read-raw.mjs'
import { scoreAttempt, aggregate } from '../evaluator/score.mjs'

export const zeroErrorUpperBound = n => Number.isInteger(n) && n > 0 ? 1 - Math.pow(0.05, 1 / n) : null
const categories = ['continuity', 'switch', 'parallel', 'new', 'branch-merge', 'ambiguous']
const levels = ['simple', 'medium', 'hard']
function quantile(xs, q) {
  const sorted = xs.filter(x => typeof x === 'number').sort((a, b) => a - b)
  return sorted.length ? sorted[Math.ceil(q * sorted.length) - 1] : null
}
function describe(m) {
  const cells = categories.flatMap(category => levels.map(difficulty => {
    const rows = m.rows.filter(r => r.category === category && r.difficulty === difficulty)
    return { category, difficulty, attempts: rows.length,
      independent_stories: new Set(rows.map(r => r.family_id)).size,
      user_f1: rows.length ? aggregate(rows, { condition: m.condition, arm: m.arm, track: m.track, split: m.split }).user.f1 : null,
      interval: null }
  }))
  const erroneousStories = new Set(m.rows.filter(r => r.forbidden || r.state.false_actual_completions).map(r => r.family_id)).size
  const latency = m.rows.map(r => r.clocks?.total_ms)
  return {
    ...m, cells,
    state_themes: Array.from({ length: 6 }, (_, i) => {
      const theme = 'SM' + (i + 1), rows = m.rows.filter(r => r.themes.includes(theme))
      return { theme, opportunities: rows.length, snapshots_correct: rows.filter(r => r.state.snapshot_exact).length }
    }),
    engineering: { attribution: m.user.f1 !== null && m.user.f1 >= 0.92,
      state_maintenance: m.state_macro_f1 !== null && m.state_macro_f1 >= 0.90 && m.state_snapshot_exact >= 0.85,
      observed_high_risk_story_rate: m.independent_stories ? erroneousStories / m.independent_stories : null },
    statistical_risk: { unit: 'independent-story', confidence: 0.95, stories_with_error: erroneousStories,
      zero_error_upper_bound: erroneousStories === 0 ? zeroErrorUpperBound(m.independent_stories) : null,
      qualification: 'Descriptive synthetic fixtures, not a population guarantee; nonzero-event interval deferred to confirmatory design.' },
    performance: { kind: 'fake-observation-not-model-latency', p50_ms: quantile(latency, 0.5), p95_ms: quantile(latency, 0.95),
      tokens: m.rows.every(r => r.usage) ? m.rows.reduce((n, r) => n + r.usage.input + r.usage.output, 0) : null,
      token_overhead: null }
  }
}

export function buildReport(metrics, diagnostics = [], manifest = {}) {
  if (metrics.some(m => m.arm === 'D' || m.diagnostic_only)) throw new Error('D diagnostic must stay separate')
  if (diagnostics.some(d => d.split !== 'dev')) throw new Error('D requires dev')
  const conditions = Object.fromEntries(CONDITIONS.map(c => [c, metrics.filter(m => m.condition === c).map(describe)]))
  if (metrics.some(m => !CONDITIONS.includes(m.condition))) throw new Error('condition required')
  const json = { version: 'gate-1-report-v1', decision: 'OFFLINE_ONLY_NOT_RESEARCH_GO',
    manifest, conditions, diagnostics, unverified: ['live model ability', 'real streaming', 'token overhead', 'confirmatory intervals', 'production integration'] }
  const lines = ['# ACMI Phase 0.9.19 Gate 1 offline report', '', 'Fake transport only. No research GO and no pooled context score.', '']
  for (const c of CONDITIONS) {
    lines.push('## ' + c, '', '| Arm / track | Attempts | User F1 | State snapshot |', '| --- | ---: | ---: | ---: |')
    for (const m of conditions[c]) lines.push('| ' + m.arm + ' / ' + m.track + ' | ' + m.attempts + ' | ' + (m.user.f1 ?? 'N/A') + ' | ' + (m.state_snapshot_exact ?? 'N/A') + ' |')
    if (!conditions[c].length) lines.push('| Unobserved | 0 | N/A | N/A |')
    lines.push('')
  }
  lines.push('## Diagnostic D', '', diagnostics.length + ' development diagnostic entries; excluded from A/B and GO.', '',
    '## Unverified', '', ...json.unverified.map(s => '- ' + s), '')
  return { json, markdown: lines.join('\n') }
}

export function evaluateArchive({ archiveRoot, oraclePath }) {
  const manifest = JSON.parse(readFileSync(join(archiveRoot, 'manifest.json'), 'utf8'))
  const ledger = openLedger({ root: dirname(archiveRoot), runId: basename(archiveRoot), scope: manifest.scope, resume: true })
  const saved = ledger.restore()
  const oracleBytes = readFileSync(oraclePath)
  if (!manifest.oracle_hash || hash(oracleBytes) !== manifest.oracle_hash) throw new Error('frozen oracle digest mismatch or absent')
  const oracle = JSON.parse(oracleBytes.toString('utf8'))
  const rows = [], diagnostics = [], baselines = [], maps = new Map()
  for (const attempt of saved.attempts) {
    const p = JSON.parse(readFileSync(join(archiveRoot, 'inputs', attempt.attempt_id + '.json'), 'utf8'))
    const raw = readFileSync(join(archiveRoot, 'outputs', attempt.attempt_id + '.raw'))
    if (attempt.arm === 'D' && attempt.stage === 'answer') {
      if (!saved.attempts.some(a => a.pair_id === attempt.pair_id && a.stage === 'marker')) diagnostics.push({ ...attempt, diagnostic_only: true, valid: false, failure: 'D1 incomplete; D2 not called' })
      continue
    }
    const prediction = readRaw(raw, { arm: attempt.arm, inputPacket: p, answerText: p.answerText })
    const g = oracle[p.context_condition]?.[p.turn_id]
    if (!g) throw new Error('oracle does not cover archived request')
    if (attempt.arm === 'C0') {
      const text = prediction.answer.map(b => b.text).join('\n')
      baselines.push({ condition: p.context_condition, arm: 'C0', turn_id: p.turn_id, valid: prediction.valid && attempt.finish_reason === 'stop',
        answer_passed: prediction.valid && attempt.finish_reason === 'stop' && g.answer.every(a => a.contains.every(x => text.includes(x)) && a.excludes.every(x => !text.includes(x))),
        usage: attempt.usage, clocks: attempt.clocks })
      continue
    }
    const k = [p.family_id, p.context_condition, p.arm, attempt.track].join(':')
    if (!maps.has(k)) maps.set(k, {})
    const row = scoreAttempt({ inputPacket: p, oracle: g, attempt, rawPrediction: prediction, identityMap: maps.get(k) })
    if (attempt.arm === 'D') {
      const first = saved.attempts.find(a => a.pair_id === attempt.pair_id && a.stage === 'answer')
      diagnostics.push({ ...row, pair_usage: first?.usage && attempt.usage ? { input: first.usage.input + attempt.usage.input, output: first.usage.output + attempt.usage.output } : null })
    } else rows.push(row)
  }
  const groups = new Map()
  for (const r of rows) {
    const k = [r.context_condition, r.arm, r.track, r.split].join(':')
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }
  const metrics = [...groups.values()].map(rs => aggregate(rs, { condition: rs[0].context_condition, arm: rs[0].arm, track: rs[0].track, split: rs[0].split }))
  const result = buildReport(metrics, diagnostics, manifest)
  result.json.baselines = baselines
  return result
}
