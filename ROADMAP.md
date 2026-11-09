# Roadmap

## In the Alpha candidate

- Platform-neutral Task identity, explicit Session Binding, causal event
  attribution, unresolved events, and read-only cross-session Task history.
- Synthetic Demo and read-only Observer timeline.
- First official dsh integration targeting `0.2.2-rc.1`; compatibility and
  configuration limits are recorded in the [integration guide](integrations/dsh/README.md).
- SDK, conformance fixtures, and a partial adapter example.

## Conditional or experimental

- dsh v4 Zstandard reading and Storage Root v2: trusted local host and isolated
  single-Workspace Storage Root only; no migration from legacy stores.
- Heuristic Task attribution: prior offline benchmark research only, not a
  production feature or permission to persist Binding automatically.

## Planned, not implemented

- Evaluate additional runtimes, including Claude Code and Codex, as official or
  community adapters. Each runtime must pass relevant conformance checks before
  support is claimed.
- Design a long-term Memory Engine and controlled context injection separately
  from task continuity. Neither is promised by this Alpha.
- Evaluate more storage formats, migration strategies, and compatibility with
  newer dsh versions after validating the first pinned baseline.

## Not supported

Automatic persistent Binding, a native dsh-context tab, production multi-tenant
hosting, and Windows hostile-filesystem race guarantees are not supported.
