# Changelog

Dependency security baseline: Vitest 4.1.12 and Zod 4.6.6; older transitive
Zod is overridden in the workspace. No installed dsh dependency was changed.

## Unreleased - Phase 0.9.2

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
