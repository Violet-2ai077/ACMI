# Explicit model continuation verification (2026-11-14)

This report records new evidence only. Prior 0.9.x experiment evidence and model
files are read-only inputs, not regenerated or reclassified by this run.

## Delivery status and full regression

All three selected stages are complete: baseline/documentation closure,
experimental explicit model continuation, and usability/delivery readiness.
Base main is `6efc0c4`; work is retained on `codex/explicit-model-continuation`
at `E:/codex-prj/ACMI/worktrees/explicit-model-continuation`. Main is unchanged.
No new push, release, tag, historical cleanup or independent-review authorization
was inferred from the previous milestone. This round used implementation workers
and parent self-checks, not a newly authorized independent code review.

Independent no-local clones at functional/runner commit `d31e300` passed:

| Check | Windows x64 | Ubuntu 24.04 WSL |
| --- | --- | --- |
| Offline frozen install | PASS | PASS |
| `pnpm check` source tests | 43 files / 276 tests | 43 files / 276 tests |
| `pnpm check` model-path Node tests | 29 / 29 | 29 / 29 |
| Build, source/link checks and three demos | PASS | PASS |
| Built dsh integration tests | 21 files / 154 tests | 21 files / 154 tests |
| Historical and new offline script tests | 92 / 92, zero skipped | 92 / 92, zero skipped |
| Original CLI, three additional rounds | 11 / 11 each | 11 / 11 each |
| Model-path Node tests, three additional rounds | 29 / 29 each | 29 / 29 each |
| Cross-process fake acceptance | Derived action + empty control | Historical-value recovery |
| Worktree after all checks | Clean | Clean |

Suites overlap; their counts are not unique-test totals. Windows logs are
`E:/codex-prj/ACMI/verification/phase-0.9.18/windows-clean-*.log`; Linux logs are
`ubuntu-*.log` in the same directory. The Linux clone is
`/var/tmp/acmi-phase0918-verify.iFk6mS/source` and uses a dedicated Node 24.16.0
distribution, leaving the system runtime unchanged. Both platforms use pnpm
11.28.5 and the unchanged lockfile. This is local verification, not hosted CI;
the old main CI is not evidence for this branch.

The later `76afbb1` change only enables the model capability in the existing
missing-Journal regression, so its rejection is proved to come from recovery
blocking rather than default-off behavior. It changes no implementation.
The final documentation records these results separately from real inference.

The existing generic security scanner reported no findings across 36 integration
TypeScript files, but covers only one file in the console directory and does not
cover its `.mjs` implementation. It is not a security qualification. Manual
self-checks and targeted authorization/transport/confirmation regressions cover
the new path; scope and accepted limits are in the
[design](../superpowers/specs/2026-11-14-model-continuation-design.md).

## Scope and fixed acceptance

The subprocess runner uses dedicated empty workspace, Journal, graph and home
roots. Every task creation and binding passes through preview and confirmation.
Seed and reopen are separate Node processes. Reopen starts identity-unbound and
must explicitly select the original Task UUID in a fresh native Session.

The frozen fixture records primary launch `CEDAR-47` / port `4317` and separate
distractor `PLUM-92` / port `9821` through native model turns. Neither value is in
the task objective, acceptance criteria, or continuation question. The reopened
turn must retrieve primary historical text, exclude distractor text, and answer
with both primary values. A failed answer remains a failed semantic gate; there
is no retry or prompt tuning.

## Recorded results

| Gate | Result | Evidence |
| --- | --- | --- |
| Fixture oracle self-tests | PASS, 4/4 | Both `fixture.node-test.mjs` and `derived-fixture.node-test.mjs` |
| Default console subprocess walkthrough | PASS | `E:/codex-prj/ACMI/verification/phase-0.9.18/walkthrough-01/summary.json` |
| Native model path with deterministic completion | PASS, 3 calls / 3 native Sessions | `E:/codex-prj/ACMI/verification/phase-0.9.18/fake-02/summary.json` |
| Real local model historical-value recovery | PASS on first attempt, 3 calls | `E:/codex-prj/ACMI/verification/phase-0.9.18/real-01/acceptance/summary.json` |
| Deterministic derived-action and empty-history control | PASS, 4 calls / 4 Sessions | `E:/codex-prj/ACMI/verification/phase-0.9.18/derived-fake-01/summary.json` |
| Real derived-action and empty-history control | PASS on first attempt, 4 calls | `E:/codex-prj/ACMI/verification/phase-0.9.18/derived-real-01/acceptance/summary.json` |
| Launcher syntax | PASS | PowerShell parser; no server launched by this check |

Walkthrough seed PID `65808`, reopen PID `117276`; both exited `0`, both close
results reported `saved: true`. The original Task UUID and fixed native sample
history survived process exit, while the reopened Session UUID changed.

Deterministic seed PID `184260`, reopen PID `154760`; both exited `0`. The native
audit verifies exactly one user message, one assistant message and one completed
turn in each of three distinct Sessions. It matches assistant text and usage to
the completion ledger, checks context SHA-256, and resolves both historical
coordinates back to exact seed-A Journal events. The original `fake-01` run also
passed; `fake-02` repeats it after integrating the native audit into the runner.

### Real model outcome

The private server PID was `100164`; seed PID `67612`, reopen PID `45744`.
All three native turns ended `completed`, each in a distinct Session. The launcher
exited `0` and recorded `ownedProcessStopped: true`. There were exactly three
completion requests, no retry, no timeout and no truncation. Server readiness and
shutdown are recorded in `real-01/runtime.json`; raw Journal files, prompts,
normalized completions and usage remain under `real-01/acceptance`.

| Turn | Input tokens | Output tokens | Total |
| --- | ---: | ---: | ---: |
| Seed A | 254 | 29 | 283 |
| Seed B | 258 | 27 | 285 |
| Reopen A | 598 | 34 | 632 |
| Total | 1110 | 90 | 1200 |

Reopened context was 1155 UTF-8 bytes, containing two verified seed-A evidence
coordinates. SHA-256:
`003b3483e20a4d4960f77a8d996a2fb2f6b2f83b7f0e2423de6fd7b87816ffae`.
The native assistant answer was:

> The next concrete launch step for the selected task involves the previously
> recorded codename CEDAR-47 and a local service port of 4317.

This passes the frozen historical-value recovery and A/B isolation assertions.
It does **not** demonstrate a useful operational next action: the answer repeats
the settings rather than specifying a command or procedure. No broader planning
quality claim is made. The semantic gate was not changed after seeing the answer.

After this successful real run, a defensive per-process callback limit was added
to the runner (two seed calls, one reopen call). This does not change prompts,
runtime, assertions, or the recorded real evidence; subsequent deterministic
verification covers that guard without spending more real-model requests.

### Independently frozen derived-action follow-up

The first run's prompt and assertions remain unchanged. Because it only recovered
settings, a separate follow-up was registered before execution. Its exact prompt
is in `scripts/phase-0.9.18/derived-fixture.mjs`; SHA-256 frozen before the run:
`3ce2e956a5f09a51d33a78a4e38be16dc9870c5044c6d045031e6a5d51013163`.
It asks for `serve --name <saved-codename> --port <saved-port-plus-one>` using only
selected historical evidence, or exactly `MISSING_CONTEXT` when either value is
absent. The question contains no fixture answer values.

The predeclared success criteria are strict whole-answer equality (after outer
whitespace trimming) with `serve --name CEDAR-47 --port 4318`, no B evidence, and a
separate fresh empty task receiving the identical question and returning exactly
`MISSING_CONTEXT` with zero context sources. Four calls are planned: native seed
A, native seed B, reopened derived A, fresh empty-task control. There is no retry
or post-result prompt adjustment. The two real runs together are limited to
seven calls, below the approved eight-call cap.

The real follow-up passed on its first attempt. Selected A returned exactly:

```text
serve --name CEDAR-47 --port 4318
```

The empty-history task, using the identical continuation question, returned
exactly `MISSING_CONTEXT`. The command is a synthetic derived-action artifact;
the runner does not execute it or claim an actual service was launched.

| Follow-up turn | Input tokens | Output tokens | Total |
| --- | ---: | ---: | ---: |
| Seed A | 259 | 29 | 288 |
| Seed B | 251 | 27 | 278 |
| Reopen A, derived action | 653 | 17 | 670 |
| Empty-history control | 310 | 4 | 314 |
| Total | 1473 | 77 | 1550 |

Seed PID `181524`, reopen PID `216428`; four distinct native Sessions each contain
one user message, one assistant message, and a `completed` turn. Server PID
`96800` was stopped by its owner and the launcher exited `0`. The fixture hash was
recomputed after execution and remained identical to its preregistered value.

Derived A context: 1155 bytes / two exact historical coordinates / SHA-256
`0a0d54d24f3b56c8bbee6de0d35aaf56dc92e15265704eaa2be6a02cbba90a7f`.
Empty control context: 446 bytes / zero sources / SHA-256
`c2ac26ce2458735e44cdcb0f6947c9186d1a995146126eae45075fabd573816b`.

Across both real runs: **7 completion requests, 2583 input tokens, 167 output
tokens, 2750 total tokens; zero retries and no post-result prompt changes.** These
two narrow fixtures demonstrate persisted-evidence recovery and one deterministic
derived next-action format, not general planning or production reliability.

## Repeatable commands

Run from the feature worktree after its normal frozen dependency install and
build. Every `--out` directory must be new; existing evidence is never reused.

```powershell
node --test scripts/phase-0.9.18/fixture.node-test.mjs
node --test scripts/phase-0.9.18/derived-fixture.node-test.mjs
node scripts/phase-0.9.18/run.mjs --mode walkthrough --out E:/codex-prj/ACMI/verification/phase-0.9.18/walkthrough-02
node scripts/phase-0.9.18/run.mjs --mode fake --out E:/codex-prj/ACMI/verification/phase-0.9.18/fake-new
pwsh -NoProfile -File scripts/phase-0.9.18/run-local.ps1 -Out E:/codex-prj/ACMI/verification/phase-0.9.18/real-new
node scripts/phase-0.9.18/run.mjs --mode fake --gate derived --out E:/codex-prj/ACMI/verification/phase-0.9.18/derived-fake-new
pwsh -NoProfile -File scripts/phase-0.9.18/run-local.ps1 -Gate derived -Out E:/codex-prj/ACMI/verification/phase-0.9.18/derived-real-new
```

Each local launcher command starts its own hidden server on `127.0.0.1:19118`,
records its PID, checks readiness and listener ownership, executes three calls
(retrieval) or four calls (derived plus control), and stops only that process in
`finally`. Limits are eight maximum calls, 512 output tokens per
call, 120 seconds per request, no retries, and no external API cost. The server
uses an 8192-token context, 27 GPU layers, one slot, seed 91801, reasoning off,
offline mode, no Web UI, and no prompt/idle-slot caching. Request-level prompt
caching is disabled by the transport as well.

## Pinned local artifacts

Both hashes below were recomputed from existing files on 2026-11-14 before any
new model execution. The launcher recomputes them again and fails on mismatch.

| Artifact | Bytes / SHA-256 |
| --- | --- |
| `E:/codex-prj/ACMI/acmi-098-local-runtime/llama/llama-server.exe` | `f9c45c8880180d6e6dd9f2e6077b5e4cabb8af6ae5e013d710712543cdc3cdc5` |
| `E:/codex-prj/ACMI/acmi-099-local-runtime/Qwen3-14B-Q4_K_M.gguf` | 9001752960 bytes; `500a8806e85ee9c83f3ae08420295592451379b4f8cf2d0f41c15dffeb6b81f0` |

The executable's own help confirms all launcher flags. This is local experimental
evidence, not model reliability, production qualification, migration, backup
restoration, or arbitrary tool-execution qualification.
