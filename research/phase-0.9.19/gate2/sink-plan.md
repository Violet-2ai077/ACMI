# Evidence sink performance repair, 2026-11-15

Owner authorizes offline repair/real-fragment replay, integrity/concurrency/recovery
verification, a new freeze and a new live batch. Do not change study materials.

Root cause: every synchronous capture reparses/revalidates the full journal and
redecodes every previous same-channel chunk. Preserve the journal format and fsync.

Repair: private validated-state cache and constant-time per-channel byte counters.
Only captures can use the cache, under the existing exclusive cross-process lock,
when file identity/size/nanosecond modification/change metadata match the last known
write. Unexpected filesystem change forces full replay anchored to the known head.
Reserve, settle, snapshot and reopen always fully replay/hash/validate on disk.
No cached state escapes to callers. Failed writes invalidate the cache. No stale
lock deletion, automatic retry, changed timeout or evidence dropping is introduced.

This remains a trusted-local/cooperative-writer design. Metadata is a fast change
detector, not cryptographic authentication against a privileged adversary forging
metadata. Full critical-boundary audits still reject corruption before settlement,
the next send or report import. Preserve this distinction in the delivery.

Pre-live gates: actual captured chunk-by-chunk replay must preserve every byte,
channel, order, timestamp and terminal record; full 3267-event replay target <15 s
on this host (engineering threshold, not a statistical bound). Verify reopen,
prefix tampering/restored mtime, torn writes, rollback, stale locks, two processes,
snapshot mutation and failure recovery. Stress repeated fragments as a separate
synthetic trace; never present this trace as real model performance.

Freeze only after tests and stress pass. Compare all seven public/oracle/plan/prompt
hashes with r2. Preserve r1/r2 artifacts. Run the next independent live batch once,
stopping at any transport/evidence failure; no repair, fallback or regeneration.
