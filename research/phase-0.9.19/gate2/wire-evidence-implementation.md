# R-O / R-S offline implementation ledger

Authorization: Owner approved offline implementation and acceptance only.
Spec: wire-evidence-revision-proposal-2026-11-15.md.
Live stays at 1048576 bytes. No refreeze, model call, rescore or replacement sample.

## Work checklist

- [x] Record immutable research/history baseline (267 historical files, including all seven study inputs).
- [x] RED/GREEN: opt-in offline v5 transactions/recovery (4 new RED, then 22 ledger/cache tests GREEN).
- [x] RED/GREEN: raw-first batching/accounting (5 new RED, then 16 transport/accounting tests GREEN).
- [x] Replay all 35 archived prefixes without task evaluation.
- [x] Fixed five paired performance trials; FAILED audit gate, all trials retained.
- [x] Fault/concurrency/deadline/capacity checks; final regression 189/189 passed.
- [x] Verify protected evidence; submit acceptance and capacity recommendation.

Pre-flight: transport batching consumes ledger.captureBatch; default v4 callers stay
unchanged. The live boundary does not opt in to the new storage or observations.
Ruling: v5 is explicitly offline-only until a separate live authorization. This
prevents accidental use by an old frozen execution entry point.
Ruling: use the existing research ledger and evidence directory convention rather
than disposable skill scratch; do not commit unrelated intent-to-add research files.
Ruling: self-check only; AGENTS.md prohibits an unauthorized independent reviewer.
Ruling: retained original logical payloads include original source timestamps and
byte hashes; a new manifest/physical format necessarily has new journal chain heads.
No claim that a newly generated journal digest equals its source digest.

## Execution notes

- Baseline: offline-ro-rs-20261115/historical-baseline.json, all r1-r4 files.
- Prefix verification: 35 inputs, 34 complete streams, final partial remains
  byte-limited at 1048650 bytes / 5667 reads. No task evaluator.
- Fixed paired series started once, with no storage implementation edits during
  the series. Every worker has a fresh process, same disk and original payloads.
- Ruling: performance trials measure capture service cost, excluding decoder and
  R-O parsing. Report observation cost separately, not combined end-to-end speedup.
  OS/device cache state is not controlled and is disclosed, not normalized away.
- Ruling: per-pair <=1.25 audit/RSS/p99 gate; median only for the predeclared
  capture ratio. Failed trials are not dropped or rerun.
- Fixed five-pair series finished: audit ratio 1.300-1.486, all above 1.25;
  performance gate FAILED. Capture median ratio 0.6721 is not an overall pass.
- Self-check reproduced physical-head rollback by repacking the same logical
  chain into fewer valid frames (RED). Root cause: logical rollback was checked,
  but a physical checkpoint not reached by replay was not rejected. Added the
  missing physical-sequence lower-bound check; retain the earlier failed gate.
- Benchmark measured ledger SHA256
  71bc059f4a7c33f14b8f07383391b225b09df018a6e446b6b31ab6e167c5dcdb.
  It precedes that one-guard correctness hardening. No performance rerun or claim
  that the final hardened revision passed the fixed performance gate.
- Guarded offline harness integration: explicit offlineStorageProtocol, unchanged
  pre-send verification, v5 batch sink and stage accounting (one RED then GREEN).
  No live opt-in, no promotion of a research package. Regression fixture freezing
  uses synthetic-test packages only, not a new development freeze.
- All35 v5 replay: 99985 logical events / 35 attempts exact; reopened halted=true.
- Capacity counterexample: 4 MiB exact raw fits, +1 byte cannot be archived under
  the unchanged channel cap. One-byte fragmentation exceeds metadata budget at
  both 1 and 4 MiB. No closed capacity vector; recommend no cap promotion.
- 0/35/576 slot sparse-state probes passed reconstruction. Their timings are
  diagnostic only (some probes overlapped regression work), not the paired gate
  and not a proof for 576 near-limit real responses.
- Final: correctness checks passed; performance acceptance NOT passed; no capacity
  promotion or live readiness. 73 module syntax checks and diff whitespace check
  passed. Historical 267 files unchanged, main unchanged. No independent review.
- Final report: wire-evidence-acceptance-2026-11-15.md. All implementation decisions
  and remaining capacity limits are retained; no scratch or evidence was deleted.
