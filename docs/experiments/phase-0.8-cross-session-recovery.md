# Phase 0.8: fresh Session recovery

The synthetic corpus covers A/B/A interleaving and unrelated C; one Task
spanning two Sessions; a stable Task UUID with a different active WorkNode;
parallel executions with explicit waiting/continuing; a failed branch
retried with a new execution; produced-only results, consumed-but-unaccepted
results, accepted dependencies and explicit joins. Source refs retain the
original Session identity instead of copying that Session into the new one.

Two different recovery tests:

1. The isolated dsh experiment starts a new, independent Agent/Session
   without inherited history. The first recorded model request contains the
   task package, not the unrelated source messages. Budget failure yields
   the normal baseline request. Both accepted and unreviewed dependency
   forms were checked. Journal integrity and the stock Compact behavior are
   reported in the [hook investigation](phase-0.8-dsh-compact-hook-investigation.md).
2. The portable benchmark verifies all 116 emitted packages against a
   trusted handoff identity/hash. Six representative handoffs (one per
   family) also enter a separate Node process via stdin with **only** the
   package and expected identity/hash. It recovers the correct Task,
   WorkNode, state, next action and dependency stages in 6/6. It is a
   deterministic data recovery test, not a model-task success test.

Each of 120 graph cuts is replay-checked against serialized checkpoint plus
suffix. Assembly is run over the in-memory cut; it never reads historical
Session files on the warm path. The new process uses neither graph events
nor Session history. A production host still needs an authorized source
resolver, durable graph stream storage and trusted package handoff.
