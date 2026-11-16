# TC2 - longer continuity only

New authorized synthetic single-trajectory study; not a replay of TC1 and not
full work-state maintenance. See [pre-exposure plan](PLAN.md).

Completed: [results](RESULTS.md), 14/14 canonical markers and 9/9 restored
returns in one new trajectory. No failures/retries; no full-state claim.

`materials.mjs`: public conversation, private oracle, identical imported TC1 prompt.
`run.mjs`: freeze/run/score/check-freeze/scan; existing DSH collector reused.
`evaluate.mjs`: unchanged marker/anchor semantics, workload-specific completeness.
`continuity.node-test.mjs`: synthetic regression tests, no live model calls.

Frozen material must be committed before `run`; existing evidence is never resumed.
Do not rerun a model batch to obtain a better score. All study files preserve
exact bytes in Git via the local `.gitattributes`.
