# Phase 0.9.2: Failure-driven offline prototype comparison

**Decision:** Carry scoped staged resolution plus revision-aware local state into Phase 0.9.3 as a shadow-mode research hypothesis. Keep an ungated comparator. Do not promote the lexical trigger to a hard production gate: it saved some analysis work but missed semantically important turns in both evaluated splits.

## Comparison contract

| Configuration | Deterministic path | What it tests | Known trade-off |
|---|---|---|---|
| `flat-reference` | Current turn, current snapshot, lexical ranking, single decision, common guard | A simple current-turn comparator. This is **not** the actual Phase 0.9.1 classifier or a rerun of any historical corpus. | Tie resolves by input order; wrong scoped/stale IDs may reach the proposal stage before the guard. No cursor or recent-task state. |
| `hierarchical` | Turn act -> work intent -> bounded scoped ranking -> resolution or abstention -> proposal -> common guard | Separates task relevance, identity uncertainty, unavailable IDs, and proposal validity. | Stage logs and abstention make failures diagnosable but cannot recover a missing candidate or interpret contrastive wording. |
| `event-state-hybrid` | Reconcile cursor/revisions -> gated staged path -> bounded recent identities -> common guard | Composes event-triggering, incremental understanding and abstention-first ranking. | Extra state work, recovery complexity, and missed trigger positives. Recent selections are hypotheses, not accepted bindings. |

`ablate-no-trigger` leaves cursor, memory and runtime facts unchanged and invokes stages on every non-replay event. `ablate-no-memory` keeps the trigger and cursor state but removes recent identity pointers. `ablate-no-runtime-facts` retains the lexical trigger, cursor and memory but removes typed fact input from the analysis path. They are one-switch comparisons with the hybrid, not extra independently designed architectures.

## Input and authority

- Observations carry turn text/role, Workspace, Session, journal epoch, source cursor, Graph revision, policy version, current Host binding and a bounded candidate snapshot. Candidate rows carry objective, status, WorkNode, source cursor and summary revision. Candidate ranking reads at most 6 rows; text is clipped to 640 UTF-16 units and at most 8 typed facts are inspected. Candidate eligibility requires same Workspace, present revision and recent `snapshot` provenance. A referenced ID outside that window is unavailable, not new.
- Typed `subagent_result`, `task_conflict` and `binding_changed` facts can trigger analysis when supplied by the fixture Host at the current cursor and in scope. Assistant text, quoted requests and tool text alone do not authorize proposals. The adapter is assumed trusted; this prototype does not authenticate provenance or test an external integration.
- Stateful variants keep a separate bounded recent list per Workspace/Session, with no cross-Session leakage. The recorded binding remains the Host observation; a successful inference only updates recent identity hypotheses. A changed candidate revision removes its anchor. An epoch change, gap, Graph rewind or policy change clears recent anchors; equal/older cursor events never emit a new decision, and a same-cursor collision clears anchors and requires reconciliation. The fingerprint covers the bounded observation projection; this is not durable journal validation.
- Resolution, Work Intent and lifecycle proposal are separate. For example, changing the objective of the current Task returns `continue + amend_objective`; switching returns `switch + suggest_switch`. Explicit reopen is a proposal, not a status change. Typed result/conflict review produces no binding or result-acceptance proposal. `no_task` is distinct from `uncertain`; a skipped positive can still be misclassified as `no_task` and is counted as an error.
- The common guard only checks available provenance, role, scope, supported proposal type and revision/status. Its strongest disposition is `host_review_only`; all dispositions record `executed: false`. A well-formed wrong proposal can pass. No Graph Store, Task binding, result acceptance, Join, lifecycle or Session Journal mutation is wired.

## Answers to prototype questions

| Research question | Observed evidence and inference boundary |
|---|---|
| Does staging help diagnose failure? | **Prototype-measured:** Development traces distinguish a foreign candidate, stale revision, requested ID outside the supplied window and a lexical tie. Staging reduces wrong ID decisions from 4 to 1 on development; validation from 4 to 3. Because the hierarchical treatment also adds scoped retrieval and tie abstention, this is not a causal estimate of pipeline decomposition by itself. |
| Can candidate retrieval failure be found early? | **Prototype-measured:** All 3 unavailable-target development turns abstain in both staged paths versus 1/3 in the reference; validation has no labelled unavailable-target denominator. Candidate checks precede ID commitment, not the local intent classifier. An absent true ID is identifiable only for an explicit ID, known stale/foreign candidate or insufficient evidence; bounded lexical retrieval is not a complete diagnosis of semantic candidate recall. |
| Do we need recent state for A/B/A? | **Prototype-measured:** A/B/A in `dev-water` resolves through the recent list, and fails on the otherwise equivalent no-memory ablation. With missing, stale or cross-Session anchors, the staged path abstains. **Engineering judgment:** keep derived local anchors and explicit invalidation, but do not use them as binding or treat a single A/B/A fixture as prevalence. |
| Is a cross-Session memory summary required? | **Prototype-measured:** A fresh candidate summary supports an explicit ID in `val-sessions`, while an ungrounded previous-task pointer in the new Session abstains. This is not evidence for implicit cross-Session identity; a future experiment needs an authorized, provenance-linked Task Memory adapter and hard scope checks. |
| Is this context sufficient for continue/resume? | **Prototype-measured:** Fresh binding, direct Task ID and objective terms suffice for some examples. Lost candidate windows, closed status, same-noun collisions and weak trigger phrasing remain distinct failures. No unrestricted historical context, durable recovery or multi-lingual understanding was evaluated. |
| When should analysis skip, or abstain? | **Prototype-measured:** Current typed events restore one true trigger in each split. The lexical gate still misses 1/16 development and 3/17 validation positive turns; those misses are not free abstentions. Cursor replay can skip, untrusted/non-task noise can skip in shadow mode, and unknown scope, freshness, ties or unresolved reference should abstain before ID commitment. |
| Can the guard substitute for pragmatic intent? | **Prototype-measured:** No. It blocks two structurally unsafe reference proposals, but accepts one semantically wrong hybrid proposal for Host review in each split. In particular, it does not understand negation. Rejection never repairs the upstream decision, and no proposal executes. |

## Reproducibility and dataset boundary

```powershell
node --test scripts/phase-0.9.2/prototype.node-test.mjs
node scripts/phase-0.9.2/prototype.mjs <output-directory>
```

The evaluator receives observed events only; labels are consulted afterward. `scenarios.json` exports the 8 newly constructed evaluated scenarios and explicitly AI-provisional expectations; `results.json` records its SHA-256, denominators, deterministic work counts, timings and per-turn stage traces. `comparison.md` and `limitations.md` summarize the run. Development and validation scenario families use independently written storylines and task IDs across splits rather than template rewrites; both are authored research exercises, not independently adjudicated blind gold. No Phase 0.9.1 dataset or frozen/reserved holdout is read by this evaluator. The Phase 0.9.2 reserved benchmark is a separate Workstream F artifact and not an input option. No Provider calls were made.

See [measured results](../experiments/phase-0.9.2-prototype-results.md) for split metrics, ablations and examples.
