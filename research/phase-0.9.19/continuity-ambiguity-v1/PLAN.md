# TC4: similar goals, ambiguity and clarification

Owner approved executing the proposed finite study on 2026-11-17. New independent
research path; not old G1/P-G passing or old failed batch repair. Old 142 calls
remain in historical accounting. This round: 24 primary calls + at most 4
environment retries = 28; combined accounting ceiling 170, not old unused quota.

Two new synthetic 12-turn CLOSED-LOOP stories: shared reading confirmations and
shared event-ingestion schemas. Each has three independent tasks, two ambiguous
requests and two fixed clarifications. Per-story expected sequence:
1,2,1,3,2,UNRESOLVED,1,2,3,UNRESOLVED,2,1.
Totals: 6 births, 10 clear returns, 4 ambiguous requests, 4 clarified returns.
One trajectory is one dependent sample; 24 turns are not independent replicates.
No A/D/C1/C2/replay; B-style inline C3-style original dialogue only.

## Identifiability and freeze review

Both candidate tasks share salient words and purpose; resolved requests use
audience/source semantics rather than a unique repeated keyword. The ambiguity
turns explicitly describe detached feedback with missing source, naming two
possible referents. This prevents recency from silently supplying a reasonable
default. They do NOT specify a hidden intended task, request UNRESOLVED by name,
or directly instruct the model to ask a question. Scope is disclosed missing
information, NOT detection of unannounced everyday ambiguity. Clarifications
are fixed user messages sent even if the model guessed; no adaptive branches
or corrected assistant history. Ambiguity handling is attributed as unresolved
existing work, not creation of a meta-task; same prompt already specifies this.

Self-review each oracle rationale against visible user history before output.
No independent reviewer. Public inputs contain only id/turn/source_id/text;
no task keys, categories, oracle, mapping or current state. Freeze all materials,
prompt, route, code and tests, then commit BEFORE model calls. No post-output
changes to wording, match rules, synonyms, thresholds or truth. Disagreements
about interpretability are recorded without changing the score.

## Minimal engineering

Reuse exact TC1 prompt and transport. Reuse TC2 parsing and single-turn scoring;
only supplement grouping and strict criterion for two stories with ambiguity.
Without this, unanswered ambiguity and identity errors would be conflated.
Stop at frozen category metrics, tests, capture and deterministic verification.
No full state, UUID, task graph, memory compression or framework. All actual
assistant content AND reasoning_content are forwarded unchanged as the existing
DeepSeek route requires. One generation answers and marks; no repair, LLM judge
or second marker call. Explicit client/source names may reappear in answers.

## Frozen outcomes

- Acquisition and protocol: same original verification and terminal-marker rules.
- Canonical exact match on all 24; separate 6 births, 10 clear returns, 4
  ambiguous requests, 4 clarified returns. Ambiguous expected UNRESOLVED.
- Conditional restoration on 14 identifiable returns vs actual distinct valid
  birth anchors; ambiguous turns never treated as births or return anchors.
- Ambiguity outcome: not_acquired / protocol_invalid / abstained /
  unsupported_numeric_assignment; lexical clarification check separately.
- Other-task assignments: a resolved return emits another established task's
  canonical number. This descriptive error classification does not prove cause
  or replace actual-birth-anchor analysis. Unnecessary UNRESOLVED separately.
- Basic answers: all frozen positive lexical groups required. Not a full SQL,
  natural-language correctness or complete work-state score. Ambiguity checks
  require question/confirmation language and candidate vocabulary, not semantic
  certainty that a good clarification was asked. Inspect cases, never re-score.
- Strict local success: both 12-turn trajectories fully captured and all markers
  exact, plus all four ambiguous responses pass clarification lexical checks.
  Any captured identity/abstention error fails this criterion. Acquisition failure
  alone does not establish a model-capability failure. Report all metrics, not
  just whichever is favorable; no broad statistical GO.

## Collection, retry and stop

Retain exact requests/context and actual wire/content/reasoning chunks, output,
route/model/usage/latency and all attempts. Max raw wire 1 MiB, input 128 KiB,
deadline 180 seconds, output cap 16384 unchanged. One retry per coordinate only
for timeout/transport_error/HTTP408/429/5xx with intact prefix and closed local
pipeline; 5-second wait; total retries <=4, all invoked calls count. No marker
or semantic retry. If a coordinate cannot complete under this rule, halt batch,
no resume, replacement or quota filling. Capture-invalid counts are not silently
equated to missing physical evidence; inspect result.evidence_complete if needed.

Publish safe synthetic data after selected-secret/strong-signature checks,
including decoded wire; never archive credentials/Authorization. Verify frozen
and staged bytes, commit/push research branch, leave main and old scores alone.
Record usage and unknown final billing/currency honestly. Stop after report;
no automatic full-state stage or additional study.
