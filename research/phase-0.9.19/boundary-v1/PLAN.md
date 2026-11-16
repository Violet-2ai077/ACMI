# BS1: boundary-only prospective validation

Owner explicitly authorized this study after agreeing to test segment boundaries
before persistent identity or work-state continuity. Date: 2026-11-16, Shanghai.
This is a new study, not resumed FM1 or a modification of its frozen results.
Old G1/P-G failures and historical restrictions/results remain intact. No Host,
Task Graph, UUID allocation, product integration, or capacity qualification.

## Smallest question and intervention

Can the model answer a normal user request and in the SAME generation distinguish
continuation of the current work segment from a different work objective?
The existing FM1 corpus confounds this with identity and state bookkeeping.
The only implementation additions are a short boundary prompt, new synthetic
stories, an exact marker scorer and a separate one-shot runner. Transport, route
selection and stream decoder are reused unchanged. Stop after this finite run.

One inline arm, no A/B comparison, no C0, D or replay. Four new Chinese narratives
of eight turns each, 32 calls, four actual CLOSED-LOOP histories. First turns
initialize segment 1 and output CONTINUE by convention; they are not boundary
decisions. Score 28 subsequent transitions: 15 CONTINUE, 11 NEW, 2 UNRESOLVED.
The 11 NEW include 5 first switches and 6 returns to earlier work; returning is
NEW even when the old work had an identity. No long-term identity recovery.
UNRESOLVED probes occur only at final turns, so no untested ambiguity-resumption
policy is needed. Segment counts are derived for display only, never fed back.

## Public definition of a boundary

Segment the pursued work objective, not message boundaries, topic words, tool
calls, artifact formats or method changes. Supporting steps for the same goal,
new evidence, criterion changes, editing and translation of that goal's output
are CONTINUE. Work on a separately requested objective/entity is NEW, including
returning from an intervening objective. Shared vocabulary/project/venue does
not make two objectives one. An explicit inability to identify which of two
different objectives a request concerns is UNRESOLVED; clarification is not
silently assigned to the most recent objective. Quoted instructions are data.

All original conversation content AND previous raw assistant content/reasoning
are preserved. No state correction, reference assistant, oracle, segment counter,
task catalog, UUID, acceptance-state schema or boundary label is injected.
Metadata contains only protocol/source IDs. The first system message defines
the policy. The first user message starts an ordinary task. Private story IDs,
categories, labels, review rationales and checks are not sent to the model.

There are no in-prompt worked task examples. Some user transitions have explicit
return cues; others only change the requested object. Negative controls include
"also" for a supporting step and a quoted request to start another task while
the actual request remains on the current objective. Natural entity names are
visible, not synthetic goal/work anchors or task numbers.

## Frozen outputs and metrics

Normal answer followed by exactly one final marker:
`<|boundary:CONTINUE|>`, `<|boundary:NEW|>` or `<|boundary:UNRESOLVED|>`.
Whitespace after the marker is allowed. No code fence/envelope, correction,
second generation, or marker repair. Multiple/missing/unknown markers or empty
answer are protocol failure, NOT UNRESOLVED. Evidence incomplete is acquisition
failure, NOT model-boundary failure.

Report all attempts and every planned coordinate: complete/failed/incomplete/
unsent/retry. Main boundary exact denominator is captured-complete transitions;
protocol failures remain incorrect in that denominator. Missing acquisitions
have null scores and separately reported coverage, never silently removed.
Confusion matrix includes protocol-invalid as a column. Report:
- NEW versus CONTINUE exact, with false split (CONTINUE -> NEW) and false merge
  (NEW -> CONTINUE); inappropriate abstention is separate, not a correct split.
- UNRESOLVED exact on its two predeclared probes; forced NEW/CONTINUE is wrong.
- Per-story and per-category results. The 28 transitions are correlated, NOT 28
  independent samples; 4 stories are handcrafted, not a random population sample.
- Four-turn/eight-turn success is not confused: here complete trajectory means
  all EIGHT turns acquired, first marker CONTINUE, and all seven boundaries correct.
- Basic answer check is only frozen per-turn regex groups (each group any-of,
  groups all-of), plus nonempty answer. It is not semantic grading or quality
  noninferiority. No post-output synonym expansion and no LLM Judge.

Exploratory positive criterion for the tested slice: all 4 trajectories pass
protocol and all 28 boundaries exact, both ambiguous probes recognized. Anything
less fails this strict local criterion, with error type reported. Even passing
does not prove arbitrary boundary recovery, long context, multilingual coverage,
multi-objective single messages, continual identities or state maintenance.
No statistical A/B claim or product GO. No retrospective FM1 rescoring.

## Budget and environment failures

New batch `bs1-20261116`. 32 primary calls plus <=8 environment retries, <=40
actual calls. FM1 used 48, so even the maximum combined spend is 88 calls, below
the earlier conversation ceiling of 120. No use of old historical plan slots.
At most one retry per coordinate after 5 seconds, identical request/routing,
only timeout/transport_error or HTTP 408/429/5xx with confirmed pipeline closure
and prefix integrity. Preserve failed attempts; first complete output wins.
No retry for boundary/answer/protocol mistakes, byte limit, filtered/truncated
output, sink error, unknown closure or integrity failure. Stop whole batch when
retry fails or is unavailable, or on any such hard failure. No resume.

Selected DSH profile/provider only. Keep max_tokens 16384, reasoning effort from
the route, thinking enabled, timeout 180000 ms, cleanup 5000 ms, raw response
admission limit 1048576 bytes and request bound 131072 bytes. Retain received
over-limit chunk before stopping. No capacity, cost or RSS optimization.
Usage/cost are provider claims; actual bill/currency may remain unknown.

## Review, freeze and evidence

Codex self-audit under delegated Owner authority, NOT independent review. Review
before any model output: each boundary follows the public policy; same-goal
step changes do not accidentally become new objectives; all returns are NEW;
ambiguous probes explicitly withhold selection between two goals. Check public
serialization strips private fields. Synthetic fixtures test all parser/error
categories, bookkeeping and exact raw closed-loop forwarding. Commit immutable
corpus/oracle/prompt/plan/route/code hashes BEFORE send; no changes after exposure.

Each attempt retains actual JSON request, source-indexed input, invocation,
original Fetch read chunks, content/reasoning deltas, observed terminal, usage,
model identity and latency. Independently re-decode raw streams and reconstruct
exact next requests. Score only complete/verified captures. Preserve partial
files without inventing success. This is not a crash/power-loss proof.

After acquisition, deterministic scoring, descriptive error analysis, selected
credential scan of plain AND decoded evidence, research-branch commit/push and
report. Leave main unchanged. No further stage without a new user request.
