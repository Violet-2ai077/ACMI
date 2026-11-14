import { hash } from '../protocol/contracts.mjs'
import { createCompletionDecoder } from './transport.mjs'
import { DEADLINE_POLICY } from './deadline-transport.mjs'
import { INLINE_PROFILE } from './inline-profile.mjs'
import { resolve } from 'node:path'

export const REVISION_LIVE_AUTHORIZATION = 'owner-2026-11-15-revision-freeze-live-r4'
export const REVISION_BASELINE = 'a335bd5c340249021e534a3a8de23f079e504308cae41bd8350ea6c07470d168'
export const REVISION_LIVE_ROOT = 'E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/live-20261115-r4'

export function checkRevisionExecution(runtime, { root, runId, scheduledCalls }) {
  const r = checkedRevision(runtime.protocol_revision), a = runtime.execution_amendment
  if (r?.owner_authorization !== REVISION_LIVE_AUTHORIZATION || r.diagnostic_policy !== DEADLINE_POLICY || r.inline_profile !== INLINE_PROFILE ||
      a?.version !== 'gate2-revision-live-v1' || a.owner_authorization !== REVISION_LIVE_AUTHORIZATION ||
      a.batch_id !== 'live-20261115-r4' || a.run_id !== 'development' || runId !== a.run_id ||
      a.scheduled_calls !== 576 || scheduledCalls !== 576 || a.retries !== 0 || a.resend !== false ||
      a.prior_revision_manifest_sha256 !== REVISION_BASELINE || resolve(root) !== resolve(REVISION_LIVE_ROOT)) throw new Error('live revision authorization mismatch')
  return true
}

export function checkedRevision(value) {
  if (value === undefined) return undefined
  if (!value || Object.keys(value).sort().join('|') !== 'diagnostic_policy|inline_profile|owner_authorization|version' ||
      value.version !== 'gate2-protocol-revision-v1' || ![null, DEADLINE_POLICY].includes(value.diagnostic_policy) ||
      ![null, INLINE_PROFILE].includes(value.inline_profile) || (!value.diagnostic_policy && !value.inline_profile) ||
      typeof value.owner_authorization !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value.owner_authorization)) throw new Error('invalid protocol revision')
  return structuredClone(value)
}

const collect = (a, channel) => Buffer.concat(a.chunks.filter(c => c.channel === channel).map(c => Buffer.from(c.bytes_base64, 'base64')))
// Replayed at settlement and on every full journal audit. Caller flags alone
// never confer continuation eligibility.
export function auditDiagnosticCensor(attempt, { revision, limits, freezeHash }) {
  const reject = () => { throw new Error('diagnostic censor evidence rejected') }
  if (revision?.diagnostic_policy !== DEADLINE_POLICY || limits.mode !== 'uncapped' ||
      attempt.coordinate.arm !== 'D' || attempt.coordinate.stage !== 'marker' || attempt.coordinate.track !== 'FROZEN-REPLAY') reject()
  const ev = attempt.chunks.filter(c => c.channel === 'transport').map(c => JSON.parse(Buffer.from(c.bytes_base64, 'base64')))
  const one = kind => { const xs = ev.filter(e => e.kind === kind); if (xs.length !== 1) reject(); return xs[0] }
  const pre = one('pre_send'), request = one('request'), response = one('response'), terminal = one('terminal'), t = terminal.result, facts = t?.termination
  if (pre.freeze_hash !== freezeHash || hash(pre.coordinate) !== hash(attempt.coordinate) || pre.input_packet?.split !== 'dev' ||
      request.sha256 !== attempt.request_sha256 || terminal.boundary_failure || ev.at(-1) !== terminal ||
      response.http_status !== 200 || response.content_type !== 'text/event-stream') reject()
  if (!facts || facts.policy !== DEADLINE_POLICY || facts.deadline_ms !== 180000 || facts.cleanup_limit_ms !== 5000 ||
      facts.stop_cause !== 'timeout' || !Array.isArray(facts.errors) || facts.errors.length ||
      facts.prefix_integrity !== true || facts.local_pipeline_closed !== true || facts.content_type !== 'text/event-stream' ||
      !Number.isFinite(facts.cleanup_ms) || facts.cleanup_ms < 0 || facts.cleanup_ms > 5000 ||
      !Number.isFinite(facts.deadline_at_ms) || facts.deadline_at_ms < 180000 ||
      !Number.isFinite(facts.stopped_at_ms) || facts.stopped_at_ms < facts.deadline_at_ms ||
      t.outcome !== 'failed' || t.error_code !== 'timeout' || t.attempted !== true || t.http_status !== 200 ||
      t.transport_complete !== false || t.evidence_complete !== false || ['length', 'content_filter'].includes(t.finish_reason)) reject()
  const wires = attempt.chunks.filter(c => c.channel === 'wire'), deliveries = ev.filter(e => e.kind === 'wire_delivery')
  const rawWire = collect(attempt, 'wire')
  if (facts.wire_chunks !== wires.length || deliveries.length !== wires.length || t.wire_bytes !== rawWire.length ||
      facts.wire_sha256 !== hash(rawWire) || facts.content_sha256 !== hash(collect(attempt, 'model')) ||
      facts.reasoning_sha256 !== hash(collect(attempt, 'reasoning'))) reject()
  const parser = createCompletionDecoder()
  let cleanup = false
  for (let i = 0; i < wires.length; i++) {
    const d = deliveries[i], w = wires[i], b = Buffer.from(w.bytes_base64, 'base64')
    const position = attempt.chunks.indexOf(w), previous = attempt.chunks[position - 1]
    if (previous?.channel !== 'transport' || JSON.parse(Buffer.from(previous.bytes_base64, 'base64')).kind !== 'wire_delivery' ||
        d.index !== i || d.byte_length !== b.length || d.sha256 !== hash(b) || !['generation', 'cleanup'].includes(d.phase) ||
        !Number.isFinite(d.elapsed_ms) || d.elapsed_ms > w.elapsedMs) reject()
    if (d.phase === 'cleanup') { cleanup = true; if (d.elapsed_ms < facts.deadline_at_ms) reject() }
    else {
      if (cleanup || d.elapsed_ms >= facts.deadline_at_ms) reject()
      parser.push(b)
    }
  }
  const parsed = parser.snapshot()
  if (hash(Buffer.from(parsed.content)) !== facts.content_sha256 || hash(Buffer.from(parsed.reasoning)) !== facts.reasoning_sha256 ||
      parsed.finish_reason !== t.finish_reason || parsed.done !== t.done || hash(parsed.usage) !== hash(t.usage)) reject()
  return true
}
