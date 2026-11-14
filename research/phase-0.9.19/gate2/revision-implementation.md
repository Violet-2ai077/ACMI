# R-D / R-B offline implementation ledger

Spec: protocol-revision-proposal-2026-11-15.md, approved by Owner.
Owner subsequently explicitly authorized offline implementation and acceptance.
No live calls, historical rescoring, production changes or development freeze.
Synthetic test packages are isolated test fixtures, not a new study freeze.

## Plan and interfaces

1. Add B-inline-v1-ws1 scanner and shared streaming/final adapter. Preserve Gate 1
   bytes; decode grammar before reusing its envelope semantic validator.
2. Add versioned D-180-LOCAL-v1 transport with delivery/cleanup facts; retain
   legacy transport for absent revision configuration.
3. Bind explicit policies into v4 ledger and guarded boundary. Audit terminal
   facts before durable censored settlement; recover only settled next slots.
4. Connect execution/report dispositions and diagnostic denominators.
5. Run synthetic acceptance, full offline regressions and protected-file hashes.

Pre-flight: parser feeds both history and report; both must select the frozen
profile explicitly. Transport facts feed ledger transition, including replay;
runner may continue only from the persisted audited disposition. Plan and
prompts are inputs, not editable implementation surfaces.

Ruling: use current isolated detached worktree and existing Gate 2 ledger
conventions; no new worktree, commit or independent reviewer. User forbids
unapproved independent agents. Serena is documented as bound to another project;
use explicit scoped shell reads and apply_patch, never inspect that project.

## Progress

- Authorization recorded; implementation pending. Protected baseline: 195 files
  covering Gate 1 and historical r1/r2/r3 evidence. No historical parser rerun.

- Task 1: B scanner/adapter implemented. Four synthetic tests GREEN after missing
  API RED; all byte splits and single-byte feeding, layout limits/negative vectors,
  escaped payload and unchanged semantic validator behavior covered.
- Task 2: versioned transport implemented. Nine tests GREEN; added RED-to-GREEN
  regressions for callback buffer mutation, timer-starved cleanup >5000 ms and
  cancellation EOF incorrectly implying remote body completion.
- Task 3: v4 settlement and guard implemented. Six ledger tests GREEN, including
  nonempty pre-deadline/cleanup wire audits, D1/A/B/C0 rejection, bounded budget
  rejection, crash-before-settlement and two competing OS processes. No agents.
- Task 4: runner/report connected. Three integration tests GREEN at the prior
  checkpoint; revised source/test/approval closure still requires final suite.
  Synthetic schedule prefix includes 62 slots and B CLOSED-LOOP, followed by a
  deliberately interrupted D2 for dispatch-unknown reporting. All 576 planned
  coordinates remain unchanged; this is not a 576-call model run.
- Initial full regression: 161/161 passed before added edge tests. Final suite,
  source syntax and protected hashes remain pending below.

Ruling: use explicit offline clock injection for exact deadline/cleanup tests;
the live entry rejects injected clocks and new revisions. Cost if wrong: fake
clock acceptance would not establish real scheduler/service behavior, so no such
claim is made and live authorization remains separate.
Ruling: preserve unknown dispatch after a request-only crash; affected diagnostic
rates are null rather than silently dropping that coordinate. This is reporting
of missing evidence, not a change to oracle or scoring eligibility.

Self-review (not independent): checked deadline/read races, old journal semantics,
raw B preservation, D availability denominators and no-live guard. Test failures
and subsequent fixes are retained in conversation evidence and synthetic test
directories; final acceptance logs are archived separately.

## Final acceptance

All five tasks completed for offline scope. Full suite: 171/171 passed, zero
failures/skips; 66 script syntax checks; 195 protected files unchanged. Final
evidence and limitations are in revision-acceptance.md. No live calls, old-score
changes, development freeze, commit, main integration or independent agents.

Additional self-review regressions fixed RED-to-GREEN: inherited prototype field
names bypassing the raw-reader-only bridge, native AbortError stream closure and
an ordinary read rejection racing deadline cancellation. The new B bridge uses
the existing wire validator's closed-field check; Gate 1 remains unchanged.
The last added regression confirms identical semantic scores for synthetic stale
state/missing-memory/false-completion vectors under layout vs strict decoding.

Auxiliary scanner limitation: generic quality/security scripts did not scan mjs
source (0/1 files respectively). Their passed flags are not source-audit evidence.
No independent review is claimed. Owner freeze/run authorization remains pending.
