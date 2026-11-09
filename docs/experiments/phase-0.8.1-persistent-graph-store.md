# Persistent store validation

Native Node SQLite uses an exclusive lock for one admitted Workspace
writer. The test suite covers duplicate ACK-loss retry, conflicting
idempotency payload, stale CAS, distinct read/write grants, reopening
after a checkpoint with an exact suffix, rollback of an uncommitted
subprocess writer, truncated SQLite database, bad checkpoint fallback,
hash mismatch in a committed suffix, explicit full audit below a valid
checkpoint anchor, and page-cap `SQLITE_FULL` with the last committed
cut preserved. No raw dsh file was changed by the store.

An abruptly exited child leaves an on-disk rollback journal. The next
exclusive writer sees the original committed graph, not the child's
uncommitted update. This is a process failure test, not a physical
power-loss or filesystem-ordering certification. A SQLite database
truncation is the relevant fault here; ACMI does not implement a JSONL
torn-tail salvage policy. DB integrity plus envelope/checkpoint checks
are not a cryptographic authorization mechanism.

The benchmark runs separate real SQLite transactions, measures read,
append, checkpoint, open and suffix restoration, and independently
replays the sampled Task Graph. Exact timing distributions are in the
delivered JSON, not production targets.
