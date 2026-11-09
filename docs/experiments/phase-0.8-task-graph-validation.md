# Phase 0.8 Task Graph validation

Focused cases cover sequential WorkNodes on one Agent, two spawned branch
executions, wait/resume versus ongoing mainline progress, result production
without review, consumption without acceptance, explicit join and separate
mainline advancement. A failed branch is reopened with a new attempt and a
new execution; historical output does not replace current output.

Out-of-order reverse delivery and serialized checkpoint-plus-suffix replay
match full projection. Tests assert exact duplicate no-op, conflicting slot
fail-closed, cycle rejection, missing causal predecessor, unknown node/result,
foreign grant denial and revocation. The benchmark additionally rebuilds and
compares all 120 cuts. TypeScript independently compiles Contracts without
runtime dependencies; Core uses only Contracts and ES2022. See the
[domain](../architecture/task-graph-model-v0.1.md) and
[lifecycle](../architecture/task-lifecycle-and-join-semantics-v0.1.md).

Graph evidence is explicitly authored in these tests. There is no claim that
Phase 0.8 can reconstruct WorkNodes and reviews from arbitrary dsh transcripts.
