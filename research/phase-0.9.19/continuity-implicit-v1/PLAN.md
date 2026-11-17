# TC5: unannounced ambiguity, finite pre-exposure plan

Owner authorizes testing whether the model itself notices ambiguity without the
user announcing missing information; restore when resolved, ask when unresolved;
no full state maintenance. New path/batch, not old G1/P-G passing or repair.
24 primary calls (2 stories x 12 turns), <=4 eligible environment retries,
max 28. Prior 166 calls remain unchanged; bookkeeping combined ceiling 194.

## Design and interpretive assumption

Two new synthetic stories: pottery confirmation artifacts sharing topic/equipment
and warehouse queries sharing schema/rule. Each has three births, four clear
returns, one immediate continuation, two ambiguity turns and two clarified
returns. Totals 6 birth + 8 clear-return + 2 continue + 4 ambiguous + 4 clarified.
Sequence per story: 1,2,1,3,3,UNRESOLVED,2,1,3,UNRESOLVED,1,2.

The ambiguous user requests are ordinary edits with no mention of missing
source, lost context, uncertainty, two possible candidates, or instruction to
ask. Both earlier artifacts meet the description. The immediately preceding
artifact is task 3, outside the candidates, so simple immediate continuation
cannot identify the task. The shared descriptor points to tasks 1 and 2.

PREDECLARED LIMITATION: human dialogue may use the most recent matching artifact
even across intervening work. The strict oracle chooses clarification when no
unique content cue and no immediate-current candidate exist; this is a research
interpretation, not proof that a recency default is universally wrong. We do not
alter the inherited prompt to install a new recency policy. If the model picks a
candidate, retain the strict failure AND discuss pragmatic interpretability.
Do not claim an arbitrary hidden intended task. Candidate recency (task 1 in
all four probes) is frozen and reported descriptively, not as alternative PASS.
Chosen number alone cannot establish the model's internal algorithm.

Controls: turn 5 is a natural immediately adjacent abbreviated edit to task 3,
so absence of an entity name alone must not force clarification. Clear returns
provide audience/storage semantics. Clarifications are fixed even after a wrong
guess; no adaptive corrections, reruns or hidden-state repair. No deliberate
trick requiring unseen UUIDs. Identity only, not full work status.

## Minimal engineering and freeze

Use unchanged TC1 prompt, TC4 single-turn scorer and grouping, existing transport.
Only add corpus/oracle, continue group and frozen candidate-recency diagnostic.
Without these, correct immediate continuation vs excessive abstention and
strict-oracle failures vs recency interpretation would be conflated. No framework
or performance work. Self-review rationales before output; not independent review.
Freeze/commit corpus, prompt, oracle, route, plan, tests and dependencies before
calls. New output directory and batch. No post-exposure scoring or prompt changes.

Full original user/assistant content and actual reasoning_content are retained,
as required by the existing route. No task directory, map, UUID, summary, graph,
work-state snapshot, second marker call, JSON repair or LLM judge. C3-style
CLOSED-LOOP inline B-style only; no C1/C2/A/D/replay comparison. Two dependent
trajectories, not 24 independent samples; not a causal matched ablation of TC4.

## Frozen metrics

- Acquisition/protocol/canonical exact match on all 24, grouped into five kinds.
- Restored actual valid distinct birth anchors on 12 returns; immediately
  continuing turns separately counted. Invalid/missing birth anchors remain
  unassessable; absent output is not UNRESOLVED.
- Ambiguous: abstained / unsupported_numeric_assignment / protocol_invalid /
  not_acquired, plus positive lexical clarification evidence. Inherited field
  name unsupported_numeric_assignment means strict-oracle mismatch, NOT proof
  that a conversational default could never justify the response.
- Resolved: other-established-task canonical assignment and unnecessary
  UNRESOLVED; preserve actual-anchor/canonical distinction.
- New descriptive ambiguity_strategy: candidates, most_recent_candidate,
  numeric_candidate, chose_recent_candidate; never changes strict score.
- Basic answers: frozen positive lexical groups only, no complete correctness
  claim. Clarification wording checks also limited, read raw cases without
  re-scoring. Strict local criterion: both full trajectories all markers correct
  and all four ambiguous outputs pass clarification lexical checks. A complete
  but wrong output falsifies this criterion, not necessarily universal capability.

## Transport, budget and stop

Each evaluated turn has one answer+marker generation; retries only for environment
failures before an accepted complete result, <=1 per coordinate, <=4 total,
5-second delay, timeout/transport_error/HTTP408/429/5xx with intact prefix and
closed pipeline. Every invocation counted and failed evidence kept. No semantic
retry. Halt if a turn cannot finish under rules, no resume/replacement batch.
Raw wire 1 MiB, input 128 KiB, deadline 180s, max output 16384 unchanged.
Capture exact request/context, actual wire/deltas/output, model/route/parameters,
usage/latency and failure/unsent distinctions. No fabricated terminals.
Scan selected credential and strong signatures including decoded wire before
publishing; no Authorization/secret archived. Verify bytes and scores. Preserve
all previous freezes/scores; push new codex branch, main unchanged. Cost/currency
unknown remains unknown. Stop after report, no automatic full-state expansion.
