# Validated capture cache: implementation and verification

Owner approval: 2026-11-15, offline repair followed by a new frozen live batch.

## What changed

- Keep journal v1/v2/v3 bytes, per-event hash chain, original channels, timestamps,
  synchronous flush and exclusive cross-process writer lock.
- Keep private validated state after an audit or successful write. Only capture
  appends may reuse it when journal device/inode/size/mtimeNs/ctimeNs/birthtimeNs
  match the known post-write fingerprint. Manifest bytes are checked every time.
- Reserve, settle, snapshot and reopen always parse and validate the full journal.
  Changed filesystem metadata also requires a full audit. In-memory checkpoint
  anchoring rejects a known prefix rewrite or rollback during that handle's life.
- Count per-channel bytes privately instead of decoding all old chunks per append.
  Returned snapshots are deep copies. Failed append invalidates speculative cache;
  a partial disk record remains a failure, never silently repaired or retried.
- Check shared ancestors once per lock acquisition, then check each immediate file
  for links. Do not weaken root isolation or accept substituted linked journals.

Metadata is a fast change detector, not authentication against a privileged actor
that forges all file metadata during a capture. Critical-boundary full audits still
gate settlement, new requests and scoring. This is the existing trusted-local,
cooperative-writer threat model. A fresh process cannot detect removal of a fully
valid suffix without an external head receipt; no new anti-rollback claim is made.

## Evidence

Root: E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/sink-20261115-r3/

Real-fragment replay retained all 3267 event payloads / 3261 capture events, including
each exact channel byte sequence, original order and timestamp. Reopened state and
budget match the source. Two complete SSE streams decode identically; the third
incomplete stream remains incomplete. Source journal hash is unchanged.

- Replay elapsed: 8383.0171 ms; predeclared engineering gate <15000 ms.
- Capture p50/p95/p99: 2.024 / 4.056 / 4.141 ms.
- Seven full audits, 3261 capture cache hits; no fingerprint miss in this single writer.
- This is unpaced offline replay, not a model latency result or a controlled speedup
  ratio against a newly timed old implementation.

Amplified test: repeat the captured t2 wire/content/reasoning fragments eight times
as explicitly synthetic load, with ordinal timestamps rather than observed times.
All 12904 repeated payloads survive reopening exactly. Total capture time 33315.6733
ms; final/first block ratio 0.8474. Gates <60000 ms and ratio <3 both pass. This
checks absence of the former within-attempt growth on this host, not all possible
history sizes, all filesystems or a statistical risk bound.

Tests additionally cover same-length prefix changes with restored mtime, cache
snapshot mutation, failed and partial writes, known-head rollback, another process's
valid append, interrupted reservation, simultaneous reservation competition, stale
locks, byte limits, budget/D1-D2 constraints and altered manifests. Full suite: 145/145.

## New frozen execution

Bundle: E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/live-20261115-r3/development-r3/
Pin: a335bd5c340249021e534a3a8de23f079e504308cae41bd8350ea6c07470d168

All seven public/oracle/plan/prompt hashes match r2. Output/input bounds, routing
policy and 180-second timeout remain unchanged. Runtime records Owner's new-batch
authorization and hashes of the offline replay/stress proofs. The pin's timestamp
claim is explicitly scoped to this manifest revision, not to earlier live batches.

The separately authorized new run is not a retry of either halted ledger. Keep r1
and r2 failures in the engineering record. Do not change prompts/truth after seeing
outputs or claim a mechanism GO from these performance tests. Real execution status
and scoring must be reported from the new run's ledger, not inferred from this document.
