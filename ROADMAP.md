# Roadmap

## In the Alpha candidate

- Platform-neutral Task identity, explicit Session Binding, causal event
  attribution, unresolved events, and read-only cross-session Task history.
- Synthetic Demo and read-only Observer timeline.
- First official dsh integration targeting `0.2.2-rc.1`; compatibility and
  configuration limits are recorded in the [integration guide](integrations/dsh/README.md).
- SDK, conformance fixtures, and a partial adapter example.

## Conditional or experimental

- Phases 0.9.15 and 0.9.16: relative proposals improved two explicit new-goal
  cases, but neither the new contract nor the follow-up unresolved reference
  passed the model gate. Keep WorkAnchor and the sidecar experimental; do not
  promote automatic routing or production streaming. See the
  [experiment record](docs/experiments/README.md).

- Phase 0.9.14: request-scoped work anchors improved explicit continuation
  without authorizing tool execution. The model identity gate still did
  not pass. See the [Phase 0.9.14 report](docs/experiments/phase-0.9.14-work-anchor-report.md).

- Phase 0.9.13: verified literal mention evidence and omission of binding
  did not improve same-generation user attribution in the frozen triples.
  See the [Phase 0.9.13 report](docs/experiments/phase-0.9.13-evidence-triples-report.md).

- Phase 0.9.12: paired role-aware attribution improved independent intent
  and secondary-task observability but missed the primary identity gate.
  See the [Phase 0.9.12 report](docs/experiments/phase-0.9.12-role-paired-report.md).

- Phase 0.9.11: scoped assignment refs and independent answer validation
  preserved the native answer and tool paths. The frozen semantic gate did
  not pass. See the [Phase 0.9.11 report](docs/experiments/phase-0.9.11-assignment-pilot-report.md).

- Phase 0.9.10: same-completion answer and attribution fields were observed
  with the pinned local model. No envelope passed the native delivery gate;
  paired evaluation stayed gated and the tested configuration is NO-GO.
  See the [Phase 0.9.10 report](docs/experiments/phase-0.9.10-final-report.md).

- Phase 0.9.9: real local model through the stock isolated dsh Agent Loop.
  Native read-only integration passed; the cross-session semantic gate failed.
  See the [Phase 0.9.9 report](docs/experiments/phase-0.9.9-final-report.md).

- Phase 0.9.8: first real on-device evaluation. The tested configuration
  did not qualify; see the [Phase 0.9.8 report](docs/experiments/phase-0.9.8-final-report.md).

- Phase 0.9.7: matched rule/model evaluation contract and offline response
  replay. No real model calls or production qualification; see the
  [Phase 0.9.7 report](docs/experiments/phase-0.9.7-final-report.md).

- Phase 0.9.6: compare the effect of one authorized preceding user turn at
  fixed candidates and compare resolvers at fixed evidence. Offline only;
  see the [Phase 0.9.6 report](docs/experiments/phase-0.9.6-final-report.md).

- Phase 0.9.5: paired synthetic trace tests and a default-off, read-only Task
  Reference Advice API. This is not general intent understanding or approval
  for automatic routing. See the [Phase 0.9.5 report](docs/experiments/phase-0.9.5-final-report.md).

- Phase 0.9.4: open synthetic qualification corpus, blinded annotation
  rehearsal, and separate retrieval/identity/intent diagnostics. Production
  automatic routing is NO-GO. See the [qualification decision](docs/qualification/phase-0.9.4-qualification-decision.md).

- Phase 0.9.3: bounded layered understanding, read-only dsh Shadow and offline
  architecture comparison. Human review, independent qualification Holdout
  and real Provider evaluation remain blocked; no production automation.
  See the [Phase 0.9.3 report](docs/experiments/phase-0.9.3-final-report.md).

- Phase 0.9.2: archival failure forensics, layered understanding contracts,
  and new offline architecture controls. No production behavior change.
  See the [research report](docs/experiments/phase-0.9.2-final-report.md) and
  [proposed Phase 0.9.3 gates](docs/roadmap/phase-0.9.3-implementation-plan.md).

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
