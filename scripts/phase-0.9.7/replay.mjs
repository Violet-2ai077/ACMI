import assert from 'node:assert/strict'
import { readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { evaluate } from './benchmark.mjs'
import { protocol, scoreResponse, validateResponse } from './contract.mjs'

const ratio = (n, d) => ({ n, d, rate: d ? n / d : null })
const key = (id, mode) => JSON.stringify([id, mode])
const recordKeys = ['storyId', 'mode', 'requestDigest', 'raw']

export function scoreOfflineBatch(rows, artifact) {
  assert(artifact?.protocol === protocol && Array.isArray(artifact.records)
    && artifact.records.length <= 2 * rows.length && Object.keys(artifact).length === 2, 'Invalid offline batch envelope')
  const known = new Map(rows.map(r => [key(r.storyId, r.mode), r]))
  assert.equal(known.size, rows.length)
  const indexed = new Map()
  let unknownRecords = 0
  for (const receipt of artifact.records) {
    if (typeof receipt?.storyId !== 'string' || !['off', 'on'].includes(receipt.mode)) { unknownRecords++; continue }
    const k = key(receipt.storyId, receipt.mode)
    if (!known.has(k)) { unknownRecords++; continue }
    const group = indexed.get(k) ?? []
    group.push(receipt)
    indexed.set(k, group)
  }
  const outcomes = [...known].map(([k, r]) => {
    const group = indexed.get(k)
    const base = { storyId: r.storyId, mode: r.mode, split: r.split }
    if (!group) return { ...base, status: 'missing' }
    if (group.length !== 1) return { ...base, status: 'duplicate' }
    const receipt = group[0]
    if (Object.keys(receipt).length !== recordKeys.length || recordKeys.some(key => !Object.hasOwn(receipt, key))) {
      return { ...base, status: 'schema_error' }
    }
    const out = validateResponse({ status: 'ready', requestDigest: r.requestDigest, payload: r.payload }, receipt)
    return { ...base, status: out.status, ...scoreResponse(out, r.expected, r.payload) }
  })
  const count = (rows, predicate) => rows.filter(predicate).length
  const accepted = count(outcomes, r => r.status === 'accepted_for_scoring')
  const missing = count(outcomes, r => r.status === 'missing')
  const duplicateKeys = count(outcomes, r => r.status === 'duplicate')
  const splits = Object.fromEntries(['dev', 'validation'].map(split => [split, Object.fromEntries(['off', 'on'].map(mode => {
    const selected = outcomes.filter(o => o.split === split && o.mode === mode)
    return [mode, { exact: ratio(count(selected, r => r.exact), selected.length),
      identityExact: ratio(count(selected, r => r.identityCorrect), selected.length),
      correctIdentityMissingSupport: count(selected, r => r.identityCorrect && !r.supportCorrect),
      wrongIdentity: count(selected, r => r.wrongIdentity) }]
  }))]))
  return { protocol, provenance: 'unverified_local_responses_not_a_provider_run', providerRequests: 0,
    accepted, missing, duplicateKeys, unknownRecords, invalidReceipts: rows.length - accepted - missing - duplicateKeys,
    splits, outcomes }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  assert.equal(process.argv.length, 4, 'Usage: node replay.mjs <local-responses.json> <new-score-report.json>')
  const [input, output] = process.argv.slice(2)
  const info = statSync(input)
  assert(info.isFile() && info.size <= 1024 * 1024, 'Offline receipt file too large')
  const { rows } = evaluate()
  const report = scoreOfflineBatch(rows, JSON.parse(readFileSync(input, 'utf8')))
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
}
