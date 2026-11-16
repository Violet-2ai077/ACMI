# TC3 - longer, reduced explicit cues

See [frozen plan](PLAN.md). One new 24-turn, five-task synthetic CLOSED-LOOP
trajectory; 19 content-grounded returns, no full work-state maintenance.
Exact TC1 prompt and TC2 evaluator reused; original historical outputs untouched.
New authorization: at most 28 calls, including up to four environment retries.

Completed: [results](RESULTS.md), 24/24 canonical identities and 19/19 actual
birth-anchor restorations. One trajectory, zero failures/retries; complete
actual content/reasoning history retained. Not a cue-free or full-state claim.

`run.mjs` supports freeze/run/score/check-freeze/scan. A run requires a committed
freeze, refuses existing evidence, and never repairs markers. Local tests use
synthetic fixtures, not model calls. `.gitattributes` preserves exact file bytes.
