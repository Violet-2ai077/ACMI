import { hash } from '../protocol/contracts.mjs'
import { auditDiagnosticCensor } from './revision-policy.mjs'

const MAX_MICROS = 1_000_000_000_000
const REQUEST_BYTES = 1_048_576
const CHANNEL_BYTES = 4_194_304
const id = v => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v)
const money = v => Number.isSafeInteger(v) && v >= 0 && v <= MAX_MICROS
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) && same(Object.keys(value).sort(), [...expected].sort())
const channelTotals = new WeakMap()
const stateIndexes = new WeakMap()
export function indexState(state) { stateIndexes.set(state, new Map(state.attempts.map(a => [a.attemptId, a]))); return state }
const findAttempt = (state, attemptId) => stateIndexes.has(state) ? stateIndexes.get(state).get(attemptId) : state.attempts.find(a => a.attemptId === attemptId)

function coordinate(c) {
  if (!keys(c, ['family_id', 'condition', 'arm', 'track', 'turn_id', 'stage']) || !id(c.family_id) || !id(c.turn_id) ||
      !['C1', 'C2', 'C3'].includes(c.condition) || !['A', 'B', 'C0', 'D'].includes(c.arm) ||
      !['CLOSED-LOOP', 'FROZEN-REPLAY'].includes(c.track) ||
      (c.arm === 'D' ? c.track !== 'FROZEN-REPLAY' || !['answer', 'marker'].includes(c.stage) : c.stage !== 'single') ||
      (c.arm === 'C0' && c.track !== 'CLOSED-LOOP')) throw new Error('invalid coordinate')
  return { family_id: c.family_id, condition: c.condition, arm: c.arm, track: c.track, turn_id: c.turn_id, stage: c.stage }
}

function bytes(value, max, label) {
  if (!(typeof value === 'string' || Buffer.isBuffer(value) || value instanceof Uint8Array)) throw new Error(`invalid ${label} bytes`)
  const b = Buffer.from(value)
  if (!b.length || b.length > max) throw new Error(`${label} byte budget`)
  return b
}

function decode(base64, digest, max, label) {
  if (typeof base64 !== 'string') throw new Error(`${label} base64`)
  const b = bytes(Buffer.from(base64, 'base64'), max, label)
  if (b.toString('base64') !== base64 || hash(b) !== digest) throw new Error(`${label} digest`)
  return b
}

function totals(attempts, limits) {
  if (limits.mode === 'uncapped') {
    const settled = attempts.filter(a => a.settlement)
    const unknownCostCalls = settled.filter(a => a.settlement.actualCostMicros === null).length
    const knownChargedMicros = settled.reduce((n, a) => n + (a.settlement.actualCostMicros ?? 0), 0)
    if (!Number.isSafeInteger(knownChargedMicros)) throw new Error('cost accounting precision exceeded')
    return { usedCalls: attempts.length, chargedMicros: unknownCostCalls ? null : knownChargedMicros,
      knownChargedMicros, unknownCostCalls, reservedMicros: null, availableMicros: null }
  }
  let chargedMicros = 0, reservedMicros = 0
  for (const a of attempts) {
    if (a.settlement?.actualCostMicros != null) chargedMicros += a.settlement.actualCostMicros
    else if (a.settlement) chargedMicros += a.maxCostMicros
    else reservedMicros += a.maxCostMicros
  }
  return { usedCalls: attempts.length, chargedMicros, reservedMicros, availableMicros: limits.maxCostMicros - chargedMicros - reservedMicros }
}

function transition(state, kind, v, limits, extended = false, revision, freezeHash) {
  if (kind === 'reserve') {
    if (!keys(v, ['attemptId', 'coordinate', 'request_base64', 'request_sha256', 'maxCostMicros', 'answer_sha256'])) throw new Error('reserve fields')
    const c = coordinate(v.coordinate)
    if (v.attemptId !== hash(c)) throw new Error('attempt coordinate digest')
    if (findAttempt(state, v.attemptId)) throw new Error('duplicate generation')
    if (state.halted) throw new Error('run halted')
    if (state.attempts.some(a => !a.settlement)) throw new Error('in-flight reservation')
    const uncapped = limits.mode === 'uncapped'
    if (uncapped ? v.maxCostMicros !== null : !money(v.maxCostMicros)) throw new Error('invalid cost bound')
    const budget = totals(state.attempts, limits)
    if (uncapped ? budget.usedCalls >= limits.scheduledCalls : budget.usedCalls >= limits.maxCalls) throw new Error(uncapped ? 'fixed schedule exhausted' : 'call budget')
    if (!uncapped && v.maxCostMicros > budget.availableMicros) throw new Error('cost budget')
    if (c.arm === 'D' && c.stage === 'marker') {
      const first = findAttempt(state, hash({ ...c, stage: 'answer' }))
      if (!first || first.settlement?.outcome !== 'success') throw new Error('D answer missing or unsuccessful')
      const answer = first.compacted ? null : Buffer.concat(first.chunks.filter(chunk => chunk.channel === 'model').map(chunk => Buffer.from(chunk.bytes_base64, 'base64')))
      if (!(first.compacted ? first.model_bytes : answer.length) || v.answer_sha256 !== (first.compacted ? first.model_sha256 : hash(answer))) throw new Error('D answer digest mismatch')
    } else if (v.answer_sha256 !== null) throw new Error('unexpected answer digest')
    decode(v.request_base64, v.request_sha256, REQUEST_BYTES, 'request')
    state.attempts.push({ ...v, chunks: [], settlement: null })
    stateIndexes.get(state)?.set(v.attemptId, state.attempts.at(-1))
  } else if (kind === 'capture') {
    if (!keys(v, ['attemptId', 'channel', 'bytes_base64', 'sha256', 'elapsedMs'])) throw new Error('capture fields')
    const a = findAttempt(state, v.attemptId)
    if (!a) throw new Error('unreserved attempt')
    if (a.settlement) throw new Error('attempt settled')
    if (!(extended ? ['wire','model','reasoning','transport'] : ['wire','model']).includes(v.channel)) throw new Error('capture channel')
    if (!Number.isFinite(v.elapsedMs) || v.elapsedMs < 0 || v.elapsedMs < (a.chunks.at(-1)?.elapsedMs ?? 0)) throw new Error('non-monotonic capture time')
    const b = decode(v.bytes_base64, v.sha256, CHANNEL_BYTES, 'capture')
    let sizes = channelTotals.get(a)
    if (!sizes) {
      sizes = {}
      for (const c of a.chunks) sizes[c.channel] = (sizes[c.channel] ?? 0) + Buffer.from(c.bytes_base64, 'base64').length
      channelTotals.set(a, sizes)
    }
    const previous = sizes[v.channel] ?? 0
    if (previous + b.length > CHANNEL_BYTES) throw new Error('channel byte budget')
    a.chunks.push({ ...v })
    sizes[v.channel] = previous + b.length
  } else if (kind === 'settle') {
    if (!keys(v, ['attemptId', 'outcome', 'actualCostMicros'])) throw new Error('settlement fields')
    const a = findAttempt(state, v.attemptId)
    if (!a) throw new Error('unreserved attempt')
    if (a.settlement) throw new Error('attempt settled')
    if (!(revision ? ['success', 'error', 'unknown', 'diagnostic_censored'] : ['success', 'error', 'unknown']).includes(v.outcome) || (v.actualCostMicros !== null && !money(v.actualCostMicros))) throw new Error('invalid settlement')
    if (v.outcome === 'diagnostic_censored') auditDiagnosticCensor(a, { revision, limits, freezeHash })
    a.settlement = { ...v }
    if (!['success', 'diagnostic_censored'].includes(v.outcome) || (limits.mode !== 'uncapped' && (v.actualCostMicros === null || v.actualCostMicros > a.maxCostMicros))) state.halted = true
  } else throw new Error('unknown journal event')
}


export { REQUEST_BYTES, CHANNEL_BYTES, id, money, same, keys, coordinate, bytes, decode, totals, transition }
