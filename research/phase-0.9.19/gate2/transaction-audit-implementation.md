# R-E / R-A / R-C correctness implementation ledger

Owner authorization: offline implementation of R-E/R-A and capacity proof only.
Spec: transaction-audit-capacity-proposal-2026-11-15.md.
No performance series, new stop condition, development refreeze or model call.
Live admission remains 1048576 bytes. All historical failures remain immutable.

- [x] Record immutable historical baseline (456 files from r1-r4 and R-O/R-S).
- [x] RED/GREEN compact binary frame, strict lengths, physical chain and crash tests.
- [x] RED/GREEN streaming full audit with shared logical-state validation.
- [x] RED/GREEN audited selective reads and guarded offline harness integration.
- [x] Real-prefix differential correctness, D2/contexts/request-byte equivalence.
- [x] Capacity proof/counterexamples; result NOT CLOSED, no new guards or budgets.
- [x] Full offline regression: 208/208; 82 syntax checks; submit correctness/capacity report.

Ruling: reuse the established worktree/research evidence convention; do not commit
unrelated intent-to-add work, delete evidence or dispatch an independent reviewer.
Ruling: shared state rules must serve legacy and streaming readers. Streaming keeps
the current attempt for unchanged D2 auditing, then releases settled chunk bodies.
Ruling: a finite binary-frame allocation bound must be derived from existing valid
channel/record semantics, not introduced as a new accepted-response stop condition.

Ruling: selective reading performs another full streaming audit with a pinned
head/fingerprint, rather than introducing a persisted offset index. This spends
extra audit work, not less validation. No performance benefit is claimed.
Ruling: retain old full snapshot() compatibility. Only the explicit offline binary
guarded path uses compact summaries and selected materialization.

## Findings and evidence

- Codec: 112-byte header + complete logical JSON array + 32-byte physical hash.
  Payload serialized once for its physical frame; every logical hash still checked.
- Current-attempt chunks remain for the unchanged D2 audit; settled chunks/request
  bodies are released in summaries, with D1 hashes computed from verified bytes.
- Self-check reproduced a forged selection via mutation of a returned summary.
  RED/GREEN fix pins allowed attempt IDs inside the private WeakMap audit token.
- All 35 real prefixes: 99985 logical records and 35308 read boundaries equal;
  selected attempts and full reopened state equal, final halted=true. No evaluator
  on real outputs, no timing/RSS comparison and no performance-gate execution.
- 62 synthetic guarded steps compare prepared packets/request bytes and resumed
  histories between v5 and v6; D2 resource/other-arm vetoes remain enforced.
- Capacity proof derives broad format bounds from existing caps, not operational
  memory guarantees. Existing 1 MiB admission plus a 3145729-byte read exceeds
  4 MiB channel storage; end-to-end synthetic transport reports evidence failure,
  prefix_integrity=false, and halts. No new read-size/read-count limit added.
- Sparse 0/35/576 slot legacy/binary recovery states equal. Not saturation proof.
- Intermediate full regression: 206/206 passed. Final suite additionally includes
  the end-to-end oversized-delivery counterexample; retain both logs.
- Final suites: 207/207, then 208/208 including valid foreign append during audit.
  All logs retained. Source syntax 82/82 and whitespace check passed.
- R-C outcome NOT CLOSED; R-E/R-A performance NOT RUN. No cap/threshold changes.
- Final report: transaction-audit-correctness-2026-11-15.md. Historical hash check
  and immutable source snapshot accompany final-verification.json.
