import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { freezeInput } from './policy.mjs'
import cfg from './config.json' with { type: 'json' }

const [run, benchmark, output, ...extra] = process.argv.slice(2)
assert(run && benchmark && output && !extra.length)
const load = (dir, file) => JSON.parse(readFileSync(join(dir, file), 'utf8'))
const contract = load(benchmark, 'frozen-contract.json')
const inputs = freezeInput(contract, load(benchmark, 'requests.offline.json'), cfg).requests
const key = ({ storyId, mode }) => JSON.stringify([storyId, mode])
const byKey = new Map(inputs.map(x => [key(x), x]))
const { records } = load(run, 'local-responses.json')
const counters = { invalidCoordinates: 0, quoteNotInSource: 0, duplicateRef: 0, citedAbsentSource: 0, nonNullHandleOnAbstention: 0 }
const choices = {}
let parsed = 0
for (const receipt of records) {
  const item = byKey.get(key(receipt))
  assert(item && item.requestDigest === receipt.requestDigest)
  let row
  try { row = JSON.parse(receipt.raw) } catch { continue }
  if (!row || typeof row !== 'object') continue
  parsed++
  const decision = typeof row.decision === 'string' && ['suggest_active', 'reference_history', 'clarify', 'no_suggestion'].includes(row.decision)
    ? row.decision : 'unknown'
  choices[decision] = (choices[decision] ?? 0) + 1
  const seen = new Set()
  const flags = new Set()
  for (const e of Array.isArray(row.evidence) ? row.evidence : []) {
    if (!e || !['current', 'antecedent'].includes(e.ref) || typeof e.quote !== 'string') continue
    if (seen.has(e.ref)) flags.add('duplicateRef')
    seen.add(e.ref)
    const text = item.payload[e.ref]?.text
    if (text === undefined) { flags.add('citedAbsentSource'); continue }
    if (!text.includes(e.quote)) flags.add('quoteNotInSource')
    if (!Number.isSafeInteger(e.start) || !Number.isSafeInteger(e.end) || e.start < 0 || e.end <= e.start || e.end > text.length
      || text.slice(e.start, e.end) !== e.quote) flags.add('invalidCoordinates')
  }
  if (['clarify', 'no_suggestion'].includes(decision) && row.handle !== null) flags.add('nonNullHandleOnAbstention')
  for (const flag of flags) counters[flag]++
}
const native = readFileSync(join(run, 'runtime-stderr.txt'), 'utf8')
const backendGenerations = [...native.matchAll(/processing task, is_child = 0/gu)].length
const ledger = readFileSync(join(run, 'generation-ledger.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(s => JSON.parse(s))
const durations = ledger.filter(x => x.kind === 'completed').map(x => x.elapsedMs).sort((a, b) => a - b)
const p = q => durations.length ? durations[Math.ceil(durations.length * q) - 1] : null
const audit = { provenance: 'post_run_diagnostic_no_repair_no_rescore', n: records.length, parsed, choices,
  countersMayOverlap: counters, backendGenerations, generationElapsedMs: { p50: p(0.5), p95: p(0.95) } }
writeFileSync(output, JSON.stringify(audit, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify(audit))
