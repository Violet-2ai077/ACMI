# Changelog

Dependency security baseline: Vitest 4.1.12 and Zod 4.6.6; older transitive
Zod is overridden in the workspace. No installed dsh dependency was changed.

## Unreleased - Phase 0.9.18 explicit local model continuation

- Add opt-in Host model turns with fresh-Session isolation, bounded registered
  historical text and authorization checks before reads, dispatch and acceptance.
- Add a separate confirmed local-model console and text-only loopback transport
  using the pinned native dsh Agent Loop. The provider-free console is unchanged.
- Add subprocess continuation fixtures, native Journal audits and a pinned
  private local-model launcher. Deterministic model-path tests run in `pnpm check`.
- This is an isolated test-data experiment, not production recovery, a new
  runtime adapter, storage migration, backup qualification, or a release.

## Unreleased - Phase 0.9.17 explicit continuation

- Add paired dedicated Journal/Graph roots and exclusive writer ownership,
  persisted Session registration, scoped Task pages and independent receipt reads.
- Add a serialized Host with expiring, one-use confirmations, registered-source
  recovery, authorization checks across asynchronous reads and safe shutdown.
- Add an isolated provider-free task console: explicit create/bind/leave,
  fresh-Session continuation of the same UUID, synthetic samples and bounded
  history. No automatic routing or real-model context recovery is enabled.
- Document a stable main checkout and separate feature worktrees. This is not
  a release; platform qualification remains recorded in the progress checkpoint.

## Unreleased - Experiment history through Phase 0.9.16

- Preserve the [experiment record](docs/experiments/README.md), including
  local-model evidence and deterministic replays. This is not a new release.
- Phases 0.9.11-0.9.13: recover native text and tool propagation in isolation,
  then test role-aware output and literal evidence. None qualified model routing.
- Phases 0.9.14-0.9.16: verify request-scoped WorkAnchor and test relative
  proposals and unresolved references. Explicit continuation improved, but the
  model gates did not pass. No new default behavior.

## Phase 0.9.10 experiment

- Run the frozen same-completion attribution Pilot with the pinned local
  Qwen3-14B and stock isolated dsh. Raw envelopes were emitted; none passed
  Host validation. Paired evaluation was not started. No production wiring.

## Phase 0.9.9 local milestone

- Verify default-off, read-only identity advice through a stock isolated dsh
  Agent Loop and a real local model. Native integration passed; cross-session
  semantic coverage did not qualify. No production automatic routing.

## Phase 0.9.8 local milestone

- Run the frozen identity benchmark once with a pinned local Qwen3 model.
  The evaluated configuration did not meet the response contract or beat the
  rule baseline. No cloud calls or production changes.

## Phase 0.9.7 local milestone

- Freeze matched identity evaluation inputs, local rule baseline, bounded
  response validation and offline replay. Real model runs remain disabled.

## Phase 0.9.6 local milestone

- Add an offline paired experiment separating authorized antecedent evidence
  from deterministic resolver behavior. No production-path changes.

## Phase 0.9.5 local milestone

- Add a default-off, read-only task reference advice API and deterministic
  counterfactual identity tests. No runtime wiring, real models, or write permissions.

## Phase 0.9.4 local milestone

- Add a new open synthetic corpus, local A/B reviewer and adjudication workflow,
  and offline identity/retrieval/intent diagnostics. No production behavior
  change; independent blind qualification, human review and real models remain blocked.

## Phase 0.9.3 local milestone

- Add a bounded, revisioned Understanding Context, scoped identity resolution,
  historical hints, and evidence-grounded review drafts.
- Add a default-off dsh Shadow path, an open synthetic comparison, and human
  review preparation. No graph apply, auto binding, or real Provider calls.

## Phase 0.9.2 local milestone

- Analyze archived Task Understanding failures without rescoring the consumed
  Holdout; add offline architecture prototypes, benchmark and review designs,
  and the Phase 0.9.3 research-to-implementation plan.
- No production code, provider, or persistence changes.

## Phase 0.9.1 local milestone

- Add provisional natural-language qualification, reserved holdout and offline
  double-annotation tooling.
- Add protected Decision/Result/Dependency evidence, bounded candidates, and
  an offline evaluator plus isolated stock dsh Shadow.
- Add trusted explicit Task create, select, bind and unbind with append-only
  revisioned receipts; no automatic lifecycle changes.

## Phase 0.9 local milestone

- Add scoped incremental intent, WorkNode, dependency, Join, decision,
  constraint and result proposals with bounded synthetic model input.
- Add a durable proposal inbox and Host-only transactional review and apply.
- Add a default-off dsh delta analysis worker and a 350-case offline benchmark.

## Phase 0.8.2 local milestone

- Add a default-off Host ingestion supervisor, bounded cursor reconciliation
  and explicit offline recovery of known Sessions.
- Preserve native Subagent catalog, descriptor and turn evidence without
  inferring Scheduler settlement, acceptance, waiting, or join.
- Add a metadata-only snapshot ledger and public LLM request quarantine in
  the isolated Host; no Journal erasure or replacement of Compact.

## Phase 0.8.1 local milestone

- Added strict runtime fact normalization and scoped dsh append observation.
- Persisted append-only graph streams, source cursors and host review receipts
  in an isolated SQLite adapter with checkpoint and crash recovery.
- Added proposal-only Task Understanding and a default-off persistent dsh
  context experiment. No native Compact replacement or retroactive erasure.

## Phase 0.8 (local)

- Added scoped Task Graph projection, execution/attempt state, result review,
  explicit joins, and checkpoint plus suffix replay.
- Added a deterministic, budgeted, provenance-bearing Task Context Package
  and a provider-free recovery benchmark.
- Qualified opt-in dynamic dsh prompt context in a synthetic profile only.
  Default Compact, Observer and explicit Binding paths are unchanged.

## 0.1.0-alpha.1 (release candidate)

- Split the runtime-neutral Core and Contracts from dsh-specific integration.
- Added SDK capability negotiation, fixture conformance checks, and a custom
  adapter example that demonstrates honest partial support.
- Added a deterministic Synthetic Demo and read-only Observer companion.
- Targeted dsh `0.2.2-rc.1` for explicit binding, normalized events, and scoped
  history without patching upstream dsh.

Known limitations: automatic persistent Binding is disabled; the dsh scoped
reader assumes a trusted local host and an isolated single-Workspace root; no
legacy store migration, native dsh-context tab, or multi-tenant guarantees.
See [the Alpha release notes](docs/releases/v0.1.0-alpha.1.md).
