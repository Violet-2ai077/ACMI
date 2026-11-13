# Explicit model continuation: three-stage implementation plan

> Execute task-by-task with test-first boundary checks. User approved the direction
> and autonomous execution on 2026-11-14. Implementation workers may own isolated
> files; self-checks are not an independent review. No new review authorization is
> assumed from the previous milestone's one-time review.

**Goal:** Prove that an explicitly selected persistent task can supply bounded,
authorized historical text to a fresh dsh model request, then deliver an operable
experimental entry point and reproducible evidence.

**Architecture:** Extend the existing serialized continuation Host with an opt-in
model request capability. Keep synthetic test-data gating and default console
behavior unchanged. Build context from exact registered Journal coordinates already
assigned to the selected task; never discover arbitrary histories. Runtime performs
one text-only local model turn in a fresh Session; it receives a synchronous
authorization check to invoke immediately before network dispatch. No tools, cloud
credentials, automatic binding, dynamic persistent prompt cache, or migrations.

**Tech stack:** Existing Node 24.16.0 / pnpm 11.28.5 / TypeScript / pinned dsh
0.2.2-rc.1, existing local Qwen GGUF and llama.cpp. No new package dependencies.

**Completed:** 2026-11-14. All three stages below are implemented and verified
within their experimental scope. See the [design and trust boundaries](../specs/2026-11-14-model-continuation-design.md)
and [result report](../../verification/2026-11-14-model-continuation.md).
Implementation and self-checks are not a new independent review; the prior
milestone's one-time authorization was not reused. The feature branch is retained
without merging, pushing or releasing.

## Stage 1: stable baseline and executable walkthrough

- [x] Correct current checkpoint/workspace instructions after the 0.9.17 merge;
  preserve historical experiment facts. Record baseline `6efc0c4` and its green CI.
- [x] Install frozen offline dependencies in `worktrees/explicit-model-continuation`
  on `codex/explicit-model-continuation`; run `pnpm check` before implementation.
- [x] Run a repeatable isolated create / bind / sample / close / reopen / rebind
  walkthrough, assert same Task UUID and different Session, and retain evidence.

## Stage 2: minimal real model continuation

- [x] Add Host contracts `modelEnabled?: true`, optional runtime
  `runModel(session, { prompt, context, authorize }, signal)`, and
  `host.modelTurn(prompt, { maxContextBytes? }, signal)`. Default capability absent.
  Reject unbound, reused/nonempty Session, invalid input, incomplete recovery,
  unauthorized and over-budget requests before any model execution.
- [x] Add `continuation-context.ts`: at most 64 assigned facts, exact registration
  and incarnation checks before/after each async read, deterministic JSON text,
  objective/criteria plus plain user/assistant/tool-result evidence and coordinates.
  Bound serialized UTF-8 bytes (default 16 KiB, maximum 32 KiB); refuse overflow,
  never silently claim complete history. Report bounded-window policy explicitly.
- [x] Test red then green: default disabled, unbound, A/B isolation, fresh Session,
  process reopen, read/write/operator revocation, cancellation, budget exhaustion,
  missing Journal, and callback authorization invalidation. Existing causal result
  tests remain required. Run source and built integration suites.
- [x] Implement separate `model-runtime.mjs` and loopback-only text completion
  transport. Reject non-loopback URLs, redirects, tools, empty/truncated responses,
  invalid usage, excess response bytes, timeouts; no retries. Native dsh Agent Loop
  records the real prompt/answer. No original console behavior changes by default.
- [x] Add subprocess runner and frozen synthetic A/B fixture. Seed task A and
  distractor B, exit, reopen in a new process, explicitly bind A, ask for the next
  step without repeating its historical facts. Test through fake transport first.
- [x] Reuse pinned local model files without altering prior evidence/services.
  Launch a private loopback server, at most 8 requests / 512 output tokens per
  request / 120 seconds each; no paid API. Record exact requests, hashes, native
  completion, usage and answer assertions. Stop only owned process afterward.
  A failed semantic assertion remains a failed gate, not a reason to tune answers.
  Historical-value recovery passed first. A separately frozen derived-action
  follow-up and empty-history control also passed; seven real requests total,
  no retries. The first answer remains classified as retrieval, not an action.

## Stage 3: usability and delivery readiness (selected expansion)

- [x] Deliver a separate explicit model-console entry point with task listing,
  preview/confirmation reuse, endpoint disclosure and one-turn isolation. Improve
  actionable failure messages and keep raw secrets/content out of generic errors.
- [x] Write operator guide: install, dedicated roots, start local endpoint, create,
  select, ask, reopen, history, receipts, interrupted-turn handling. Backups only
  while stopped; never repair/delete stores automatically. Document no migration,
  no arbitrary tools, no production qualification or new runtime support.
- [x] Run full Windows verification, built integration, offline suites, repeat CLI
  tests and Ubuntu WSL verification in an independent clone where practical.
- [x] Publish a result matrix separating deterministic, native integration and real
  semantic evidence. Commit coherent changes on feature branch; preserve main and
  all historical worktrees. Do not infer a new release or push approval from the
  prior milestone. List any unpassed gates honestly.

## Deferred alternatives

Automatic task inference remains research-only. A new Codex/Claude adapter adds
runtime uncertainty before validating the existing dsh path, so it is deferred.
General backup/restore and migration require their own storage protocol; this
iteration supplies operational limits, not an untested migration promise.
