# Roadmap

## In the Alpha candidate

- Platform-neutral Task identity, explicit Session Binding, causal event
  attribution, unresolved events, and read-only cross-session Task history.
- Synthetic Demo and read-only Observer timeline.
- First official dsh integration targeting `0.2.2-rc.1`; compatibility and
  configuration limits are recorded in the [integration guide](integrations/dsh/README.md).
- SDK, conformance fixtures, and a partial adapter example.

## Conditional or experimental

- Phase 0.9.1: offline natural-language qualification, bounded candidate
  retrieval, protected evidence, explicit Host lifecycle and stock dsh Shadow.
  Independent human and real Provider evaluation remain pending.
  See the [Phase 0.9.1 report](docs/experiments/phase-0.9.1-final-report.md).
- Phase 0.9: synthetic-only incremental intent and work-structure proposals,
  bounded opt-in dsh analysis, and explicit trusted Host atomic review.
  See the [Phase 0.9 report](docs/experiments/phase-0.9-final-report.md).
- Phase 0.8.2: default-off Host supervisor and bounded reconciliation,
  native Subagent evidence, and guarded retirement on stock dsh. See the
  [Phase 0.8.2 report](docs/experiments/phase-0.8.2-final-report.md).
- Phase 0.8.1: explicitly scoped dsh fact ingestion, local persistent Graph
  Event Store, Host-reviewed semantic proposals, and fresh-Session recovery.
  Dynamic recovery remains synthetic-only: native history may retain an old
  snapshot even after revocation. See the [report](docs/experiments/phase-0.8.1-final-report.md).
- Phase 0.8: scoped Task Graph, deterministic budgeted Context Packages and
  provider-free cross-Session recovery. Stock dsh dynamic context is qualified
  only in an opt-in synthetic experiment; the default Compact backend is not
  replaced. See the [Phase 0.8 report](docs/experiments/phase-0.8-final-report.md).
- dsh v4 Zstandard reading and Storage Root v2: trusted local host and isolated
  single-Workspace Storage Root only; no migration from legacy stores.
- Heuristic Task attribution: prior offline benchmark research only, not a
  production feature or permission to persist Binding automatically.

## Planned, not implemented

- Evaluate additional runtimes, including Claude Code and Codex, as official or
  community adapters. Each runtime must pass relevant conformance checks before
  support is claimed.
- Qualify multi-process ingestion, backup/restore, and provider-independent
  request isolation before deploying recovery. Design Project/Knowledge Memory
  separately from Task Memory; no global Memory Engine is promised.
- Evaluate more storage formats, migration strategies, and compatibility with
  newer dsh versions after validating the first pinned baseline.

## Not supported

Automatic persistent Binding, a native dsh-context tab, production multi-tenant
hosting, and Windows hostile-filesystem race guarantees are not supported.
