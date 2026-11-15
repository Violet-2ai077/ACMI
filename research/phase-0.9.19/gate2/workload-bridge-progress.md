# Offline workload/bridge preparation ledger

Approval: Owner authorized full operation tables/read denominators, original-v4
equivalence, fixed workload resource analysis, measurement/supervisor design and
non-timing fault validation. No performance series, development freeze or models.

Rulings:
- Reuse the isolated branch and existing synthetic freeze, never regenerate it.
- New evidence root: offline-workload-bridge-prep-20261115. Prior delivery stays
  immutable, including its incomplete table and incorrect interim read count.
- No independent review agent; only self-review and deterministic verification.
- P-G follows the existing binary-context 62-step fixture, with resume after
  step 21. A v4 batch adapter must scatter to the exact original capture API;
  never use v5 as the baseline. Adapter costs belong to future measurements.
- Full archived-reader equivalence is distinct from executing every original-v4
  append. Initial concern about quadratic replay was incorrect: source inspection
  confirms original v4 capture cache hits too. Preserve the first reader-only
  certificate and counterfactual bound; add nominal scan arithmetic and a complete
  writer correctness pass. Never treat the cache-miss bound as actual workload.
- Concrete disk bounds can be proved from fixed bytes. RSS and time are not
  proved by administrative allowances or invented runtime multipliers.

Tasks: operation contracts/tests; original-v4 read and guarded comparison;
synthetic bridge/supervisor fault tests; resource analysis; report and custody.

Completed non-timing work:
- P-L/P-H full original-v4 and v6 writers, all expected final attempts equal.
- P-H 35 archived-prefix reader checks and final full state equal.
- P-G pinned derived guarded comparator: 62 deliveries, 62 EOF, 12 D steps,
  57 historical-context steps; full state and prepared request hashes equal.
- Actual append/flush reductions: 35.05%, 35.35%, 20%. P-G FAIL is retained;
  no protocol, metric denominator or workload change to make it pass.
- Full journal scan-byte accounting includes all observed replay boundaries;
  additional freeze/manifest reads and CPU are explicitly outside that byte count.
- Four real derived-file corruptions rejected; five supervisor fault simulations;
  seven contract tests passed. Native supervisor still not implemented/verified.
- Conditional fixed disk requirement 9,440,863,476 B; proposed 16 GiB partition
  revised to 6/2/2/2/4 GiB. Heap/time/native process-control proofs remain open.

First reader-only artifacts and cache-miss bound remain in verification/ and
source-reader-pass/. Final writers and nominal cache model are separate artifacts.
All RED and intermediate logs stay intact. No timing series or model calls.

Final validation: 233/233 research tests at concurrency 4; 99 syntax checks;
lint passed across 799 files; diff check passed. Four actual file-fault copies
were rejected and their sources unchanged. No product build/Vitest rerun.
Custody: historical 456, previous deliverable 264+146, study 7, R-E/R-A/R-C 4+123,
prior sync 17, synthetic bundle 53, existing research 144, reader-pass modules 96
all match their recorded hashes. Main clean/unchanged. Full runtime resource
feasibility remains unproved; P-G count gate is deterministically failed.
