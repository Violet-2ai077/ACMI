# Phase 0.9.19 - current research checkpoint

Updated: 2026-11-15. This checkpoint supersedes historical "not yet run" or
"main unchanged" statements only as a description of the current stage; it does
not rewrite the evidence or authorizations recorded at those earlier times.

## Decision and authorization

- Research question unchanged: can one normal answer generation also identify,
  mark and continuously maintain its work task?
- **No model GO.** Stopped exploratory batches are not a confirmation study.
- **R-E/R-A correctness: passed within tested coverage.** Latest pre-integration
  suite: 208/208. Real captured-prefix differential: 35 attempts, 35,308 original
  read boundaries and 99,985 logical events equal. No model output rescoring.
- **R-C capacity: NOT CLOSED.** The 1 MiB admission limit does not bound the next
  delivered read or complete evidence footprint. A synthetic oversized delivery
  reproduces incomplete evidence followed by a halted ledger.
- **Performance acceptance: NOT RUN for R-E/R-A.** Earlier R-O/R-S failures stay
  failures. Sparse 576-slot recovery is not a saturated capacity proof.
- Latest Owner instruction authorizes synchronizing this work, merging `main`
  and pushing. It does not authorize new limits, weaker gates, research refreeze,
  further model batches or production Host/Graph integration. Live stays 1 MiB.

## Complete design and implementation history

| Material | Entry |
| --- | --- |
| Revised design R2 | [Full design](design/model-native-task-attribution-research-design.md) |
| Original design | [Unmodified v1](design/model-native-task-attribution-research-design.v1.md) |
| Owner review differences, matrix and budget | [Revision summary](design/owner-review-revision-summary.md) |
| Gate 1 implementation plan | [Plan](design/gate-1-implementation-plan.md) |
| Gate 1 implementation and acceptance | [Design](DESIGN.md), [report](gate-1-report.md), [historical ledger](progress.md) |
| Gate 2 oracle, prompts and pre-send accounting | [Design](gate2/DESIGN.md), [integration report](gate2/integration-report.md), [ledger](gate2/progress.md) |
| First live batch | [2026-11-14 results](execution/results-2026-11-14.md) |
| Subsequent stopped batches | [2026-11-15 results](execution/results-2026-11-15.md) |
| R4 development batch | [Original report](execution/results-r4-2026-11-15.md) |
| D timeout and B whitespace revisions | [Proposal](gate2/protocol-revision-proposal-2026-11-15.md), [acceptance](gate2/revision-acceptance.md) |
| R-O/R-S wire accounting | [Proposal](gate2/wire-evidence-revision-proposal-2026-11-15.md), [acceptance and failures](gate2/wire-evidence-acceptance-2026-11-15.md) |
| R-E/R-A/R-C transaction, audit and capacity | [Proposal](gate2/transaction-audit-capacity-proposal-2026-11-15.md), [implementation](gate2/transaction-audit-implementation.md), [results](gate2/transaction-audit-correctness-2026-11-15.md) |

Design files are byte-preserving copies of the existing deliverables, not a new
revision or freeze. Their original local path references and approval status at
the time of writing are deliberately retained. See `design/SHA256SUMS.txt`.

## Evidence custody and synchronization

- Source, tests, design, plans, original reports and the selected summary/index
  files under `evidence-index/` are synchronized in Git.
- Original raw streams, transaction journals, test logs, frozen runtime packages
  and prior source snapshots stay at
  `E:/codex-prj/ACMI/verification/phase-0.9.19/` without modification. They are not
  uploaded by this synchronization. No provider credentials or installed profile
  is imported. Git alone is therefore not a complete real-output replay archive.
- The 456 protected historical files and seven frozen study inputs matched their
  recorded digests at the R-E/R-A/R-C checkpoint. `evidence-index/` preserves that
  verification, the real-prefix comparison and the capacity counterexample.
- `evidence-index/overshoot-transport.json.raw` keeps the original JSON bytes,
  including its missing final newline. The `.raw` suffix distinguishes this
  immutable artifact from repository-formatted JSON; its SHA-256 is unchanged.
- Its `final-verification.json` describes the earlier pre-merge checkpoint;
  `main.clean` and the old HEAD there are historical facts, not a claim that this
  newly authorized merge never occurred. Do not edit that original evidence.
- Integration-time checks are separately archived at
  `E:/codex-prj/ACMI/verification/phase-0.9.19/main-sync-20261115/`.
- Preserve the feature worktree and branch for traceability. No cleanup or
  historical evidence deletion is part of this integration.

## Offline verification

From the repository root, with the pinned Node/pnpm versions:

```powershell
$tests = Get-ChildItem -LiteralPath research/phase-0.9.19/tests -Filter '*.node-test.mjs'
node --test $tests.FullName
pnpm check
```

The research suite is separate from `pnpm check`; existing CI does not run it.
Research evidence paths are currently Windows-local; cross-platform research
qualification is not claimed. Tests use offline/synthetic transports, not the
live execution scripts. Do not invoke `execution/live.mjs` or freeze scripts as
part of verification or infer new execution permission from their presence.

### Integration preflight observations

The research suite was rerun: 208/208 passed. In this feature checkout, default
`pnpm check` twice hit the existing 5000 ms timeout in one unchanged dsh test
(275/276 passed). The first run overlapped research tests; the second did not.
The isolated dsh file passed 6/6 and the complete Vitest suite passed 276/276 with
`pnpm exec vitest run --maxWorkers=1`, without changing timeouts or assertions.
The original main checkout passed default `pnpm check` before integration.
These observations do not establish the exact timeout cause; all failed logs
are retained. Default `pnpm check` and the research suite must also run on the
merged main before push. No test code, production code, dependencies or CI
configuration was changed to make this synchronization pass.
