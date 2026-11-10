# ADR 0002: Keep incremental understanding outside the graph write authority

**Status:** Accepted for the isolated Phase 0.9 experiment.

A direct model-to-graph adapter is rejected: replay, Workspace identity, acceptance semantics and append order belong to the Host. A separate proposal database is rejected for this milestone because it would require a cross-database recovery protocol. Reuse the existing exclusive SQLite writer and transaction; store proposals and terminal receipts separately from graph envelopes. Only the trusted Host can move a proposed batch into the append-only stream, after scope, evidence, revisions and reducer validation. The model boundary is a frozen projected packet plus closed JSON Schema; no authority object crosses it.

The cost is local-only operation and conservative stale/expiry handling. This ADR does not permit automatic Binding, direct model writes, a production Provider or runtime history changes.
