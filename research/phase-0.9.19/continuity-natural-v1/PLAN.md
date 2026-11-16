# TC3: longer content-grounded task continuity, frozen before exposure

Owner explicitly authorizes a new finite call round beyond the former remaining
two calls: lengthen dialogue, reduce client names and explicit return cues, keep
full state maintenance out. This is a new research path, NOT old G1/P-G passing,
NOT repair of old failures, and NOT mutation of any earlier batch allowance.

## Question and design

One new synthetic 24-turn CLOSED-LOOP story, five similar message-writing tasks,
five births, 19 returns, 23 switches, no immediate continuations. Three clients
overlap across registration confirmations, paid receipt, unpaid reminder and
pickup notification. Two tasks share a client; two confirmations share a medium
and purpose. New scenario, not a replay or continuation of previously seen output.

Oracle sequence: 1,2,1,3,4,2,5,3,1,4,5,2,3,5,4,2,4,3,5,2,3,4,5,1.
Task one is absent between turns 9 and 24: 14 intervening user/assistant turns.
All 19 return prompts omit client names and explicit return commands. One return
uses a venue name; other cues include paper books/shared reading, annotation,
funds received, payment deadline and collecting goods. These are ordinary work
content, NOT cue-free recovery. No model-facing identity map or expected number.
Client names are only allowed at task birth. Do not adapt user messages to model
output or silently substitute a clarification when the model chooses differently.

The oracle rationales are self-reviewed before exposure: each return identifies
one existing artifact by a unique combination of purpose/medium/content. No
genuinely ambiguous return is deliberately included; UNRESOLVED remains legal
but is an incorrect abstention here. A post-output ambiguity concern must be
reported without changing the frozen canonical score or inventing a new judge.
Do not infer general ambiguity-handling reliability from this positive probe.

Length, domain and cue type change together; this is a combined finite stress
probe, not a causal ablation of one factor. One trajectory, not 24 independent
samples or 19 independent replications. Compare descriptively with TC2, never
pool C1/C2/C3, B/A, closed loop/replay, or previous local criteria into one GO.

## Minimal implementation and invariant context

Only add a new corpus/oracle, version/directory and separately authorized budget.
Otherwise the longer reduced-cue observation cannot be obtained. Reuse the exact
TC1 prompt, TC2 evaluator functions and existing DSH transport. No framework,
state module, approval layers, capacity work or new engineering qualification.
Test the new schedule, absence of explicit client/return cues, exact prompt and
scoring reuse, request isolation and failure branches; freeze dependencies and
commit before sending. Self-review is not independent review.

Full original user/assistant content AND actual reasoning_content are retained,
as the selected DeepSeek route requires. No summary/map/repair/corrected history.
No UUID/catalog, current activity state, task graph mutation or state-maintenance
schema. This is C3-style task discovery in original dialogue, inline B-style
only. No C1/C2, A, D, replay, second marking call, output repair or LLM judge.
Basic factual content in answers is not full planned/reported/completed status.

## Frozen scoring and falsification

Use unmodified TC2 parseOutput/score/summarize via imports (manifest-pinned):
protocol validity; exact canonical identity; births vs returns; restoration of
actual emitted birth markers conditional on valid distinct prior birth anchors;
unassessable/missing captures vs observed failures; basic positive lexical groups.
Report all metrics. No post-exposure regex/synonym/threshold changes or relabeling.
Canonical denominator 24 planned; five births and 19 returns. Strict local
criterion is one complete trajectory with all 24 canonical identities correct.
A validly captured incorrect marker falsifies that local criterion; acquisition
failure alone does not show model incapability. Wrong/missing return markers are
not UNRESOLVED; invalid/colliding birth markers make anchor restoration
unassessable. Canonical correctness is still reported independently.

Capture requests/context, actual streaming wire/content/reasoning, output,
route/model/parameters, usage, latency, invoked/completed/failed/incomplete/unsent
distinctions. Existing evaluator field evidence_incomplete counts capture-invalid
attempts broadly; if failures occur, separately explain physical evidence
completeness from raw result.evidence_complete rather than equating the two.

## New finite authorization and stop

Historical cumulative new-research calls before TC3 = 118, left unchanged.
New round: 24 primary generations plus at most four environmental retry calls,
max_actual_calls=28. combined_ceiling=146 is bookkeeping for 118 + NEW 28, not
remaining slots of the old 120-call plan. No renewal after this batch stops.
Only one retry per coordinate, wait 5 s, only timeout/transport_error/HTTP408/429/
5xx with prefix_integrity and local_pipeline_closed; preserve failures and count
every invocation. No semantic/protocol retries. Halt entire batch if an intended
turn cannot finish under these rules. No resume, fill-up trajectory or new batch.

Keep max raw wire 1 MiB, input 128 KiB, deadline 180 s, output cap 16384 unchanged.
No model/provider changes to obtain success. Do not optimize performance or cost.
Report actual usage and cost fields; currency/final billing unknown stays unknown.
Review selected secret and strong sensitive signatures including decoded wire
before publishing. Preserve previous frozen materials and results. Commit/push
new safe evidence only on codex branch; main unchanged. Stop after report even if
successful; do not automatically add full state or consume unused retry quota.
