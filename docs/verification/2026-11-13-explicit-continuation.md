# Phase 0.9.17 implementation verification

Date: 2026-11-13, Asia/Shanghai.
Functional commit: `311709b297af48d95f832c9b91f05a1439dd41bd`.
Base: `2032c96e7714669332279ec93ae51c0cdc0b268a`.

**Disposition:** implementation and independent code review passed; Windows
clean-clone validation passed. Ubuntu acceptance is still unverified. This is
not a release, production qualification, or real-model context recovery.
The feature remains on `acmi/phase-0.9.17`; main was not advanced.

## Delivered flow

The provider-free [task console](../../examples/task-console/README.md) uses
dedicated paired Journal/Graph roots, freshly granted scopes, persisted Session
registration and the existing Host lifecycle. A confirmed Task keeps its UUID
when the operator explicitly binds it in a fresh Session after process restart.
Creating a Task does not bind it. Reopening does not replay a prior command or
inherit prior confirmation authority. Historical receipts are independently
authorized reads, and native sample content is fixed and synthetic.

## Fresh Windows clean-clone evidence

Node `v24.16.0`, pnpm `11.28.5`. Independent `git clone --no-local` at
`E:/codex-prj/ACMI/verification/phase-0.9.17/windows-clean`, updated by a
fast-forward to the exact functional commit before these final checks.
No ignored review artifacts or feature-worktree build products were copied.

| Check | Actual result |
| --- | --- |
| `pnpm install --offline --frozen-lockfile` | Passed; 11 workspace projects; no dependency upgrade. |
| `pnpm check` | Passed: 43 files, **268/268** tests; source checks, TypeScript workspace builds and all three existing demos passed. |
| `ACMI_TEST_BUILT=1 pnpm exec vitest run integrations/dsh/tests` | Passed: 21 files, **146/146** tests. |
| `node --test` over every `scripts/**/*.node-test.mjs` | **88/88** passed, zero skipped. |
| CLI acceptance file, three separate runs | **11/11**, **11/11**, **11/11**; 8 subprocess cases and 3 input-framing cases per run. |

Source, Built and CLI suites overlap; their totals are not independent cases
to be added together. An earlier feature-worktree run auto-discovered one
ignored reviewer probe (44 files/261 tests before the final fixes); it is not
the formal count. That probe was preserved under a non-test filename, and the
numbers above come from the clean clone's tracked tests only.

The subprocess cases cover operator confirmation, same-title tasks with distinct
UUIDs, new-process/new-Session continuation, bounded receipt paging, cancellation
and EOF, escaped terminal data, an orphan checkpoint before registration,
receipt commit before display, missing registered sources, and timeout with
writer ownership retained. The main continuity fixture requires six explicit
confirmations; it does not use an automatic approval switch. Input regressions
also cover fragmented commands and confirmations, split CRLF, stale buffered
answers, incomplete EOF, cancellation on an open stream and input errors.

Implementation-stage timing sample: initial startup 121 ms, reopen 207 ms,
2 registered sources reconciled, 0 newly recovered events and 0 pending events.
This is one local descriptive sample, not a latency guarantee. Final repeated
acceptance runs took approximately 24 seconds each, including the deliberate
10-second shutdown fault.

Local raw logs are kept outside product source under
`E:/codex-prj/ACMI/verification/phase-0.9.17/`:

- `windows-final-check.log`
- `windows-final-built.log`
- `windows-final-offline.log`
- `windows-final-cli-1.log`, `windows-final-cli-2.log`, `windows-final-cli-3.log`

## Independent review and corrections

The Host task was reviewed separately before CLI composition. Its asynchronous
live-ingestion authorization gap was reproduced with a failing test and fixed
in `88134d7`: revocation/detachment after flush or inspect cannot start the next
protected source access.

The user subsequently authorized one combined CLI/whole-branch independent
review. It found two further P2 issues at `8dd63ca`:

1. A partial stdin chunk could be mistaken for EOF before a complete line.
2. Session registration revalidated authority after the entire checkpoint, but
   not between its asynchronous Journal open, inspect and body-read operations.

Both were reproduced with failing formal tests and fixed in `311709b`.
The same reviewer performed a scoped correction review: both findings closed,
zero remaining blocking code findings. Input waiting retains the original
confirmation freshness cutoff; checkpoint validation now invokes the current
writer/live-identity/sequence guard at entry and after each await, retaining
the final transactional guard. No second authority or Binding ledger was added.

## Ubuntu and CI limits

Ubuntu 24.04 WSL was available. A separate Node 24.16.0 Linux distribution was
checked against the official SHA-256 manifest; the system Node was not replaced.
An independent no-local clone and pinned pnpm 11.28.5 were prepared under
`/var/tmp/acmi-phase0917-verify.2J7SB3`.

Frozen installation failed on registry connection timeouts. Explicit registry
selection, lower concurrency and IPv4-first settings did not resolve it.
An offline attempt reused 127 packages but lacked Linux-specific optional
packages and supply-chain metadata. Dependency policies were not disabled and
the lockfile was not modified to bypass the failure. No Ubuntu application test
success is claimed; the final functional commit still needs Ubuntu validation.

No feature-branch CI was triggered or observed. Historical main CI is not
substituted for this branch. Keep the final cross-platform item in the
[implementation plan](../superpowers/specs/2026-11-13-explicit-continuation-plan.md)
open until this gate is actually run.

## Reproduce on Windows

From a clean checkout of the functional commit:

```powershell
pnpm install --offline --frozen-lockfile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$env:ACMI_TEST_BUILT = '1'
try { pnpm exec vitest run integrations/dsh/tests }
finally { Remove-Item Env:ACMI_TEST_BUILT -ErrorAction SilentlyContinue }
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$files = @(Get-ChildItem -LiteralPath scripts -Recurse -File -Filter '*.node-test.mjs' | ForEach-Object FullName)
node --test @files
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
foreach ($round in 1..3) {
  pnpm exec vitest run examples/task-console/tests/continuation.test.mjs
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

If the frozen dependency cache is absent, use a normal frozen install with
authorized network access. Tests create new isolated roots; do not substitute
an existing dsh profile, user Journal or real Provider.
