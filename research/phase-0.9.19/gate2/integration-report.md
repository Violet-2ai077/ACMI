# Gate 2: complete oracle, prompt freeze and pre-send ledger integration

Date: 2026-11-14. Status: implemented and offline verified, not a mechanism GO.
Evidence root: E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/integration-a8b73f1042/

## Delivered boundary

1. Complete development oracle: six distinct narrative stories, 48 base turns,
   49 user units, 13 canonical task identities and 144 condition-turn snapshots.
   Each snapshot includes attribution, actions/relations, births and prior births,
   complete task memory, lifecycle updates, active/focus state, evidence spans,
   answer predicates and per-unit negative cases. C3 starts without identity history.
2. Actual A/B/C0/D prompts are frozen with public corpus, oracle, schedule, runtime,
   research dependency bytes, review audit and Owner delegation. This is not a freeze
   of placeholder prompt names or synthetic engineering fixtures.
3. Guarded sender checks the full package and executing source closure, compiles
   allowlisted input, verifies the next exact coordinate, reserves final request bytes
   durably, resolves credentials, rechecks the freeze and reservation, then sends once.
4. Original response body, model content, reasoning, transport metadata and terminal
   state are retained separately. Secrets and Authorization headers are not archived.
   CLOSED-LOOP restores only its own original history; invalid markers are retained,
   not repaired. D2 consumes exactly its own settled D1 answer and digest.

The actual route is the existing DSH opencode-go/deepseek-v4.1-flash alias, max
reasoning. It is not an immutable model snapshot. This batch performed zero real
model requests and no new credential-value reads. Synthetic HTTP Response objects
are explicitly marked offline-boundary-test and cannot resume as a live evidence run.

## Frozen artifacts

- Bundle: development-r1/manifest.json
- Separate retained pin: development-r1.pin.json
- Manifest SHA-256: 4a892986a5eaf553c35920e8d7b68ac68e7864d2c91f3ec7990a5a20ba65f153
- Created at UTC: 2026-11-14T09:25:26.409Z, before any live output in this study.
- Full verification result: freeze-result.json
- Review: development-r1/reviews/record.json, gate2-review-binding-v3
- Semantic audit: development-r1/evaluator/review-audit.json
- Owner authority: development-r1/authorizations/owner.json
- Runtime: development-r1/runtime/config.json
- Oracle: development-r1/oracle/corpus.json
- Public input/reference history: development-r1/public/corpus.json

The pin is outside the package and reproduced here, not a third-party timestamp or
adversarial rollback guarantee. Existing frozen directories are never overwritten.
Any change to an executing research module requires a new bundle and pin.
The generic freeze report conservatively retains false semantic/independence/live
flags. verifyFrozenSources separately verifies the local executable dependency set;
it does not certify third-party runtime binaries or execute archived source code.

| Prompt | UTF-8 bytes | SHA-256 |
| --- | ---: | --- |
| A | 8140 | 5936d8268a976adef027e729e2363ac75463500813c47efa438cecaa1228f41c |
| B | 8740 | 6ddc08f257b022db13dd78e2106d635e50098e2088a0f48b4456aa4b2fef4001 |
| C0 | 352 | 529d963aa4e93aec0dc537c09d4a4d45655261394e4c0e843f05982f0346d2f0 |
| D2 | 8603 | cdec82b64b4a6efb1716bf3dc9a72ffa52a120b044643dd5a9c7b1c4a92b0c81 |

These are byte sizes, not provider Token measurements. D1 uses the normal C0 prompt.
Runtime bounds: 16,384 output tokens requested; 131,072 serialized input bytes;
1,048,576 response bytes; 180,000 ms transport timeout. Byte bounds are not a
provider tokenizer/context-window guarantee. No silent truncation is permitted.
Owner's uncapped spending policy remains explicit; 576 is the finite proposed
schedule, not a spend-to-success loop. Prices and actual costs are unknown, not zero.

## Matrix and state support

Conditions remain independent reporting strata. No combined C1/C2/C3 score is used.

| Per condition | Simple | Medium | Hard | Total |
| --- | ---: | ---: | ---: | ---: |
| Oracle snapshots | 12 | 12 | 24 | 48 |
| A/B/C0 CLOSED-LOOP generations | 36 | 36 | 72 | 144 |
| A/B FROZEN-REPLAY generations | 12 | 0 | 12 | 24 |
| D diagnostic generations (D1 + D2) | 12 | 0 | 12 | 24 |
| Proposed generations, all arms | 60 | 36 | 96 | 192 |

Three conditions yield 144 oracle snapshots and the unchanged 576-call proposal:
432 CLOSED-LOOP, 72 A/B replay, 72 D generations, arranged in 162 ordered blocks.
D is development-only and never contributes to A/B mechanism scores or GO.
Replay has no medium-difficulty probes; this is N/A, not a perfect score.

Each condition has the following state opportunities (change / retain):
SM1 2/2; SM2 3/2; SM3 4/2; SM4 3/2; SM5 2/2; SM6 2/2.
Detailed difficulty support is preserved in freeze-result.json. Several simple and
medium theme cells have no support. They must remain N/A with counts, not pooled
away or filled with synthetic success. Correct UUID alone does not pass state checks.

## Executed verification

- Research acceptance suite: 134 passed, 0 failed, 0 skipped. Syntax: 51 .mjs/.cjs
  files passed. Repository suite: 43 files / 276 tests passed with --maxWorkers=1.
  The earlier default-concurrency DSH timeout is not declared fixed; no production
  timeout was changed. Other pnpm check subcommands are not claimed here.
- All 25 Gate 1 source hashes remain unchanged. Main remains clean at
  9db1ee7da8209363a1fd76f3bebc83f75dfe9c9d. No commit, merge, push or integration.
- All 144 oracle records pass structure, evidence-span, identity/state consistency
  and declared SM support checks. The reviewed narrative hash must match exactly.
- 288 authored A/B conformance vectors round-trip through the real parsers and
  deterministic scoring; this checks oracle/protocol/evaluator compatibility.
- A 19-generation regression test exercises both protocols, C0, D1/D2 and Session
  change, reopening the ledger between every generation.
- The actual pinned development package then executes the first 99 scheduled
  generations with fabricated responses: A 21, B 24, C0 32, D 22; C1 29, C2 26,
  C3 44; CLOSED-LOOP 64 and FROZEN-REPLAY 35. This includes the C1/A identity-bearing
  handoff in delta-ambiguity, through t8, and exact D1/D2 linkage.
- Every one of those 99 synthetic sends completes and preserves raw bytes. Every
  scoreable vector passes its authored conformance checks. D1 is answer-only.
- Report: offline-prefix-99/offline-verification.json; original ledger:
  offline-prefix-99/events.jsonl. complete_schedule_executed is explicitly false.
- Negative tests reject skipped/duplicate coordinates, incomplete reservations,
  credential failure, timer overflow, changed prompt after credential resolution,
  corrupted journal at that same boundary, caller coordinate mutation and wrong pins.
  Journal corruption is preserved and blocks Fetch; evidence is not reconstructed.
- A timing regression was found and fixed: a supplemental failure record used an
  earlier timestamp than the terminal record. The failure code now belongs to the
  original terminal event. See timing-regression-note.txt and boundary-green.txt.

The 99-prefix is an engineering coverage selection, NOT a smaller research matrix,
an accuracy sample, repeated model attempts, a latency benchmark or a risk estimate.
The 288 positive vectors are generated from truth and cannot independently validate
that truth. Negative mutation tests provide separate checks against vacuous scoring.

## Review and interpretation limits

- Review is owner-delegated-model-review by the same assistant that authored the
  material. This accurately implements Owner's delegation, not independent human
  adjudication. Formal output evaluation stays deterministic; no LLM judge is added.
- Answer checks use frozen finite lexical alternatives. They are not a complete
  semantic-quality measure. State exact-match uses literal evidence references;
  semantically equivalent choices of quote can be penalized. Such mismatches require
  evaluator-sensitivity classification, not automatic model-capability blame.
- One story per category cannot support population-level risk bounds. Logical turn
  gaps implement dormant-task recovery, not hours/days of elapsed time.
- C3 CLOSED-LOOP starts with raw dialogue and retains only its own subsequent output.
  FROZEN-REPLAY deliberately includes authored historical identity evidence; the
  common A-envelope history may bias protocol comparison and is reported separately.
- No prompt was tuned against a frozen validation set or a live output. No validation
  set was opened, no real user data were sent, and no large confirmation run began.
- Ledger hash chaining is not tamper-proof against deletion of a valid full suffix;
  an external head receipt would be needed for that threat model. Crash/power-loss
  durability beyond the tested flush/lock behavior is not certified.

## Reproduction and next boundary

Run from the research worktree root:

```powershell
node --test research/phase-0.9.19/tests/*.node-test.mjs
node research/phase-0.9.19/gate2/cli.mjs verify-corpus E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/integration-a8b73f1042/development-r1/manifest.json 4a892986a5eaf553c35920e8d7b68ac68e7864d2c91f3ec7990a5a20ba65f153
pnpm exec vitest run --maxWorkers=1
```

Programmatic entry points are freezeDevelopment, openGuardedRun and the explicitly
offline verifyOfflinePrefix. Use a NEW runId for a fresh synthetic reproduction;
the original evidence and settled coordinates cannot be overwritten or resent.
openGuardedRun.prepare exposes compiled request bytes for inspection. execute
reserves its own fresh compilation before invoking the caller's credentialProvider.
Do not import the oracle-driven offline test driver into a live experiment loop.

Next work is controlled real-provider development execution and deterministic report
import, using this pin and a separate development-model-run ledger. Actual service
compatibility, alias provenance, usage, latency and billing remain unverified until
that execution. Do not fabricate immutable versions or numerical cost bounds.
No additional generic Owner approval or external human-review prerequisite is added.
The larger confirmatory sample and final mechanism GO remain out of this delivery.
