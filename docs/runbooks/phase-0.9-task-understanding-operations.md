# Phase 0.9 operations

Use a dedicated synthetic stock dsh Host. Provision a separate marked graph root; open it with `understanding: true` and distinct read/write authorities. Supply the existing ingestion options plus `understanding: { targets: [...] }` to `startDshIngestionSupervisor`. A target names an existing Task, zero to eight explicit candidates with aliases, and optionally the current candidate. Do not read a live user's history in the excerpt lookup; pass only pre-approved synthetic fixtures by fact ID.

Inspect `supervisor.understanding.status(taskId)` and `metrics()` for active work, deadline/retry, noise, max delta and high-water. On terminal failure the durable cursor is not advanced. Correct the error, then use `request(taskId)` or reopen. A restart processes the unread SQLite suffix. A pending row is not a promise of automatic semantic apply.

To stop, call `supervisor.stop(deadlineMs)` before closing the graph store. The analyzer cancels its script and retains outstanding delta for restart. No dsh service restart or Journal rewrite is needed. Reproduce the offline benchmark with the command in the performance report.
