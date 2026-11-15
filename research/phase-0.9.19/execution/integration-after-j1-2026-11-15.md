# Integration after J1 - 2026-11-15

Owner explicitly requested merge to main and push after the J1 static report.
This is repository synchronization, not approval of a new research experiment.

## Scope

- Synchronize the previously authorized offline capacity/performance preparation
  tools and tests, full-workload/bridge findings, P-G structural review, S1/S2,
  the joint delivery/capacity proposal, J1 proof and current status entries.
- Preserve original reports, scores, frozen materials and all failure evidence.
  P-G remains FAIL; DC-EC-1 remains blocked; live admission remains 1 MiB.
- No production Host/Graph interface change, new implementation work, model call,
  historical rescoring, performance series or research refreeze is included.
- Keep the feature branch and worktree. No history rewrite, force push or evidence
  deletion is authorized or needed.

## Verification and evidence custody

Integration logs are independently archived at:
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/integration-after-j1-20261115-211906/`.

The research Node suite uses `--test-concurrency=4`; the existing workspace test
command retains `vitest run --maxWorkers=4`. Timeouts, assertions and research
gates are unchanged. Both suites use synthetic/offline transports. Synthetic
test packages are not a new freeze of the actual research materials.

Preflight verified unchanged SHA-256 for 25 J1 artifacts and its original report,
267 live files, 456 historical files, 234 workload artifacts, 158 workload source
snapshot files and seven frozen study inputs. These overlapping sets are not
summed as a unique-file count. The original J1 record's clean main/old HEAD and
zero-tests statements describe that earlier static-only turn, not this merge.

Raw streams, journals, large fixtures and full test logs remain in their existing
local evidence directories, not in Git. No credentials or installed provider
profile are included. Git alone is not a complete replay archive.

## Integration checks

Feature-checkout verification passed:

| Check | Result |
| --- | --- |
| Research Node suite, concurrency 4 | 233/233 passed |
| Workspace source checks | 806 files passed |
| Workspace Vitest, maxWorkers 4 | 43 files, 276/276 tests passed |
| Model-continuation offline Node suite | 30/30 passed |
| Build and three synthetic demos | Passed through `pnpm check` |
| Git whitespace check | Passed |

The same research suite and `pnpm check` must pass on merged main before push.
Final commit/remote identities and post-merge logs are recorded separately in
the integration evidence directory, avoiding edits to the historical J1 proof.
No current capacity or model GO is inferred from regression tests passing.
