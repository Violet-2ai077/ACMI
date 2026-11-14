import { createHash } from 'node:crypto'
import { openSync, closeSync } from 'node:fs'
import { hash } from '../protocol/contracts.mjs'
import { keys, transition, totals, indexState } from './ledger-state.mjs'
import { scanTransactions } from './transaction-frame.mjs'

// Current-attempt materialization intentionally retains the existing D2 audit.
// Settled bytes are released only after all settlement checks have succeeded.
export function auditBinaryJournal({ path, manifestHash, limits, revision, freezeHash, checkpoint, materialize = false }) {
  const state = indexState({ attempts: [], halted: false, seq: 0, digest: manifestHash, physical_seq: 0, physical_digest: manifestHash })
  const keep = id => materialize === true || materialize instanceof Set && materialize.has(id)
  const fd = openSync(path, 'r')
  let modelHash, modelBytes = 0
  try {
    const physical = scanTransactions(fd, {
      initialDigest: manifestHash,
      onEvent(event) {
        if (!keys(event, ['seq', 'previous', 'kind', 'value', 'digest'])) throw Error('journal fields')
        const { digest, ...body } = event
        if (body.seq !== state.seq + 1 || body.previous !== state.digest || digest !== hash(body)) throw Error('journal digest')
        transition(state, body.kind, body.value, limits, true, revision, freezeHash)
        state.seq = body.seq; state.digest = digest
        if (checkpoint && state.seq === checkpoint.seq && digest !== checkpoint.digest) throw Error('known checkpoint changed')
        if (body.kind === 'reserve') { modelHash = createHash('sha256'); modelBytes = 0 }
        if (body.kind === 'capture' && body.value.channel === 'model') {
          const b = Buffer.from(body.value.bytes_base64, 'base64'); modelHash.update(b); modelBytes += b.length
        }
        if (body.kind === 'settle') {
          const a = state.attempts.at(-1)
          if (!keep(a.attemptId)) {
            a.compacted = true; a.model_sha256 = modelHash.digest('hex'); a.model_bytes = modelBytes
            a.chunks = []; delete a.request_base64
          }
          modelHash = null
        }
      },
      onFrame(frame) {
        if (checkpoint && frame.seq === checkpoint.physical_seq && frame.digest !== checkpoint.physical_digest) throw Error('known physical checkpoint changed')
      }
    })
    state.physical_seq = physical.physical_seq; state.physical_digest = physical.physical_digest
    if (checkpoint && state.seq < checkpoint.seq) throw Error('known checkpoint rollback')
    if (checkpoint && state.physical_seq < checkpoint.physical_seq) throw Error('known physical checkpoint rollback')
    state.budget = totals(state.attempts, limits)
    return state
  } finally { closeSync(fd) }
}
