# Gate 2 preparation ledger

Plan: C:/Users/SiChuchen/.codex/worktrees/model-native-attribution-research/acmi/research/phase-0.9.19/gate2/implementation-plan.md

Date: 2026-11-14. Owner directed continuous progress. Status: OFFLINE_CORPUS_PREFLIGHT_IMPLEMENTED; live adapter and experiment NOT started.

## Rulings

- Proceed with provider-neutral work rather than repeating generic approval requests. Actual model snapshot/route, monetary cap and human review identities remain absent; the blank config records that uncertainty.
- 576 remains the R2 proposed matrix, not inferred financial authorization. No provider, price or credential is guessed.
- Keep Gate 1 acceptance and its 25 files byte-identical. New source is additive under gate2 plus three test files.
- Serena remains bound to an unrelated Soma project. Do not inspect or modify that project; use explicit ACMI paths and apply_patch.
- No independent reviewer, agent, commit, merge, push, package installation or model call.

## Interfaces checked

- Planner -> future runner: independent blocks preserve conversation turn order and D stage order; planner is not a resume executor.
- InputPacket -> compiler: packet includes evaluation labels; explicit allowlist prevents forwarding those labels. Source map is checked against raw messages.
- Compiler -> future adapter: intermediate bytes/hash only; actual provider HTTP bytes must still be archived separately.
- Config -> readiness: declaration checks only, not proof that corpus hashes or human sign-off were verified; live_execution_ready remains false.

## Verification

- T1/T2: observed initial missing-module failures; added interface stubs and observed assertions fail; then implemented and passed 6 tests.
- T3: readiness stub failed 4 assertions, implementation passed; regression for non-string reviewer author field reproduced TypeError and was fixed with type checks. CLI missing-config/live-flag tests included.
- Final research suite: 49 passed, 0 failed, 0 skipped. 12 new tests plus the previous 37.
- Node syntax: 28 .mjs files passed.
- Repository command pnpm test: build succeeded; 43 Vitest files and 276 tests passed. This clears the earlier pnpm-test dependency gap for this run; it does not claim every auxiliary script under pnpm check was executed.
- Config-template CLI: expected exit 2; missing fields reported; no secrets read or echoed.
- Gate 1 file manifest: all 25 hashes unchanged. Original main remains clean at 9db1ee7da8209363a1fd76f3bebc83f75dfe9c9d.
- Security scanner sees one JSON file, not .mjs; quality scanner sees zero files. Neither is evidence of JavaScript security/quality coverage. Manual import inspection found no network, environment reads, file writers or Host/Graph dependencies in gate2 source.
- Whitespace and additive-path checks performed before packaging; self-check only, not independent review.

Evidence directory: E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/prep-560ab54316/

Logs: red-boundaries.txt, red-readiness.txt, red-malformed-readiness.txt, research-tests.txt, repository-test.txt, readiness.json, security-scan.json, quality-scan.json. Final patch and manifest are packaged as gate2-preparation.patch and source-manifest.json.

## Second batch: global durable ledger

Plan: gate2/ledger-plan.md. All four ledger tasks implemented and tested inline; no independent review.

- Added run-ledger.mjs: one budget across all conditions/arms in a run; fixed limits/freeze hash; unique coordinate reservations; request bytes persisted before any future send; separate wire/model capture; exact integer micro-unit settlement; strict resume.
- Exclusive lock rejects competing writers without retry; unfinished reservations block later calls. Unknown/error/overrun stops the run. Never reset call count or auto-retry after interruption.
- RED ledger stubs -> GREEN core cases. Added a failing D2 borrowed-answer regression, then required the original D1 byte digest. Added a failing offline-evidence-kind regression, then pinned the manifest to offline-ledger-test.
- Actual two-process competition test: one reservation succeeds, the other rejects; usedCalls remains 1. Separate child-process resume retains the outstanding reservation.
- Final research suite: 60 passed, 0 failed, 0 skipped; 11 new ledger tests. Syntax: 30 .mjs files passed.
- pnpm test rerun: build successful, 43 files / 276 tests passed. No auxiliary pnpm check scripts claimed.
- Gate 1's 25 source hashes remain unchanged; original main clean at the same base. No commits, merge, push, dependency install, credential access or model call.
- Scanner limits unchanged: one JSON file scanned for security, zero files for quality; .mjs not covered. Manual review checked root guards, locked append/read paths, no provider/network/environment/Host imports and byte provenance.
- Source/input artifacts are trusted local data. No hard-power-loss certification, hostile administrator/TOCTOU guarantees or full-valid-suffix rollback detection. No provider billing authenticity or actual-send enforcement yet.

Second-batch evidence: E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/durable-1dabccd2b4/

Final synthetic ledger traces: E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/ledger-tests-zDtpiW/

Logs: red-ledger.txt, red-d-answer-link.txt, red-evidence-kind.txt, research-tests.txt, repository-test.txt, security-scan.json, quality-scan.json. gate2-current.patch and source-manifest.json capture the current Gate 2 module; earlier prep evidence is not overwritten.

## Third batch: frozen material integrity and public export

Plan: gate2/freeze-plan.md. All four tasks implemented inline; no independent reviewer or human-output grading.

- Added freeze.mjs and the read-only verify-freeze CLI. Externally supplied manifest pin -> bounded exact-byte/hash checks -> role partition and link checks -> schedule/model declarations -> exact corpus/probe review bindings.
- Added a genuine in-process verification handle. Public accessor returns copies of pinned original bytes only, not oracle or later-mutated disk files. Forged or deserialized reports cannot be used as handles.
- All test packages are purpose=synthetic-test. Test review identities and payloads are explicitly engineering sentinels, not authored research Ground Truth or human approval.
- RED stubs/CLI -> GREEN. Subsequent RED regressions caught rejection of ordinary uppercase external SHA-256 and acceptance of duplicate keys in public JSON; normalized the external hex representation and applied strict parsing to all declared .json artifacts without modifying raw bytes.
- Full research suite: 71 passed, 0 failed, 0 skipped; 11 new freeze tests. Node syntax: 32 .mjs files passed.
- pnpm test: build passed, 43 test files / 276 tests passed. No claim about all auxiliary pnpm check scripts.
- Gate 1's 25 source hashes remain unchanged; original main is clean at the same base. No commits, merge, push, model calls, key reads or validation-set access.
- Security/quality scanner coverage remains one JSON / zero files respectively; no .mjs coverage claimed. Source inspection found no network, environment access, dynamic execution or dynamic imports in Gate 2 code.
- Success reports explicitly leave human authenticity, semantic isolation, evaluator dependency closure, corpus completeness and live execution false. Physical file partitioning is not semantic leakage detection or an OS sandbox.

Third-batch evidence: E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/freeze-e2fd8475df/

Final synthetic package traces: E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/freeze-tests-fXItG9/

Logs: red-freeze.txt, red-json-and-digest.txt, research-tests.txt, repository-test.txt, security-scan.json, quality-scan.json. gate2-current.patch and source-manifest.json snapshot the current Gate 2 module; all prior evidence remains intact.

## Fourth batch: corpus consistency and state-support preflight

Plan: gate2/corpus-plan.md. All four tasks implemented inline; no agents or independent review. A concise asynchronous question requested actual model/route/cap values while offline work continued; no values have been supplied to the checked config.

- Added corpus.mjs and verify-corpus. Public/oracle wrappers are checked against the frozen plan, original per-condition visible prefixes and Contracts. The checker does not author or repair gold.
- Added per-condition and per-difficulty SM opportunity counts, adjacent-snapshot comparisons, real declared-attribution gaps, recovery-point checks, persistent known-task inventory, C1 catalog continuity and prior-birth coordinate consistency.
- Corpus inspection exposed the original engineering fixture's third-turn changed=false despite a new task memory entry. Only the derived engineering helper states changed=true; original Gate 1 fixture bytes and historical evidence remain unchanged. This is not a revised research Ground Truth.
- RED regression evidence covers metadata-only structure claims, stale changed flags, lost tasks, reordered collections, future birth sources, C1 rebirth, false dormant flags, status from-state mismatch, repeated old transitions, duplicate state atoms and overlapping resolved/unresolved scopes.
- Positive mechanical-support tests deliberately use nonindependent engineering skeletons and include a semantically wrong narrative/state pair. Their reports keep semantic truth, independence and full corpus completeness false. They cannot enter a formal experiment.
- Freeze integration uses already pinned public/oracle bytes only. Integrity success and corpus success are separate. Missing SM support returns exit 2; mechanically sufficient support returns exit 0 without opening live or semantic gates.
- Final research suite: 90 passed, 0 failed, 0 skipped; 19 additional tests compared with the previous 71. Node syntax: 35 .mjs files passed.
- Final pnpm test: build passed, 43 test files / 276 tests passed. Other pnpm check subcommands were not claimed.
- Gate 1's 25 source hashes unchanged; main clean at original base. No commits, merge, push, model calls, key reads, validation-set access or dependency installation.
- Read-only reuse investigation: existing examples/task-console/model-transport.mjs is loopback-only, accepts two messages, caps output at 512 tokens and sets stream=false. It cannot be reused unchanged as evidence for continuous-dialogue/streaming research. No production example was modified or contacted.
- Existing scanners still do not cover .mjs (security sees one JSON; quality zero files). Manual source inspection and directed tests cover the added boundaries; no independent review claimed.

Fourth-batch evidence: E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/corpus-ca7aa4cf8a/

Final synthetic package traces: E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/freeze-tests-HoaWFq/

Final logs: research-tests-acceptance.txt, repository-test-acceptance.txt, runtime-readiness.json; RED logs: red-corpus.txt, red-consistency.txt, red-freeze-integration.txt, red-strata-and-state.txt, red-nonadjacent.txt, red-duplicate-and-scope.txt. Earlier runs remain intact. gate2-current.patch and source-manifest.json snapshot current Gate 2 code, tests and helper.

## Required next inputs / unimplemented work

Updated by the seventh batch: complete oracle, full delegated review binding, actual prompts/runtime/dependency freeze and guarded send-boundary ledger integration are implemented. See integration-report.md for pinned artifacts and executed offline verification. No extra cap or external human-review input is required. Actual remote compatibility, immutable model provenance, billing and live experiment reporting remain unverified. No research accuracy, Token/latency result or GO is claimed.

## Fifth batch: DSH configuration discovery and uncapped policy

Plan: gate2/dsh-plan.md. Executed inline; no agents or independent review.

- Owner supplied existing DSH and no spending caps. Ruling: remove extra call/financial caps only via explicit policy; retain finite experiment schedule, frozen materials, no retries, no repair and all transport/integrity constraints. An unlimited spend instruction is not permission to sample until passing.
- Read installed DSH configuration/source only. Selected web patch declares opencode-go/deepseek-v4.1-flash, max reasoning. Installed catalog supplies the HTTPS openai-completions endpoint. The selected managed credential reference is present; its value is not exported or copied.
- Added dsh-route and dsh-inspect with allowlisted output, fixed errors, no Host/plugin execution, no network or alternative-provider fallback. Alias, full effective profile, service availability and immutable version verification remain explicitly separate.
- Added explicit readiness uncapped policy and ledger gate2-run-v2, preserving bounded v1 behavior/manifest bytes. Unknown successful cost stays null with a separate unknown count; transport failure/unknown outcome still halts. Schedule count, duplicate identity, interruption and resume pinning remain enforced.
- RED evidence: missing DSH module and uncapped readiness/ledger expectations failed before implementation. GREEN targeted cases include malformed policies, preserved no-retry identity, unchanged legacy behavior and sanitized loader errors. Loader unit tests use a JSON-only parser stand-in, not fabricated evidence of YAML compatibility; separate local inspection used the installed YAML parser.
- Research suite: 99 passed, 0 failed, 0 skipped. Syntax: 39 .mjs/.cjs files passed. Gate 1's 25 source hashes unchanged; main clean at original base. Repository test result is recorded in the evidence log after completion.
- Scanner limitations: security scanned one JSON and no added .mjs; module scanner does not recognize these source extensions or sibling tests. Their PASS flags are not JavaScript security or test-coverage certification. Self-checks and directed tests were used; no independent review claimed.
- Sanitized incident: an earlier process-command-line path filter accidentally exposed a credential-bearing field in tool output. The user was informed immediately. No value was used, copied into code, hashed or placed in research artifacts. Process-command-line inspection stopped; subsequent reads select only the configured DSH ref and return availability. The exposure remains in conversation history; the affected credential should be rotated if active. No credential was changed by this work.
- No real model request, validation-set access, dependency installation, DSH configuration mutation, commit, merge, push or formal ACMI integration.

Fifth-batch evidence: E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/dsh-b70e412e19/.
This batch resolves configuration discovery and spending-policy representation, not experimental readiness or research GO.

## Same-turn Owner amendment: delegated model review

- Owner explicitly requested this assistant to review Ground Truth and treat its reviewed content as authority. Ruling: accept operational authority for this development study, accurately label owner-delegated-model-review, and do not invent human or independent provenance. This changes the review prerequisite, not deterministic scoring of actual model outputs.
- Added owner-amendments.md and explicit gate2-freeze-v2 / gate2-review-binding-v2. A separate authorization artifact must match exact hash, development scope, reviewer, delegated authority and deterministic-only scoring. Same-author/reviewer is allowed only in this mode. Old v1 rules continue unchanged.
- Readiness no longer requires a fictitious second human in the delegated mode. Integrity reports retain false human authenticity, independence, semantic and live flags. Authorization bytes are not exported to model-visible public inputs.
- RED delegated success/readiness cases failed, then passed after implementation; negative tests cover missing/stale authority, mode substitution, mismatched reviewer, LLM judging and incomplete corpus binding. No formal corpus or review approval was fabricated by these engineering tests.
- Repository diagnosis: default pnpm test built successfully but reproduced the same existing integrations/dsh/tests/dsh.test.ts:82 5000ms timeout twice (275/276 passed). Isolated DSH file passed 6/6; the entire suite with --maxWorkers=1 passed 43 files / 276 tests with unchanged timeout/source. This supports a concurrency-sensitive timing issue, not a proven exact root cause. Default-concurrency PASS is not claimed; no production test or implementation was changed.

Final after-amendment verification: research suite 102/102, no skips; 39 .mjs/.cjs syntax checks passed; whitespace check clean; 25 Gate 1 hashes unchanged and original main clean at 9db1ee7da8209363a1fd76f3bebc83f75dfe9c9d. Evidence includes research-tests-final.txt, both default-concurrency failures, isolated and single-worker diagnostic successes, sanitized DSH binding, Owner direction records and source snapshot. No actual model calls or formal corpus review completed yet.

## Sixth batch: single-generation transport and reviewed narrative sources

Plan: gate2/transport-plan.md; inline execution, no agents or independent reviewer.

- Added transport.mjs: final serialized request bytes, original conversation/source mapping, explicit original assistant reasoning history, single injected send, separate raw/content/reasoning capture, strict incremental SSE/UTF-8, usage/finish/DONE, deadline/cancellation and sanitized failures. No default network client, credential lookup, Host, SDK, retry, continuation or live CLI.
- Local installed pi-ai source supplied the DeepSeek-thinking wire dialect. This is not evidence that the remote alias accepts it; only synthetic Response streams were executed.
- RED -> GREEN coverage includes every byte boundary, CR/CRLF and multiline framing, malformed/duplicate-key events, HTTP errors/redirect status, truncation/filtering, missing usage, stalled fetch/read, evidence failures and request tampering.
- Additional RED regressions demonstrated incomplete raw retention after protocol rejection, archive callback mutation of parser bytes, abort-aware fetch misclassification, cancellation during request recording, timer starvation from synchronous capture and an unhandled late rejected promise. Fixed each; all raw bytes received after protocol rejection are drained within bounds without parsing/repairing later output.
- Ruling: wire capture means original application body bytes delivered by Fetch, not compressed HTTP framing/TCP/TLS. Sink latency is measured separately; first-content latency is not the first user-visible A/B answer. Deadline/size/network/sink failures explicitly allow partial evidence rather than claiming completeness.
- Authored development-scenarios.md: six distinct semantic stories, 48 turns / 49 user units, 13 canonical task IDs and per-row attribution/state/negative-case rationale. Narrative semantics self-reviewed under Owner delegation; no reused engineering skeleton or validation data. F6 distinguishes known-task/insufficient-completion-evidence, full-unit UNRESOLVED and partial-scope UNRESOLVED. Four candidate dormant cases cover change/retain.
- The narrative document is NOT frozen or executable Ground Truth. The 144 condition-turn snapshots, real reference identity marker text, unique evidence spans, deterministic answer-equivalence rules, SM counts and complete negative taxonomy still require materialization/audit. No approved review binding was attached to nonexistent oracle bytes.
- Final research suite: 118 passed, 0 failed, 0 skipped; 16 new transport tests. Syntax: 41 .mjs/.cjs files passed. Whitespace check clean. Original Gate 1 hashes: 25 unchanged; main remains clean at the original base.
- Repository suite with the explicitly documented --maxWorkers=1 diagnostic setting: 43 files / 276 tests passed. This does NOT resolve or erase the preceding batch's default-concurrency DSH timeout; default command PASS is not claimed, and no production source/test timeout was modified.
- Existing security scanner saw one JSON, quality scanner zero files; neither covers the new .mjs. Directed tests and source self-checks are evidence, not an independent security review.
- No actual model request, new credential access, dependency installation, formal integration, commit, merge or push.

Sixth-batch evidence: E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/transport-3fd9c7a101/.
Next implementation boundary: materialize the reviewed narrative into explicit per-condition corpus/oracle records, audit/freeze actual prompts, then connect the transport to durable reservations and frozen plan membership. No additional generic Owner approval is being requested.

## Seventh batch: full oracle, prompt freeze and guarded sending

Plan: gate2/integration-plan.md. Delivery: gate2/integration-report.md.
Executed inline with self-checks, no independent review or subagents.

- Materialized all 144 condition-turn snapshots, complete task memory, explicit
  identity births/history, relations, evidence, answer checks and negative cases.
  Narrative edits fail the reviewed source pin. C3 begins without historical IDs.
- Owner-delegated semantic self-review is recorded honestly; no human authenticity
  or reviewer independence is invented. Full review binding v3 covers corpus,
  plan, prompts, runtime and evaluator/source bytes. Scoring stays deterministic.
- Froze development-r1 with external manifest pin
  4a892986a5eaf553c35920e8d7b68ac68e7864d2c91f3ec7990a5a20ba65f153.
  Exact source closure is reverified before send. Runtime records mutable DSH
  alias provenance, explicit uncapped policy, finite schedule and unknown pricing.
- Guard reserves final request before credentials and revalidates immediately
  before Fetch. Exact ordered membership, no duplicates/resends, original
  CLOSED-LOOP history, D1/D2 binding and evidence-kind separation are enforced.
- Added reasoning/transport channels in ledger v3 without changing v1/v2 behavior.
  Tampered prompts and a corrupt ledger after credential lookup block the send.
  An observed supplemental-record timestamp regression was corrected by recording
  the boundary failure in the existing terminal event; failure evidence retained.
- All 288 A/B oracle conformance vectors pass. A 19-call regression and separate
  99-call fixed-prefix run use synthetic Responses only; original bytes/coordinates
  are archived. The latter includes identity-bearing Session handoff and reopening
  the ledger every turn. This is not 99 model calls or a completed 576-call matrix.
- Final research tests 134/134, no skips; 51 syntax checks; whitespace check clean.
  Repository --maxWorkers=1: 43 files / 276 tests passed. Default-concurrency
  DSH timing failures from the prior batch remain unresolved, not erased.
- Gate 1's 25 source hashes unchanged; main clean at original base. No actual model
  request, new credential-value read, validation-set access, dependency installation,
  formal Host/Graph integration, commit, merge or push.

Evidence: E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/integration-a8b73f1042/.
Truth/answer-reference sensitivity and sparse difficulty-theme cells are disclosed
in the report. Real model compatibility, Token/latency/billing and mechanism GO
remain unanswered until controlled development execution; no new generic approval
or independent human-review prerequisite is introduced.

## Eighth batch: first controlled live execution and approved routing amendment

Owner authorized live development, then explicitly approved a separate routing
revision/new batch after the initial failure. Full results:
research/phase-0.9.19/execution/results-2026-11-14.md.

- Added an explicit live orchestration layer and deterministic report importer
  outside the frozen gate2 closure, with separately pinned pre-live source bytes.
  Credentials are selected only inside the post-reservation callback; values and
  Authorization headers are not printed or archived. No oracle reaches the sender.
- r1: one HTTP 400 MissingSessionID, zero model outputs; halted without retry.
  Captured error, installed pi-ai code and official documentation identify the
  missing conversation routing header in the experimental Fetch adapter.
- Owner-approved r2 adds stable conversation routing and honest User-Agent,
  archives safe headers before credentials, validates them before Fetch and during
  report import. All seven public/oracle/plan/prompt artifacts remain unchanged.
  Freeze: 312d07a46eca6430045571756dc962762d6b0dc55c17cb8d4ed3cc78d0e3acb7.
- r2: three HTTP 200 attempts; two complete outputs, third halted by 180-second
  timeout with partial reasoning. Two easy C1/A turns have valid schema and correct
  attribution; full state exact-match fails both. No B/C2/C3 or broad capability GO.
- Synchronous capture consumed 111.5/114.7 seconds in t2 and 175.7/180.5 seconds in
  t3. Full-journal replay on every append is the identified hot path. Offline replay
  of the 3267-event journal takes 227-231 ms. No extra model call was used to diagnose.
- This exposes insufficient stress coverage in the earlier synthetic Responses;
  integrity/protocol passing was not a realistic chunk-rate performance guarantee.
- Post-routing research suite 140/140; actual r2 freeze passed 19 synthetic generations.
  No prompt tuning, frozen-truth edits, model judge, generation repair, automatic
  retry, production integration, dependency install, commit, merge or push.
- Both runs are halted. Four real HTTP attempts total, two complete outputs. Unknown
  total consumption/cost remains unknown because t3 supplied no usage. Actual fee
  cannot be inferred as zero from the provider's Go cost field.

Evidence roots: E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/live-20261114-r1/
and E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/live-20261114-r2/.
Next boundary: offline sink-performance repair using captured chunk granularity,
integrity/concurrency regression, then a separately frozen revision before more live work.

## Ninth batch: sink repair, real-fragment replay and development-r3

Owner authorized repair, offline validation, unchanged-material freeze and new live
execution on 2026-11-15. Plan: sink-plan.md; implementation/evidence: sink-repair.md;
results: ../execution/results-2026-11-15.md. No subagents or independent review.

- Replaced per-capture full parsing with private validated cache under the same lock,
  high-resolution file-change checks, in-memory head anchoring and full audits at
  reserve/settle/snapshot/reopen. Channel byte accounting is constant-time. Flush,
  original bytes/times, budgets, duplicate guards and no-retry behavior are preserved.
- RED regression showed absent capture-cache diagnostics and undetected known-head
  rollback; GREEN includes tamper/restored mtime, snapshot mutation, failed/partial
  writes, peer append, interrupted calls, stale locks and competing processes.
- Original 3267-event trace replayed in 8.383 s with exact payload/state equality.
  12904 amplified captures took 33.316 s; final/first block 0.8474. Tests 145/145.
  These are engineering checks, not statistical bounds or model-performance scores.
- Froze r3: a335bd5c340249021e534a3a8de23f079e504308cae41bd8350ea6c07470d168.
  Seven study material hashes unchanged; timeout/routing unchanged. Pin explicitly
  concerns this revision's outputs, not outputs from the prior known dev batches.
- New real run: 29 attempts, 28 complete, then C3/D2/t8 timeout at 180.413 s.
  Sink consumed 7.694 s (4.26%), not the old 97.33%. Reasoning still arrived near
  deadline, but no marker/usage completed. No retry, fallback or further live batch.
- Frozen deterministic scoring: C1/A eight-round trace schema and attribution pass,
  state exact-match fails; B replay has frame errors in each sampled condition.
  Literal scan records inter-frame whitespace without repairing/rescoring. No LLM
  judge or truth/prompt changes. D remains outside A/B GO. No mechanism GO claimed.
- r1/r2 artifacts and halted runs retained. Reported 169717 Tokens cover only 28
  complete calls; actual total consumption and cost remain unknown. No main/Host/
  Graph integration, production edits, dependency installs, commits, merge or push.

Evidence roots: E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/sink-20261115-r3/
and E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/live-20261115-r3/.

## Tenth batch: protocol review proposal only

Owner requested a proposal for D diagnostic timeout/stopping and B frame whitespace,
with unchanged research question/oracle/plan and no rescoring or reruns. Submitted
protocol-revision-proposal-2026-11-15.md for review; neither proposal is implemented.

- R-D recommends retaining the 180-second generation deadline and allowing only a
  strictly audited D2 deadline-censoring outcome to continue to the next original
  coordinate. D1 and other failure classes remain globally stopping. Requires new
  prefix-integrity/cleanup evidence and explicit versioned settlement semantics;
  the existing timeout flag is insufficient. No retry or old-ledger unhalting.
- R-B recommends an explicitly frozen bounded ASCII frame-boundary whitespace
  profile, with unchanged markers, JSON/schema/semantic constraints and prompts.
  Original bytes and all historic scores remain untouched; no normalize-and-rescore.
- Both proposals can be approved independently. Exact boundary rules, cleanup
  limits, reporting denominators, comparability risks and offline acceptance cases
  are specified. No new batch, new freeze, implementation or evaluation was run.
- Work in this turn is document-only, based on read-only source/report inspection
  and file-integrity checks. Await Owner review before further action.

### Owner approval recorded (2026-11-15)

Owner approved the submitted R-D/R-B proposal. Recorded approval of the technical
rules and preservation/reporting boundaries in the proposal's decision section.
Per its explicit stage-authorization clause, this approval does not by itself
authorize implementation or new model batches. Offline implementation/acceptance
is the recommended next stage, pending explicit stage authorization. No code,
frozen materials, historical scores or run evidence changed; no model calls,
rescoring, reruns or new freeze performed.

### Offline revision implementation accepted locally (2026-11-15)

Owner explicitly authorized offline implementation/acceptance after proposal
approval. Implemented R-D/R-B as explicit versioned policies, v4 audited censor
settlement, shared B scanner, guarded history, runner and diagnostic reporting.
Live entry rejects new revisions pending separate freeze/run authorization.

Final verification: 171/171 offline tests, 66 syntax checks, 195 protected hashes
unchanged. Synthetic prefix: 62 planned slots, 6 D2 censors with continuation,
15 B rows including 8-turn CLOSED-LOOP; subsequent request-only D2 interruption
reported as dispatch-unknown. No real model calls or historical rescoring.
See revision-acceptance.md for exact evidence paths, self-review fixes and limits.
Existing main remains clean; no commit/merge/push, production Graph mutation,
new development freeze or independent reviewer. Await Owner's next-stage review.

### R4 live authorization and launch preparation (2026-11-15)

Owner approved offline acceptance and explicitly authorized refreeze plus one
finite new development batch, with unchanged prompts/oracle/plan and no retry or
replacement. Added a narrow live grant for live-20261115-r4/development only;
offline approval, another batch/run, changed count or retry flag cannot activate it.
New grant and refreeze assembly have RED-to-GREEN regression tests. Policy semantics
are unchanged. Fresh regression and seven-material/hash verification precede launch.
Execution authorization record: ../execution/r4-authorization.md. Historical
acceptance documents describe their original timepoint and remain unchanged.

### R4 frozen, executed and globally stopped (2026-11-15)

174/174 pre-send regressions and 68 syntax checks passed. Frozen development-r4:
9be9d99829e457b01f68578f652d6e4847b29a8503bc335bfc9580057608fac4.
Seven study materials match r3; original schedule remains 576 slots.

35 real calls dispatched and settled, 34 complete, 541 unattempted. Request 35
(icon-invoice-switch/C1/B/FROZEN-REPLAY/t2/single) hit response_byte_limit at
1048650 raw bytes against 1048576, no content/usage. Ledger halted, driver exit 2;
no retry, replacement or subsequent batch. All 5 D2 transports completed, so no
live diagnostic censor occurred. Deterministic report generated once for r4 only;
zero scoring defects. Report and evidence: ../execution/results-r4-2026-11-15.md.
No frozen dependency changed during execution; no old score or failure overwritten.
Conclusion EXPLORATORY_NOT_GO, not a global model-capability verdict. No active run.

### Wire/evidence revision proposal only (2026-11-15)

Owner requested separate review of raw wire capacity, streaming envelope overhead
and evidence-sink burden, without raising limits, resuming or replacing samples.
Submitted wire-evidence-revision-proposal-2026-11-15.md. No implementation/config
change, test/replay, scoring, refreeze or model call in this review turn.

Read-only journal counts distinguish Fetch body/read fragmentation, decoded payload
and journal encoding. Final r4 attempt: 5667 reads, 16178 logical records, 9786240
serialized journal bytes; full run 99985 records / 62484057 bytes. These are storage
measurements, not newly assigned research scores. Existing sink timing is callback
time, not isolated disk time or complete attempt-wall time.

Recommended independent items: bounded accounting; raw-first two-stage per-read
durable transactions; keep current 1 MiB live budget while treating 4 MiB solely
as a single offline capacity candidate requiring closed budgets and later approval.
No cross-read buffering, dropped evidence, removed flush, relaxed D2 stop policy
or automatic extra model batches. Scope and engineering gates await Owner review.

### R-O / R-S offline implementation and acceptance (2026-11-15)

Owner approved offline work only. Implemented offline-only v5 raw-first transactions,
bounded wire accounting and explicit guarded offline harness opt-in. Default live
resource cap remains 1048576 bytes; no development refreeze or model requests.

All 35 r4 prefixes replayed: 99985 logical events, 35308 raw reads, original payloads,
hashes, source times and order equal after reopening; last attempt remains halted.
Final regression 189/189, no skips; 73 module syntax checks and git diff --check pass.
Crash/flush/tamper/concurrency and narrow D2 continuation rules covered. Self-check
found physical-head rollback via valid re-framing; RED/GREEN guard fix retained.

Five predeclared paired trials completed once. Append/flush calls reduced 35.05%;
capture median ratio 0.6721; audit ratios 1.3001-1.4863 FAIL the <=1.25 gate. No gate
relaxation or benchmark rerun. Final hardened revision is not claimed performance-
accepted. Extra physical frames increase journal bytes; full audit remains enabled.

4 MiB capacity NOT recommended: unchanged raw-channel cap cannot hold a +1 byte
overshoot. Fragment metadata and 576 near-limit history capacity are not closed.
Sparse 0/35/576 state probes are not a saturation proof. All historical 267 files,
seven frozen study inputs and main remain unchanged. No historical scoring rerun.

Report: wire-evidence-acceptance-2026-11-15.md. Evidence: gate-2/offline-ro-rs-20261115.
Disposition: offline acceptance executed, not fully passed; no new freeze/live batch.

### Transaction / full-audit / capacity proposal only (2026-11-15)

Owner requested independent review, not implementation. Submitted
transaction-audit-capacity-proposal-2026-11-15.md. Only this proposal and progress
entry changed; no tests, replay, scoring, format migration, refreeze or model call.

Proposed separate decisions: R-E compact fixed-header/raw-byte-hashed container
retaining complete logical JSON events; R-A streaming full-history audit with
equivalent state/context materialization, never fewer critical audit boundaries;
R-C explicit resource-vector proof at the unchanged 1 MiB live admission value.
Current constraints are not claimed closed; new read/cleanup/channel restrictions
or sidecar designs require separate approval. Existing audit gate failures remain.

Original >=30% append reduction, <=0.80 median capture ratio and <=1.25 per-pair
p99/audit/RSS gates remain, using v4 rather than failed v5 as the baseline. No
automatic candidate search, performance rerun, capacity increase or batch execution.
Protection baseline covers 566 existing research/live/offline evidence files.
Disposition: proposal submitted for Owner review; no architecture change authorized.

### R-E / R-A correctness and R-C capacity proof (2026-11-15)

Owner authorized offline implementation/correctness and capacity proof only;
performance acceptance requires a later decision. Implemented explicit offline
v6 binary frames, shared logical rules, streaming full-history audits, compact
settled summaries and private-token-bound selective reads. No audit boundary
removed; selective materialization adds another full audit. Old snapshots remain.

Correctness: all 99985 original r4 logical events, 35308 read boundaries and 35
attempts equal, including reopened/selected state; final halted=true. 62 synthetic
guarded steps preserve request bytes/history across restart. D2 narrow continuation
and all resource/other-arm vetoes covered. Final regression 208/208, zero skips;
82 module syntax checks and diff whitespace check pass. This is self-checking.

Capacity remains NOT CLOSED: old 1 MiB admission plus a large next read exceeds
the unchanged 4 MiB wire channel. End-to-end synthetic transport reports incomplete
evidence and halts. Broad frame-format bounds do not prove allocatable memory;
0/35/576 sparse state checks are not saturation proof. No new protection limits.

No performance series/gate, research refreeze, model call, rescore, resend or sample
replacement. Live cap and original thresholds unchanged. All r1-r4/R-O/R-S evidence
retained. Report: transaction-audit-correctness-2026-11-15.md. Artifacts:
gate-2/offline-re-ra-rc-20261115. Await separate Owner decision on performance work.
