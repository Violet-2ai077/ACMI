# TC2: longer marker continuity, pre-exposure plan

Owner requests longer dialogue, more similar tasks and more switches/returns,
still without full state maintenance. This is a newly authorized research path,
not old G1/P-G passing or old failures being repaired. No old batch is resumed.

## Question and scope

Can the same DSH-routed model restore the original self-generated task marker
after repeated switches among overlapping clients and export objectives?
One new synthetic 14-turn CLOSED-LOOP story, five task births, nine returns,
13 switches, no immediate continuations. Expected sequence (oracle only):
1,2,1,3,4,2,5,1,4,3,5,2,4,1. Maximum separation from the most recent same-task
turn is five intervening turns. Same-client/different-objective and
same-objective/different-client contrasts coexist; one return has no client name.
Requirements may change within a task without creating a new identity.

This is one dependent trajectory, not 14 independent samples or nine independent
replicates. It is a longer short-context stress probe, not a long-context limit
test. No C1 catalog or C2 curated history; C3-style original dialogue plus actual
assistant output. No UUID recovery, persistent memory, full work state,
planned/reported/accepted/completed fields, task graph writes or product GO.

## Isolation and minimum engineering

Reuse TC1 PROMPT exactly, integer marker grammar, transport, model alias and
parameters. New corpus/oracle/batch/output directory. The local evaluator only
adapts fixed six-turn/four-story thresholds to this frozen 14-turn/one-story
schedule; individual scores and birth-anchor interpretation stay unchanged.
Without a new frozen corpus and workload counts, the previous six-turn study
cannot answer this question and completeness thresholds would be misleading.
Stop engineering at tested collection, exact-history verification and scoring.

Task identities/rationales and lexical checks are private oracle fields, never
request metadata. Full previous actual user/assistant content AND actual model
reasoning_content are forwarded as required by the existing DeepSeek route.
There is no generated summary, external map, repaired mark or state snapshot.
Thus results do not establish answer-only-history behavior or latent memory.
One generation answers and marks each turn (native inline, B-style); no A/D arm,
second marking call, JSON repair, LLM judge or semantic retries.

## Frozen metrics and falsification

- Acquisition: actual calls, completions/failures, incomplete evidence, retries,
  unsent coordinates; exact request history and raw stream re-decode.
- Protocol: one terminal numeric/UNRESOLVED marker and nonempty normal answer.
- Canonical identity: exact first-appearance number on all 14 turns, separately
  on five births and nine returns. No post-hoc relabeling.
- Conditional restoration: compare each return to its actual model-emitted
  birth anchor, only if all preceding birth anchors are valid, numeric, distinct.
  Invalid/colliding births make it unassessable, not a restored identity. A
  missing/invalid return with valid acquisition and births is a protocol and
  restoration failure, never UNRESOLVED. Missing acquisition is unobserved.
- Whole trajectory strict local criterion: all 14 captures and canonical
  markers correct. Any observed canonical error falsifies that local criterion;
  collection failure cannot alone establish mechanism failure. All nine returns
  must also be reported against actual anchors. No broad statistical GO.
- Basic answer: predeclared positive lexical groups, all groups required;
  separately report this limited check, not comprehensive SQL correctness or
  complete work-state assessment. Synonyms are not added after exposure.

Report every frozen metric even if another looks better. Free-text error analysis
cannot change scores. Retain original outputs/errors and UNRESOLVED. Review is
Owner-delegated self-review, not independent review. Freeze code, tests, corpus,
oracle, prompt, route and this plan with a committed manifest before any call.

## Budget, environment and stopping

Prior new-research calls: FM1 48 + BS1 32 + TC1 24 = 104. This batch: 14 primary
calls, at most two environmental retry calls, maximum 16 actual generations,
combined ceiling 120. At most one retry per coordinate, wait 5 seconds; only
timeout/transport_error/HTTP 408/429/5xx with intact prefix and closed local
pipeline. The Owner's later permission to record and retry environmental errors
supersedes the earlier no-retry restriction for this new batch only. Retries
retain all failed attempts and count against the cap; no semantic/protocol
retry. Stop the entire batch if a coordinate cannot complete under these rules;
no resume, replacement trajectory, quota fill or automatic next batch.

Existing limits unchanged: 1 MiB raw wire, 128 KiB request, 180 s deadline,
16,384 output-token cap, no provider/parameter changes to obtain success.
No capacity/performance work; exceeding limits is an environment observation.
Record actual usage, latency and provider cost fields, but unknown billing and
currency remain unknown. Scan selected secret and strong signatures including
decoded wire before publishing; never archive credential or Authorization.
End with evidence, limitations and a STOP, not automatic state-maintenance work.
