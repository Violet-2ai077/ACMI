# Persistent Task Graph Event Store

`GraphStreamReader` and `GraphStreamWriter` are runtime-neutral contracts.
`LocalGraphStore` is the Node adapter, outside Core. It stores per-Task
append-only envelopes, fact/cursor indexes, proposal reviews and separately
replaceable checkpoints in SQLite. It does not use a dsh Journal as graph
storage. The trusted composition issues different read and write grants.

| Option | Decision |
| --- | --- |
| JSONL plus exclusive file lock | Simple inspection, but would require custom torn-tail framing, lease reclamation, durable idempotency indexes and cross-table commit/rollback. |
| SQLite WAL with multi-writer cache invalidation | Indexed and transactional, but additional sidecars and concurrent cache/backup policy are unnecessary for this phase. |
| Existing dsh Storage or Session Journal | Useful as a runtime source; not an atomic transaction over the ACMI fact, graph, cursor, checkpoint and review data. |
| Built-in Node SQLite, rollback journal | Selected. `synchronous=FULL`, exclusive connection lock, one writer per dedicated marked Workspace. Stock OS/SQLite releases locks on process exit. No separate stale PID lease file. |

Provisioning requires an empty canonical dedicated directory. The marker and
DB metadata bind Workspace partition and physical root identity. Cold open
checks file type, size, schema version, metadata and SQLite `quick_check`
before serving. The dsh composition requires graph and Journal roots to be
separate. The trust model is a local exclusive root, not protection against
hostile Windows reparse-point/rename races or a writer able to forge hashes.
Back up a closed store and its source evidence; moving a database to a new
root is not automatically admitted. No live backup/migration is implemented.

Event row = Workspace/Task + sequence + deterministic event ID +
idempotency key + prior envelope hash + canonical payload + row hash.
Source refs, Host observation time and evidence provenance are explicit.
CAS on the previous stream revision prevents stale updates. A retry with the
same canonical draft returns its original receipt, even if the head advanced;
a reused key with changed content is a conflict. Transactions do not publish
a successful receipt until commit; failure invalidates tentative cache state.

Checkpoints are transactional, versioned derived data with checksum and a
committed anchor. Reopen validates the anchor and replays only the bounded
suffix in pages; invalid checkpoints fall back to validated full replay.
Missing, malformed or hash-disagreeing authoritative rows fail closed. An
explicit `audit` validates all logical rows, including those below the anchor;
normal checkpoint reads do not rehash that prefix. After an audit finds
corruption, that Task is unavailable for the remaining store lifetime. SQLite
rolls back an uncommitted writer; ACMI never trims arbitrary tails or repairs
the source dsh Journal. Checksums establish integrity, not signatures.

Prototype limits: 64 Tasks, 4,096 graph positions per Task, 128 read rows/page,
256 Session incarnations, 65,536 facts, 65,536 SQLite pages, separate row and
checkpoint size caps. Host calls are local synchronous transactions; abort
is checked before append and between drain/replay records, not mid-fsync.
No claim of production SLA, distributed exactly-once or unbounded scale.
