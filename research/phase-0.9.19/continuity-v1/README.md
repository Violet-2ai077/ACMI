# TC1: marker continuity only

Owner-authorized follow-up to BS1. Normal answer plus one local task marker.
New tasks use 1,2,3 in first-appearance order; returning restores the original
marker. No task-state snapshot, UUID, catalog, progress or acceptance fields.
See PLAN.md for definitions, conditional birth-anchor diagnostics and limits.

Pre-exposure sequence: tests, self-audit, `node run.mjs freeze`, commit, then
one-shot `node run.mjs run`. Offline: `node run.mjs score`, verification and
`node run.mjs scan`. Do not resume or execute historical batch commands.

Capture is a scoped copy of BS1 with different frozen materials, output directory,
budget and scorer; underlying transport/routing code is reused unchanged.
Only the selected DSH credential reference is read; values and Authorization
are excluded from evidence. Inputs are synthetic. Untrusted model output is
never executed. Scan both plain files and decoded raw streams before publishing.
No claim of universal secret detection, power-loss safety, hard RSS or product GO.
