import { mkdirSync, writeFileSync, readFileSync, appendFileSync, lstatSync, openSync, closeSync, unlinkSync } from 'node:fs'
import { resolve, relative, isAbsolute, dirname, join } from 'node:path'
import { hash } from '../protocol/contracts.mjs'
import { checkedRevision } from './revision-policy.mjs'
import { REQUEST_BYTES, CHANNEL_BYTES, id, money, keys, coordinate, bytes, totals, transition } from './ledger-state.mjs'
import { BINARY_STORAGE, encodeTransaction } from './transaction-frame.mjs'
import { auditBinaryJournal } from './stream-audit.mjs'

export const GATE2_EVIDENCE_ROOT = resolve('E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2')

function safePath(path) {
  const rel = relative(GATE2_EVIDENCE_ROOT, path)
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('outside Gate 2 evidence root')
  for (let p = path; ; p = dirname(p)) {
    if (lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('linked evidence path')
    if (dirname(p) === p) break
  }
}


export function openRunLedger({ root, runId, freezeHash, limits, resume = false, evidenceKind = 'offline-ledger-test', revision, storageProtocol }) {
  const binary = storageProtocol === BINARY_STORAGE
  const transactional = binary || storageProtocol === 'raw-first-transaction-v1'
  if (storageProtocol !== undefined && (!transactional || evidenceKind !== 'offline-boundary-test')) throw new Error('storage protocol is offline only')
  revision = checkedRevision(revision)
  if (!id(runId)) throw new Error('invalid run id')
  if (typeof freezeHash !== 'string' || !/^[a-f0-9]{64}$/.test(freezeHash)) throw new Error('invalid freeze hash')
  const uncapped = limits?.mode === 'uncapped'
  const extended = evidenceKind !== 'offline-ledger-test'
  if (revision && (!extended || !uncapped)) throw new Error('revision requires extended uncapped ledger')
  if(!['offline-ledger-test','offline-boundary-test','development-model-run'].includes(evidenceKind)||(extended&&!uncapped))throw new Error('invalid evidence kind')
  const valid = uncapped
    ? keys(limits, ['mode', 'maxCalls', 'maxCostMicros', 'currency', 'scheduledCalls', 'authorizationRef']) && limits.maxCalls === null && limits.maxCostMicros === null && Number.isSafeInteger(limits.scheduledCalls) && limits.scheduledCalls > 0 && id(limits.authorizationRef)
    : keys(limits, ['maxCalls', 'maxCostMicros', 'currency']) && Number.isInteger(limits.maxCalls) && limits.maxCalls >= 1 && limits.maxCalls <= 576 && money(limits.maxCostMicros)
  if (!valid || typeof limits.currency !== 'string' || !/^[A-Z]{3}$/.test(limits.currency)) throw new Error('invalid run limits')
  const pinnedLimits = { maxCalls: limits.maxCalls, maxCostMicros: limits.maxCostMicros, currency: limits.currency,
    ...(uncapped ? { mode: 'uncapped', scheduledCalls: limits.scheduledCalls, authorizationRef: limits.authorizationRef } : {}) }
  const base = resolve(root), path = join(base, runId)
  safePath(path)
  const manifest = { version: binary ? 'gate2-run-v6' : transactional ? 'gate2-run-v5' : revision ? 'gate2-run-v4' : extended ? 'gate2-run-v3' : uncapped ? 'gate2-run-v2' : 'gate2-run-v1', evidenceKind, runId, split: 'dev', freezeHash, limits: pinnedLimits, requestByteLimit: REQUEST_BYTES, channelByteLimit: CHANNEL_BYTES, ...(revision ? { revision } : {}), ...(transactional ? { storageProtocol } : {}) }
  const manifestRaw = JSON.stringify(manifest), manifestHash = hash(manifestRaw)
  const manifestPath = join(path, 'manifest.json'), journalPath = join(path, binary ? 'transactions.bin' : 'events.jsonl'), lockPath = join(path, 'writer.lock')
  if (!resume) {
    mkdirSync(base, { recursive: true }); mkdirSync(path)
    writeFileSync(manifestPath, manifestRaw, { flag: 'wx', flush: true })
    writeFileSync(journalPath, '', { flag: 'wx', flush: true })
  }
  let cache = null, checkpoint = null, poisoned = false
  const auditTokens = new WeakMap()
  const diagnostics = { full_replays: 0, capture_cache_hits: 0, fingerprint_misses: 0,
    append_calls: 0, flush_requests: 0, physical_bytes_appended: 0, logical_events_appended: 0,
    append_flush_ms: 0, full_audit_ms: 0, locked_work_ms: 0 }
  const fingerprint = () => {
    const s = lstatSync(journalPath, { bigint: true })
    if (!s.isFile() || s.isSymbolicLink()) throw new Error('invalid journal file')
    return [s.dev, s.ino, s.size, s.mtimeNs, s.ctimeNs, s.birthtimeNs].join(':')
  }
  function exclusive(fn) {
    safePath(path)
    for (const file of [manifestPath, journalPath, lockPath]) {
      if (lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('linked evidence path')
    }
    let fd
    try { fd = openSync(lockPath, 'wx') } catch (e) { if (e.code === 'EEXIST') throw new Error('writer lock busy or stale'); throw e }
    const started = performance.now()
    try { return fn() } finally { diagnostics.locked_work_ms += performance.now() - started; closeSync(fd); unlinkSync(lockPath) }
  }
  function replay(materialize = false) {
    const started = performance.now()
    diagnostics.full_replays++
    if (readFileSync(manifestPath, 'utf8') !== manifestRaw) throw new Error('foreign or altered manifest')
    const before = fingerprint()
    if (binary) {
      const state = auditBinaryJournal({ path: journalPath, manifestHash, limits: pinnedLimits, revision, freezeHash, checkpoint, materialize })
      if (fingerprint() !== before) throw new Error('journal changed during audit')
      cache = { state, fingerprint: before }
      checkpoint = { seq: state.seq, digest: state.digest, physical_seq: state.physical_seq, physical_digest: state.physical_digest }
      diagnostics.full_audit_ms += performance.now() - started
      return state
    }
    const text = readFileSync(journalPath, 'utf8')
    if (text && !text.endsWith('\n')) throw new Error('partial journal')
    const state = { attempts: [], halted: false, seq: 0, digest: manifestHash,
      ...(transactional ? { physical_seq: 0, physical_digest: manifestHash } : {}) }
    for (const line of text ? text.slice(0, -1).split('\n') : []) {
      const frame = JSON.parse(line)
      let events = [frame]
      if (transactional) {
        if (!keys(frame, ['version', 'seq', 'previous', 'attemptId', 'first', 'last', 'events', 'digest'])) throw new Error('transaction fields')
        const { digest, ...body } = frame
        if (body.version !== 'gate2-transaction-v1' || body.seq !== state.physical_seq + 1 || body.previous !== state.physical_digest || digest !== hash(body) ||
            !Array.isArray(body.events) || !body.events.length || body.first !== state.seq + 1 || body.last !== body.first + body.events.length - 1 ||
            body.events.some(e => e.value?.attemptId !== body.attemptId) || (body.events.length > 1 && body.events.some(e => e.kind !== 'capture'))) throw new Error('transaction digest or range')
        events = body.events
        state.physical_seq = body.seq; state.physical_digest = digest
        if (checkpoint && state.physical_seq === checkpoint.physical_seq && digest !== checkpoint.physical_digest) throw new Error('known physical checkpoint changed')
      }
      for (const event of events) {
        if (!keys(event, ['seq', 'previous', 'kind', 'value', 'digest'])) throw new Error('journal fields')
        const { digest, ...body } = event
        if (body.seq !== state.seq + 1 || body.previous !== state.digest || digest !== hash(body)) throw new Error('journal digest')
        transition(state, body.kind, body.value, pinnedLimits, extended, revision, freezeHash)
        state.seq = body.seq; state.digest = digest
        if (checkpoint && state.seq === checkpoint.seq && state.digest !== checkpoint.digest) throw new Error('known checkpoint changed')
      }
    }
    if (checkpoint && state.seq < checkpoint.seq) throw new Error('known checkpoint rollback')
    if (transactional && checkpoint && state.physical_seq < checkpoint.physical_seq) throw new Error('known physical checkpoint rollback')
    if (fingerprint() !== before) throw new Error('journal changed during audit')
    state.budget = totals(state.attempts, pinnedLimits)
    cache = { state, fingerprint: before }
    checkpoint = { seq: state.seq, digest: state.digest, physical_seq: state.physical_seq, physical_digest: state.physical_digest }
    diagnostics.full_audit_ms += performance.now() - started
    return state
  }
  function appendMany(entries) {
    if (poisoned) throw new Error('poisoned writer; audit/recovery required, no resend')
    return exclusive(() => {
      try {
        if (readFileSync(manifestPath, 'utf8') !== manifestRaw) throw new Error('foreign or altered manifest')
        const captures = entries.every(e => e.kind === 'capture')
        const hit = captures && cache && fingerprint() === cache.fingerprint
        if (hit) diagnostics.capture_cache_hits++
        else if (captures && cache) diagnostics.fingerprint_misses++
        const state = hit ? cache.state : replay()
        const first = state.seq + 1, events = []
        for (const { kind, value } of entries) {
          transition(state, kind, value, pinnedLimits, extended, revision, freezeHash)
          const body = { seq: state.seq + 1, previous: state.digest, kind, value }, digest = hash(body)
          events.push({ ...body, digest }); state.seq = body.seq; state.digest = digest
        }
        let frame = events[0]
        if (binary) frame = encodeTransaction({ seq: state.physical_seq + 1, previous: state.physical_digest, events })
        else if (transactional) {
          const body = { version: 'gate2-transaction-v1', seq: state.physical_seq + 1, previous: state.physical_digest,
            attemptId: entries[0].value.attemptId, first, last: state.seq, events }
          frame = { ...body, digest: hash(body) }
        }
        const serialized = binary ? frame.bytes : JSON.stringify(frame) + '\n', started = performance.now()
        diagnostics.append_calls++; diagnostics.flush_requests++
        try { appendFileSync(journalPath, serialized, { flush: true }) }
        catch (e) { if (transactional) poisoned = true; throw e }
        finally { diagnostics.append_flush_ms += performance.now() - started }
        diagnostics.physical_bytes_appended += Buffer.byteLength(serialized)
        diagnostics.logical_events_appended += entries.length
        if (transactional) { state.physical_seq = frame.seq; state.physical_digest = frame.digest }
        checkpoint = { seq: state.seq, digest: state.digest, physical_seq: state.physical_seq, physical_digest: state.physical_digest }
        cache = { state, fingerprint: fingerprint() }
        return entries[0].value.attemptId
      } catch (e) { cache = null; throw e }
    })
  }
  const append = (kind, value) => appendMany([{ kind, value }])
  const captureValue = ({ attemptId, channel, bytes: data, elapsedMs }) => {
    const b = bytes(data, CHANNEL_BYTES, 'capture')
    return { attemptId, channel, bytes_base64: b.toString('base64'), sha256: hash(b), elapsedMs }
  }
  exclusive(replay)
  return Object.freeze({
    path,
    snapshot: () => structuredClone(exclusive(() => replay(true))),
    auditSummary() {
      if (!binary) throw new Error('stream audit requires binary offline storage')
      return exclusive(() => {
        const state = replay(), result = structuredClone(state)
        auditTokens.set(result, { ...checkpoint, fingerprint: cache.fingerprint, attemptIds: new Set(state.attempts.map(a => a.attemptId)) })
        return result
      })
    },
    readAuditedAttempt(summary, attemptIds) {
      if (!binary || !auditTokens.has(summary)) throw new Error('invalid audit token')
      if (!Array.isArray(attemptIds) || attemptIds.some(id => !auditTokens.get(summary).attemptIds.has(id))) throw new Error('invalid audited selection')
      return exclusive(() => {
        const pin = auditTokens.get(summary)
        if (fingerprint() !== pin.fingerprint) throw new Error('stale audit token')
        const state = replay(new Set(attemptIds))
        if (state.digest !== pin.digest || state.physical_digest !== pin.physical_digest || state.seq !== pin.seq || state.physical_seq !== pin.physical_seq) throw new Error('stale audit head')
        return structuredClone(state.attempts.filter(a => attemptIds.includes(a.attemptId)))
      })
    },
    diagnostics: () => ({ ...diagnostics }),
    reserve({ coordinate: c, requestBytes, maxCostMicros, answerHash = null }) {
      const canonical = coordinate(c), request = bytes(requestBytes, REQUEST_BYTES, 'request')
      return append('reserve', { attemptId: hash(canonical), coordinate: canonical, request_base64: request.toString('base64'), request_sha256: hash(request), maxCostMicros, answer_sha256: answerHash })
    },
    capture({ attemptId, channel, bytes: data, elapsedMs }) {
      return append('capture', captureValue({ attemptId, channel, bytes: data, elapsedMs }))
    },
    captureBatch(captures) {
      if (!transactional || !Array.isArray(captures) || !captures.length) throw new Error('invalid transaction batch')
      if (captures.some(c => c.attemptId !== captures[0].attemptId)) throw new Error('mixed attempt batch')
      return appendMany(captures.map(c => ({ kind: 'capture', value: captureValue(c) })))
    },
    settle({ attemptId, outcome, actualCostMicros }) { return append('settle', { attemptId, outcome, actualCostMicros }) }
  })
}
