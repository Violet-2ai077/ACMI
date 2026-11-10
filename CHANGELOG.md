# Changelog

Dependency security baseline: Vitest 4.1.12 and Zod 4.6.6; older transitive
Zod is overridden in the workspace. No installed dsh dependency was changed.

## Unreleased - Phase 0.8.2

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
