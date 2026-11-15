import { hash } from '../protocol/contracts.mjs'

// Explicit offline comparison adapter; the original v4 implementation is unchanged.
export function createLedgerAdapter(factory, options, { originalV4, calls }) {
  const ledger = factory({ ...options, ...(originalV4 ? { storageProtocol: undefined } : {}) })
  const out = { path: ledger.path }
  for (const key of ['snapshot', 'auditSummary', 'readAuditedAttempt', 'reserve', 'capture', 'captureBatch', 'settle']) {
    if (typeof ledger[key] !== 'function' && !(originalV4 && key === 'captureBatch')) continue
    out[key] = (...args) => {
      const before = ledger.diagnostics(), row = { index: calls.length, kind: key, input_hash: hash(args), completed: false }
      calls.push(row)
      try {
        const result = originalV4 && key === 'captureBatch'
          ? args[0].reduce((_, item) => ledger.capture(item), undefined) : ledger[key](...args)
        row.completed = true
        return result
      } finally {
        const after = ledger.diagnostics()
        row.full_scans = after.full_replays - before.full_replays
        row.append_calls = (after.append_calls ?? 0) - (before.append_calls ?? 0)
        row.flush_requests = (after.flush_requests ?? 0) - (before.flush_requests ?? 0)
      }
    }
  }
  out.diagnostics = () => ledger.diagnostics()
  calls.push({ index: calls.length, kind: 'open', input_hash: hash(options), completed: true,
    full_scans: ledger.diagnostics().full_replays, append_calls: 0, flush_requests: 0 })
  return Object.freeze(out)
}
