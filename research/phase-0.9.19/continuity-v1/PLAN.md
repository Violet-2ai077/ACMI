# TC1: task-marker continuity, without work-state maintenance

Owner's new authorization: test whether switching away and returning restores
the original task marker, without complete work state. Date: 2026-11-16 Shanghai.
This is separate from FM1 and BS1; their frozen files, scores and evidence stay
unchanged. No old G1/P-G pass, Host/Graph integration or production qualification.

## Necessary minimum

BS1 deliberately assigned a new segment on every return, so its positive result
cannot establish persistent task-marker continuity. Add only new synthetic
conversations, a short marker policy and deterministic continuity diagnostics.
Reuse the existing single-send capture, deadlines, routing and evidence checks.
No task catalog, UUID slots, state snapshot, acceptance field or progress output.
This runner is a scoped copy of BS1's known capture path, not a new framework.

Four new six-turn narratives, one inline arm, 24 real generations, CLOSED-LOOP.
Expected marker sequences (private oracle, never injected):
- album-sign: 1,1,2,2,1,2
- similar-clients: 1,2,3,1,3,2
- invitation-cost-form: 1,2,1,3,2,1
- inventory-expenses: 1,1,2,1,2,1
Total: 10 task births including four initializations, 3 immediate continuations,
11 returns after intervening tasks. Four handcrafted stories are not a random
population sample; 24 turns/11 returns are not independent samples.

## Public policy and controlled input

First task gets marker 1; every genuinely new task gets the next unused positive
integer in order. A continuing or returning known task MUST reuse its established
marker. Numbers identify objectives, not turns, segments, capabilities or projects.
New evidence, format changes, tests, wording changes and revised requirements of
the same task preserve identity. Separately requested work for distinct clients
can be different tasks despite vocabulary/capability overlap. All probes have
one resolved current objective. UNRESOLVED remains allowed for insufficient
identity evidence, but has no positive probe here and is wrong on these resolved
items; no claim of ambiguity handling will be made.

Normal answer plus exactly one final `<|task:N|>` or `<|task:UNRESOLVED|>`.
N is a decimal integer 1..999 without leading zeros. No answer wrapper, mapping
table, state dump or additional marker; marker not inside a code fence. Normal
answer may contain code. Whitespace after the marker is allowed. No JSON repair,
model judge, second marking call, forced response schema or hidden state repair.

The model sees policy, source IDs, original user turns and all its own previous
raw answers/markers AND reasoning verbatim. No oracle, private task key, expected
number, summary, externally repaired map or new-task slot is sent. It must establish
and recover the bindings through its own conversation. No replay/reference history.
Local labels are not supplied UUIDs and do not change a formal ACMI graph.

## Frozen scoring and failure attribution

Protocol validity: nonempty normal answer and one valid terminal marker. A
missing/duplicate/malformed marker is protocol failure, never UNRESOLVED.
Capture failure has null mechanism scores; retain failed/partial/unsent records.

Primary metrics (all frozen before outputs):
1. Canonical marker exact per acquired-complete turn, including protocol errors
   as wrong. Report births (10), immediate continuations (3), returns (11), and
   each story separately. Acquisition missingness is separately reported, not
   silently removed or interpreted as model failure.
2. Conditional return restoration against the model's ACTUAL birth marker,
   not an oracle-corrected marker. A return is assessable only when all task-birth
   outputs through that return are complete, protocol-valid, numeric and distinct.
   A wrong canonical birth number can still support this diagnostic, but cannot
   rescue canonical scores. If any birth is missing/malformed/UNRESOLVED or birth
   IDs collide, record unassessable plus exact reason; never count as success.
   A valid birth followed by missing/malformed marker at return is a restoration
   failure, not unassessable. Missing return acquisition is unobserved.
3. For a failed assessable return, report protocol failure, unnecessary abstention,
   immediate previous task's marker reused, another established task's marker,
   or a fresh marker instead of restoration. These describe outputs, not proven
   internal cognitive causes. Preserve target birth file/turn/observed marker.
4. Full trajectory success requires all six complete captures, valid protocol and
   canonical markers exact. All four trajectories must pass for the strict local
   positive criterion. Even a local pass is not product or population-wide GO.
5. Basic answer: frozen regex groups (any-of within group, all-of across groups).
   Separate from continuity; lexical checks do not establish full answer quality
   or noninferiority. No post-output synonym additions or semantic rescoring.

Scoring does not examine or repair the private reasoning trace. It is retained
only for exact provider-compatible history and acquisition verification.

## Review and freeze

Codex self-review under delegated Owner authority, not independent review.
Before output exposure check each task identity and first-appearance order,
private/public separation, return targets, complete schedule and finite bounds.
Check renamed/rephrased requests still explicitly concern the same work and
similar-client tasks are independently requested objects. Test malformed markers,
birth failure, ID collision, correct return after wrong birth, new-ID-on-return,
previous-ID reuse, exact closed-loop preservation and accounting. Commit corpus,
oracle, prompt, plan, route and recursively imported local source hashes BEFORE
sending. Never alter frozen materials after exposure.

## Calls and stopping

Batch tc1-20261116. 24 primary calls + at most 8 environment retries = <=32 actual
calls. Prior FM1/BS1 consumed 80; cumulative maximum 112 < original 120 ceiling.
One retry per coordinate after 5 seconds for timeout/transport_error or HTTP
408/429/5xx only if capture prefix integrity and local closure are confirmed.
Same request/routing, first complete result wins; preserve every failed attempt.
No retry for marker/identity/answer errors or byte limit/truncation/filtering/
sink/integrity failures. Stop batch if retry fails or is unavailable. No resume.

Keep selected DSH route, thinking enabled, reasoning effort as configured,
max_tokens 16384, request <=131072 bytes, raw response admission 1048576 bytes,
180000 ms deadline, 5000 ms cleanup. Preserve received over-limit chunk. No capacity
work or cost optimization. Provider usage/cost fields are claims, not verified
currency/billing. Credentials remain out of logs and archive.

Record exact requests, input history, fetch invocation, delivered raw chunks,
content/reasoning deltas, observed terminal and usage/latency. Rebuild requests,
decode original wire independently, reproduce deterministic scores, hash files,
scan plain and decoded new artifacts for secrets, commit/push only research branch.
This is not a power-loss/RSS proof. Preserve main and prior research unchanged.
Stop and report after this batch; do not add full state maintenance automatically.
