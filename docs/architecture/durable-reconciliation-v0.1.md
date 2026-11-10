# Durable reconciliation

Before any live fact commit, stock flush plus backend/path/header checks
establish the exact native writer. A gap falls back to one guarded v4 read
with limits inherited from the scoped reader (including 4096 rows). Validate
incarnation, inherited prefix boundary, source epoch and the last committed
normalized anchor. Only then stage the suffix as normalized metadata. The
aggregate cache holds at most 16384 suffix facts; it is not a raw Journal cache
and releases on completion, terminal failure, detach or stop.

The Store commits normalized fact, causal graph references and cursor together.
Cleanup uses the actual committed coordinate, not observed head. A repeated
event has no second fact; a different fact at the same coordinate is a conflict.
This is an idempotent transaction boundary, not an exactly-once transport.
An explicit exact reference permits a separate bounded read-only repair of an
offline Session. No historical search, no automatic repair of native files and
no inference when their cut cannot be proven. A trusted exclusive root is an
operational prerequisite, including for offline reconciliation.

SQLite schema v1 is extended additively under the exclusive connection. Old
facts remain immutable, including unmapped v0.8.1 rows. Anchor comparison uses
the prior normalizer at those coordinates. Legacy missed Subagent catalog rows
are not backfilled on reopen.
