# Explicit Continuation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a provider-free local console that explicitly binds the same Task UUID in a fresh dsh Session after restart and reads independently authorized history.

**Architecture:** Keep the Host lifecycle and SQLite graph as the authority; the example console supplies operator confirmation and an allowlisted stock dsh composition. Roots are immutable pairs and both remain exclusively held while the console writes.

**Tech Stack:** Node 24.16, TypeScript, SQLite, Vitest, pnpm, pinned stock dsh.

---

Approved scope: [explicit continuation design](2026-11-13-explicit-continuation-design.md). Work in `acmi/phase-0.9.17`, not `main`; don't push or publish. Start with the isolation batch; the following batches depend on its verified API.

Handoff after Chunk 2: [progress checkpoint and resume steps](../../runbooks/phase-0.9.17-progress-checkpoint.md).

## Chunk 1: Dedicated roots and writer ownership

**Files:** `integrations/dsh/src/continuation-layout.ts`, `continuation-lock.ts`, `graph-store-db.ts`, `storage-isolation.ts`, `index.ts`; test `integrations/dsh/tests/continuation-roots.test.mjs`.

**Contract:** `provisionContinuationRoots({ workspaceRoot, journalRoot, graphRoot, compression })` provisions only canonical existing empty disjoint roots. The existing native markers remain unchanged. Persist identical versioned pair records with the Workspace ID and all roots/codec. `acquireContinuationRoots(config)` returns `{ workspaceId, close() }` only after verifying both markers, both copies and both SQLite leases. No fallback to standalone Journal or Graph when a pair is missing. The ordinary Journal reader still accepts unpaired roots and rejects unknown top-level entries; paired roots permit only the two documented regular sidecars with a matching local pair. Store and writer mount only after acquiring the returned lease.

- [x] Write tests first: both modes of Journal reader; split or changed pair; mismatched workspace/codec/roots; missing owner file; non-empty initialization preserving existing bytes; stock writer flush and exact Session inspection with sidecars; independent child owner contention, normal release and release after process termination.
- [x] `pnpm exec vitest run integrations/dsh/tests/continuation-roots.test.mjs` must fail for missing continuation APIs.
- [x] Add the pair serialization/checks in `continuation-layout.ts` without importing the writer or Store. Reuse graph marker validation independently of a writable DB in `graph-store-db.ts`. Validate all config before provisioning. Write pair and owner files with exclusive create, flush them, and never repair a partial setup implicitly.
- [x] In `storage-isolation.ts`, preserve strict inventory; when either continuation sidecar is present, validate both regular files, exact known layout schema, both pair records, and the native root/Workspace/encoding. Don't allow wildcards or arbitrary SQLite auxiliary files. A scoped proof rechecks the pair on subsequent reads.
- [x] `continuation-lock.ts`: verify before opening owner files; hold `BEGIN EXCLUSIVE` in DELETE journal mode, `timeout: 0`, in stable root order. Contention returns `busy`. After acquisition recheck the pair. Release only this instance's handles on failure and close; don't remove lock files. Ensure layout setup still refuses a partially initialized root.
- [x] Verify the batch on Windows: `pnpm check` passed 225/225 Source tests and all three demos; Built dsh passed 114/114. The six focused cases cover stock writer compatibility, strict standalone mode, invalid pairs, protected Workspace, and cross-process ownership/crash release for each root. Independent code review found no blockers; the protected Workspace regression was added red-to-green following review.

## Chunk 2: Scoped persistent catalog

**Files:** `continuation-catalog.ts`, `graph-store.ts`, `task-lifecycle.ts`, `index.ts`; test `integrations/dsh/tests/continuation-catalog.test.mjs`.

**Contract:** `GraphStoreOptions.continuation` carries the dedicated root configuration; `root` must match its Graph root. `registerContinuationSession(writer, ref, signal)` uses the configured native live-Session resolver and reads the exact configured Journal, requiring matching incarnation and durable next sequence plus renewed writer and live checks before transaction commit. An identical registration keeps its first receipt; reuse of a Session ID by another incarnation fails closed. `continuationSessions(reader)` lists at most 256 validated registrations; `continuationReceipts(reader, ref, after, limit)` is the independent read-only receipt page, with no live resolver call. `continuationTasks(reader, limit, cursor)` returns task summaries ordered by UUID plus a cursor containing Workspace, last UUID and revision of that ordered directory. Both page methods recheck current read authorization on every call.

- [x] Test durable reopen, exact native identity and sequence, registration retry, revoked permissions, corrupt or missing records, and stale Task pages. Old receipts remain readable without live Session resolution or a write grant.
- [x] Verify red before implementation and for both missing-record regressions.
- [x] Implement the opt-in 256-Session catalog, the 64-Task revision-scoped directory, independent history authorization, and native checkpoint validation before registration. Cross-check durable Session references and creation receipts against Graph records.
- [x] Verify 19/19 focused Source, 233/233 `pnpm check` Source and all demos, 122/122 full Built dsh on Windows. Independent review confirmed both missing-record regressions are closed.

## Chunk 3: Host confirmation and recovery

**Files:** `continuation-host.ts`, `runtime-ingestion.ts`, `index.ts`; test `integrations/dsh/tests/continuation-host.test.mjs`.

- [x] Test preview cancellation, timeout, forgery, scope/sequence/binding revision drift, no auto-binding on create, fresh Session confirmation, a flushed but unreconciled cut, and failures before registration and after receipt commit. Verify the exact registered identity gates live attach/drain, offline reconciliation and receipt reads. Exercise A/B/A and original-call attribution after a switch.
- [x] Run `pnpm exec vitest run integrations/dsh/tests/continuation-host.test.mjs` and verify red.
- [x] Implement a serialized controller with an opaque consumable preview scoped to one command, current Session, Task revision and Graph/native cursor. Delegate to existing lifecycle confirm/execute. Use bounded reconciliation of registered Sessions only, enter a read-only recovery-blocked state on any invalid source, and never reopen an old Session as live for receipt reads. Dispose the dsh writer/ingestion and Store before releasing leases. Keep `synthetic: true` enforced.
- [x] Rerun the focused test and persistent dsh regression in Source and Built modes. Verify zero failures and review the batch. Implementation `b4dc956`: Source 250/250, Built dsh 139/139. Review fix `88134d7`: Source/Built focused 41/41 each; independent re-review passed the async authorization boundaries.

## Chunk 4: CLI and final verification

**Files:** `examples/task-console/{package.json,run.mjs,console.mjs,dsh.mjs,README.md}`, `examples/task-console/tests/continuation.test.mjs`, workspace lockfile.

- [x] Run an isolated console subprocess against new roots and test explicit initialization/confirmation, EOF/cancel, separate create and bind, read-only history, scripted sample, graceful close, and new process/new Session restoring the same UUID without automatic binding. Include process termination before registration and after commit, recovery-blocked missing source, and bounded shutdown reporting; validate no network or Provider use.
- [x] `pnpm exec vitest run examples/task-console/tests/continuation.test.mjs` must fail before the CLI exists.
- [x] Compose the pinned dsh writer and testkit-backed scripted Session in the example. Separate commands and terminal escaping from dsh lifecycle. Display `identity_ready`, `history_ready` or `history_incomplete`, and `model_context_not_enabled` without exposing message contents. Update lockfile using pinned pnpm offline and document operation, limits, and errors.
- [x] Run frozen install, `pnpm check`, all Built dsh tests, all offline Node tests, and repeat cross-process acceptance three times. Report separately what was executed locally and whether current Windows/Ubuntu CI exists. Don't report real model history recovery or release qualification.

Implementation and combined independent code review are complete at `311709b`.
Windows and Ubuntu 24.04 WSL clean-clone checks passed: Source 268/268,
Built dsh 146/146, offline Node 88/88, and three CLI runs of 11/11 on each OS.
The initial Ubuntu install blocker was an unreachable effective proxy route;
process-scoped NO_PROXY resolved it without disabling dependency policies.
Local cross-platform acceptance is complete. Hosted CI is a separate result;
the user subsequently authorized main integration and push, not a release.
