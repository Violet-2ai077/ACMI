# Test worker budget: diagnosis and integration verification

Date: 2026-11-15. Owner approved a four-worker Vitest budget, full verification,
documentation synchronization, main integration and push. This is an engineering
test-runner change, not research performance acceptance or permission to run models.

## Reproduced failure and controls

The existing test `loads with stock Cordis/dsh tools, preserves explicit revisions
and serves scoped metadata` in `integrations/dsh/tests/dsh.test.ts` timed out at
its unchanged 5000 ms deadline. On this 12-logical-CPU machine, the installed
Vitest 4.1.12 resolves its unconfigured worker limit to 11.

Temporary phase markers showed distributed slowdowns, not an attribution
assertion failure. In one reproduced failure, first-page history retrieval
completed at 4670 ms; the test then timed out during cursor validation.

| Phase duration | Isolated dsh file | Default full suite | Four-worker full suite |
| --- | ---: | ---: | ---: |
| First task binding | 18 ms | 735 ms | 25 ms |
| Second task binding | 17 ms | 550 ms | 21 ms |
| History query | 69 ms | 417 ms | 72 ms |
| History render | 68 ms | 653 ms | 84 ms |
| First-page query | 55 ms | 776 ms | 97 ms |
| Total target test / finished callback | 556 ms | 5032 ms, timeout | 848 ms |
| Suite result | 6/6 | 275/276 | 276/276 |

The exact lower-level source of contention (CPU, storage, filtering or scheduling)
was not isolated. Default runs sometimes passed; a successful retry alone was not
treated as a fix. The earlier 276/276 single-worker control and four-worker full
suite support explicit bounded concurrency. These individual diagnostic timings
are not a statistical performance qualification.

All instrumentation was removed before the final uninstrumented control. On
merged main, process-local `VITEST_MAX_WORKERS=4` then allowed complete `pnpm check`
to pass: lint/build, 276 Vitest tests, 30 offline model-continuation tests and all
three demos. The environment override was restored afterwards. That control
preceded approval of the permanent command change recorded here.

## Permanent change and preserved boundaries

- Only the `test` script changes executable behavior:
  `pnpm run build && vitest run --maxWorkers=4`.
- Existing `pnpm check` and CI already call this script and inherit the budget.
  No separate CI settings or dependency changes are required.
- The worker count is a concurrency ceiling, not a requirement to keep four
  workers busy. Direct ad hoc `vitest run` without the package script is not the
  standardized acceptance entry point.
- The 5000 ms timeout, every assertion and test case remain unchanged. No tests
  are skipped. No production behavior or research implementation is changed.
- Research protocol, prompt, oracle, plan, 1 MiB live limit, failure scores and
  stopping rules remain unchanged. Capacity remains NOT CLOSED; R-E/R-A
  performance acceptance remains NOT RUN. No new model batch or freeze.

## Fresh verification and evidence custody

Run the following serially in the feature checkout and again on merged main,
with no `VITEST_MAX_WORKERS` environment override:

```powershell
pnpm check
$tests = Get-ChildItem -LiteralPath research/phase-0.9.19/tests -Filter '*.node-test.mjs'
node --test $tests.FullName
git diff --check
```

Fresh logs and a generated final verification index are retained separately at
`E:/codex-prj/ACMI/verification/phase-0.9.19/main-sync-workers4-20261115/`.
The index identifies the verified commits and hashes the logs. Results must be
read from those actual completed runs, not inferred from the diagnostic control.

Feature-checkout verification after the permanent command change passed:

| Check | Observed result | Log / record |
| --- | --- | --- |
| Standard `pnpm check`, no environment override | Passed: lint/build, 276/276 Vitest, 30/30 continuation tests, three demos | `feature-check.log` |
| Separate research suite | 208/208, zero failures or skips | `feature-research.log` |
| Research module syntax | 82/82 | `scope-verification.json` |
| Prior integration evidence | 17 files unchanged | `prior-sync-baseline.json` |
| Protected research history | 456 files unchanged | `scope-verification.json` |

The final main run is a separate required gate before push; its outputs are
`main-check.log` and `main-research.log`, indexed by `final-verification.json`.
This record does not claim cross-platform research acceptance or remote CI success.

Original failures, diagnostic patches and controls remain unchanged at
`E:/codex-prj/ACMI/verification/phase-0.9.19/main-sync-20261115/`, including
`dsh-timeout-diagnosis.md`, `workspace-before-merge.log`,
`workspace-serial-final.log`, `workspace-after-merge.log` and
`dsh-timing-default-stderr.log`. Their hashes are captured before this fix and
checked again before push. The prior 456-file research evidence baseline is also
checked without modifying original archives. No failed run is replaced by a pass.

Keep the historical design, source snapshots and pre-merge verification records
as written. Their old HEADs and approval statuses describe earlier checkpoints.
Raw logs and runtime journals remain in local custody; Git contains source,
documentation and selected evidence indexes, not a complete raw replay archive.
