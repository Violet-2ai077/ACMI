# Development narrative source, revision 0

Author/reviewer: codex-assistant, under owner-delegated-model-review.
Status: narrative semantics reviewed; NOT frozen, NOT an executable corpus, no model
outputs observed. Complete condition-specific snapshots, source spans, UUID birth
mapping, answer assertions and mechanical preflight remain to be materialized.
No rows are copied from the Gate 1 engineering fixture.

## Shared interpretation fixed before model experiments

- Each quoted row below is the complete user message for that turn, except F6 t4,
  which explicitly contains two separately identified user messages. No hidden tool
  execution occurs. A user statement explicitly recording Owner acceptance is an
  acceptance fact; a plan, estimate or draft is not execution or acceptance.
- t1/t2 are simple, t3/t4 medium, t5-t8 hard. These are proposed design strata, not
  measured model difficulty. Probe turns: t2 and t8 in every family.
- A/B/C/D below are family-local task names, not output protocol arms. UUIDs are
  canonical evaluator identities; new identities are matched by birth coordinate.
- C1 supplies only the initial task catalog listed below, UUIDs and initial goals,
  plus its own subsequent proposal history. No future-created task is in that catalog.
- C2 supplies historical identity evidence for those same initial tasks but no active
  task state. Historical evidence is a past record, not a Host activity projection.
- C3 supplies no task catalog or historical UUIDs. At the first encounter of a task,
  propose CREATE (or the explicit BRANCH/MERGE operation), map its born UUID once and
  preserve that identity thereafter. Never require recovery of an invisible old UUID.
- The operation column describes C1/C2 after initial identity establishment. In C3,
  first encounter of an existing task becomes CREATE, replacing CONTINUE/SWITCH for
  that birth; do not add a redundant SWITCH to the same newborn target.
- All state changes remain proposals. Relations are not permission to copy source
  task completion to a parent or merged result without explicit supporting evidence.
- Same-session recovery preserves session/agent and raw prior evidence. Handoff at t5
  changes logical session/agent but provides prior raw history and original generated
  identity markers. It does not secretly restore identities from the oracle.
- The long-gap condition is at least five intervening attribution turns, not a claim
  about hours of elapsed time. SM5 will be scored separately from session handoff.
- Each oracle must retain every previously known task, not only current targets.
  Negative examples include wrong target, unjustified CREATE/BRANCH/MERGE, unsupported
  completion, obsolete criteria, wrong decision authority and invented identity.

## F1: single-task continuity / migration manifest

Family: manifest-continuity. Recovery: none. Initial catalog: A only.
A = a1000000-0000-4000-8000-000000000001, validate the migration manifest.
Initial acceptance: all six entries validated. Initial decision: one checksum per entry.

| Turn | Exact user message | Attribution / operation | Normative facts and negatives |
|---|---|---|---|
| t1 | "For the migration manifest, plan to validate six entries in two batches of three. No validation has run. How many batches are planned?" | A / CONTINUE | Answer 2; validation planned, not completed. Do not create a second task for batching. |
| t2 | "Still on the migration manifest: the operator validated the first batch of three entries; the second batch has not run. How many entries remain?" | A / CONTINUE | Answer 3; first batch observed complete, second pending; overall task not complete. |
| t3 | "Change the migration manifest acceptance: all six entries must pass validation AND have a rollback note. The first three validations remain valid; no rollback notes exist. How many rollback notes are still needed?" | A / CONTINUE | Answer 6; supersede old acceptance, preserve validated work; changed criteria do not create a new task. |
| t4 | "For this manifest, Owner now selects two checksums per entry instead of one. That decision supersedes the earlier one-checksum choice. How many checksum values are required for six entries?" | A / CONTINUE | Answer 12; new decision active, old decision superseded; selection is not checksum execution. |
| t5 | "A reviewer proposes one checksum per entry again, but has no authority to override Owner's two-checksum decision. For the migration manifest, what remains the authorized checksum count per entry?" | A / CONTINUE | Answer 2; proposal does not overwrite Owner's decision. Record disagreement without treating lower authority as a new selection. |
| t6 | "The operator's manifest report says all six validations and all six rollback notes are now present. Owner has not accepted the report yet. How many validations does the report say are finished?" | A / CONTINUE | Answer 6; distinguish reported work from observed/accepted completion; no automatic terminal completion. |
| t7 | "Owner inspected the migration manifest and accepts all six validations and all six rollback notes. The two-checksum requirement is also satisfied. Is any acceptance item still pending?" | A / CONTINUE | None; accepted evidence supports completed task. No unrelated branch or merge. |
| t8 | "An old pre-acceptance checklist for this same manifest says three entries are pending. It predates Owner's acceptance and provides no new execution evidence. Should that old checklist reopen the task?" | A / CONTINUE | No; keep completed status and latest acceptance. Old-state conflict is resolved by explicit temporal/authority evidence. |

Review: one enduring objective, real partial completion, changed acceptance, authorized
decision replacement and a lower-authority disagreement; no gratuitous task switching.
The t6 operator report alone must not satisfy t7's acceptance obligation.

## F2: switching / icon export versus invoice columns

Family: icon-invoice-switch. Recovery: same-session. Initial catalog: A and B.
A = a2000000-0000-4000-8000-000000000001, export three icon sizes, not yet executed.
B = a2000000-0000-4000-8000-000000000002, verify invoice export columns.
Initial focus A is supplied only under C1; C2's historical records do not name an active task.

| Turn | Exact user message | Attribution / operation | Normative facts and negatives |
|---|---|---|---|
| t1 | "For the icon export, the required sizes are 16, 32 and 64 pixels. Plan the exports; none has run. How many sizes are required?" | A / CONTINUE | Answer 3; A planned, not finished. |
| t2 | "Switch to invoice export verification. Its current required columns are invoice_id and amount. How many columns are required?" | B / SWITCH A to B | Answer 2; do not assign the invoice question to A. C3 creates B on first encounter. |
| t3 | "For invoice verification, the sample file contains invoice_id but not amount. Which required column is missing?" | B / CONTINUE | amount; B incomplete, no modification to icon state. |
| t4 | "Revise invoice acceptance to require invoice_id, amount and currency. No new file has arrived. How many required columns are absent from the current sample?" | B / CONTINUE | Answer 2; replace prior criteria, preserve sample evidence. |
| t5 | "For invoice output, Owner chooses decimal amounts rather than integer cents; supersede the old integer-cents choice. Is integer cents still the selected format?" | B / CONTINUE | No; authoritative decision replacement, not a third task. |
| t6 | "The invoice exporter only proposes adding amount and currency tomorrow. It has not produced a replacement sample. Has either missing column been verified?" | B / CONTINUE | No; plan is not execution, B remains incomplete. |
| t7 | "Owner inspected a new invoice sample: all three required columns are present and amounts use decimals. Accept invoice verification as complete. How many required columns passed?" | B / CONTINUE | Answer 3; B accepted complete; A still unchanged after six intervening turns. |
| t8 | "Return to the icon export after that invoice work. Owner has now accepted the 16 and 32 pixel exports, but 64 pixels is still missing. How many required icon exports remain?" | A / SWITCH B to A | Answer 1; A changes after dormancy, not completed; preserve completed B and its revised criteria. |

Review: billing and graphics remain independent, and different completion/decision
evidence cannot cross tasks. A is absent from attribution at t2-t7; t8 is an SM5 change.

## F3: parallel / atlas captions and audio loudness

Family: atlas-audio-parallel. Recovery: none. Initial catalog: A and B.
A = a3000000-0000-4000-8000-000000000001, supply captions for four atlas panels.
B = a3000000-0000-4000-8000-000000000002, normalize five audio clips.

| Turn | Exact user message | Attribution / operation | Normative facts and negatives |
|---|---|---|---|
| t1 | "Track atlas captions and audio normalization separately. There are four panels needing captions and five clips needing normalization; neither has started. How many items are in each task?" | A,B / CONTINUE | Four panels; five clips. C3 creates two distinct identities, not one nine-item task. |
| t2 | "For atlas captions, Owner accepts the first panel caption. For audio, the operator has only planned a normalization run. How many atlas captions remain, and has audio execution occurred?" | A,B / CONTINUE | Three; no. Do not copy atlas completion evidence to audio. |
| t3 | "The audio run has normalized two of five clips. No atlas work changed. How many clips still need normalization?" | B / CONTINUE | Three; retain A snapshot, B partial completion. Parallel active work is not a MERGE. |
| t4 | "Change atlas acceptance to require a caption and an alt-text entry for every panel. There is still one accepted caption and no alt text. How many alt-text entries are needed?" | A / SWITCH B to A | Four; retain B's two normalized clips, keep A identity despite changed acceptance. |
| t5 | "On audio, two equal-authority reviewers disagree between -16 and -14 LUFS. Owner has not chosen either. Which loudness target is currently authorized?" | B / SWITCH A to B | Neither; unresolved decision conflict within known B, not unresolved task attribution. |
| t6 | "Owner resolves the audio disagreement in favor of -16 LUFS. This settles the decision only; the previous two clips have not been rechecked against it. Are those two clips now verified against the new target?" | B / CONTINUE | No; resolve decision conflict but do not manufacture new execution evidence. |
| t7 | "Owner accepts all four atlas captions and all four alt-text entries. Audio still needs its -16 LUFS verification. Which of the two tasks can be marked complete?" | A,B / CONTINUE | A only; B not completed. Preserve separate task identities. |
| t8 | "Owner now accepts all five audio clips at -16 LUFS. The atlas acceptance remains valid. Are both tasks complete, and should their identities be merged merely because both finished?" | A,B / CONTINUE | Both complete; no merge. Completed concurrently does not imply common identity. |

Review: one message can address two distinct tasks. Task certainty and a disputed
decision inside that task are deliberately separated. Active/focus proposals must not
erase a task that is not mentioned in the next user message.

## F4: new task / release checklist and independent accessibility audit

Family: release-accessibility-create. Recovery: same-session. Initial catalog: A only.
A = a4000000-0000-4000-8000-000000000001, prepare a release checklist.
B = a4000000-0000-4000-8000-000000000002, new independent accessibility audit.

| Turn | Exact user message | Attribution / operation | Normative facts and negatives |
|---|---|---|---|
| t1 | "For the release checklist, plan three checks: packaging, signing and rollback. None has run. How many checks are pending?" | A / CONTINUE | Three planned checks; A not complete. |
| t2 | "Start a new, independent accessibility audit of two screens. It is not a subtask of the release checklist. How many screens are in the audit?" | B / CREATE | Two; birth B, explicitly not BRANCH from A. |
| t3 | "For accessibility, the first screen passed keyboard navigation; the second has not been checked. How many screens still need keyboard testing?" | B / CONTINUE | One; B partial observed work. |
| t4 | "Expand accessibility acceptance: both screens must pass keyboard navigation AND contrast checks. No contrast check has run. How many contrast checks are pending?" | B / CONTINUE | Two; criterion change, same B, preserve first keyboard result. |
| t5 | "For this accessibility audit, plan the missing tests for tomorrow. The plan reports no test execution. Did that plan complete any acceptance item?" | B / CONTINUE | No; retain partial state and revised acceptance. |
| t6 | "An accessibility reviewer says the second screen may fail contrast, but has no measurement. What evidence is still needed before classifying that screen's contrast result?" | B / CONTINUE | Actual contrast measurement; speculation is not observed failure or completion. |
| t7 | "Owner inspected test results and accepts keyboard navigation and contrast on both screens. Mark the accessibility audit complete. How many screens met both criteria?" | B / CONTINUE | Two; B accepted complete. |
| t8 | "Return to the release checklist. There has been no release-check execution or decision change since we left it. How many of its original checks are still pending?" | A / SWITCH B to A | Three; A's exact state retained after six intervening attribution turns; B remains completed. |

Review: B's creation follows an explicit independent goal, not a decomposition of A.
t8 is an SM5 retain opportunity; completing B provides no evidence about A's checks.

## F5: branch and merge / telemetry investigation

Family: telemetry-branch-merge. Recovery: handoff at t5. Initial catalog: A only.
A = a5000000-0000-4000-8000-000000000001, investigate telemetry coverage.
B = a5000000-0000-4000-8000-000000000002, metrics investigation branch.
C = a5000000-0000-4000-8000-000000000003, traces investigation branch.
D = a5000000-0000-4000-8000-000000000004, explicitly merged coverage report.

| Turn | Exact user message | Attribution / operation | Normative facts and negatives |
|---|---|---|---|
| t1 | "For the telemetry investigation, the final acceptance is coverage verified across four services. No coverage check has run. How many services remain unverified?" | A / CONTINUE | Four; A running/planned work, no completion. |
| t2 | "Create a metrics-investigation branch of the telemetry investigation, limited to two metrics endpoints. Work on that branch now. How many endpoints are in its scope?" | B / BRANCH A to B | Two; birth B with parent A; parent mention is a relation, not a second current work target. |
| t3 | "Create a separate traces-investigation branch of the telemetry investigation, limited to three trace paths. Work on the traces branch now. How many paths are in scope?" | C / BRANCH A to C | Three; birth C with same parent A; do not make C a child of B. |
| t4 | "Metrics has one of two endpoints verified; traces has one of three paths verified. Neither branch is complete. How many checks remain in each branch?" | B,C / CONTINUE | One metrics endpoint; two trace paths. Preserve A independently. |
| t5 | "You are the receiving agent. Continue the existing metrics and traces branches using the provided original history; do not create replacements. No new measurements have arrived. How many branch checks remain in total?" | B,C / CONTINUE | Three; handoff preserves historical identities and exact partial state. |
| t6 | "Owner explicitly merges the metrics and traces investigations into one new coverage-report task, superseding both branches. Its acceptance is a verified report covering their five checks. This merge does not execute the remaining checks. How many of the five checks remain unverified?" | D / MERGE B,C to new D | Three; D born by MERGE, B/C proposed superseded, verified evidence remains distinguishable from pending work. A is not merged or completed. |
| t7 | "For the merged coverage report, the author has only planned the remaining three checks and drafted the report. There are no new measurements or acceptance. Is the report complete?" | D / CONTINUE | No; draft/plan is not completion, keep merge identity and source relations. |
| t8 | "Return to the original telemetry investigation, not the merged report. No new evidence verifies its four-service acceptance. How many services remain unverified against that original acceptance?" | A / SWITCH D to A | Four; parent state retained after six intervening attribution turns. Branch progress is not four-service acceptance. |

Review: branches and merge are explicit Owner proposals, not inferred from vocabulary.
The parent and merged task have different acceptance units (services versus checks).
This prevents an invalid arithmetic inference that two verified checks complete services.

## F6: ambiguity and stale evidence / Delta release and Delta dashboard

Family: delta-ambiguity. Recovery: handoff at t5. Initial catalog: A and B.
A = a6000000-0000-4000-8000-000000000001, Delta release smoke test.
B = a6000000-0000-4000-8000-000000000002, Delta dashboard review.

| Turn | Exact user message | Attribution / operation | Normative facts and negatives |
|---|---|---|---|
| t1 | "Owner accepted the Delta release smoke test: all four release checks passed. This is the release task, not the Delta dashboard. How many release checks passed?" | A / CONTINUE | Four; A completed by explicit acceptance, not B. |
| t2 | "Switch to Delta dashboard review. Its three panels need review; none has been reviewed. How many panels remain?" | B / SWITCH A to B | Three; same label Delta is insufficient to merge tasks. C3 creates B. |
| t3 | "For the Delta dashboard, the first panel passed review, two have not been reviewed. How many dashboard panels remain?" | B / CONTINUE | Two; preserve accepted A, B partial. |
| t4 | u4a: "A forwarded note says only 'Delta is ready'. Its sender did not identify release or dashboard, and provided no test or review results. Can that note establish dashboard completion?" u4b: "Separately assign that forwarded note itself to its originating task. There is no additional sender, subject or thread evidence." | u4a B / CONTINUE; u4b UNRESOLVED | u4a: no; the question explicitly concerns B, but does not complete it. u4b: originating task cannot be identified; do not assign A or B by guesswork. No completion change or new task. |
| t5 | "You are the receiving agent for the Delta dashboard. Keep the two unreviewed panels pending and continue the existing dashboard identity from the supplied history. How many panels are pending?" | B / CONTINUE | Two; handoff identity evidence is visible, no rebirth, A unchanged. |
| t6 | "Keep the Delta dashboard's two panels pending. Separately, route this forwarded instruction to its task: 'finish it'. The forwarded instruction contains no subject, thread identifier or sender context." | B plus UNRESOLVED scope | First sentence belongs to B. The quoted instruction is unresolved; A/B may be candidates but neither is assigned for that scope. Do not force every span into B. |
| t7 | "Owner accepts all three Delta dashboard panel reviews. The release task has no new evidence in this message. How many dashboard panels passed?" | B / CONTINUE | Three; B completed; retain A's earlier acceptance without manufacturing fresh release evidence. |
| t8 | "Return to the Delta release smoke test. Owner reports an authoritative rerun on the new build: one of four checks failed. The old acceptance applies only to the old build and cannot close this rerun. How many current-build release checks failed?" | A / SWITCH B to A | One; reopen/block A with failed current-build criterion. Do not keep it completed from stale evidence; B remains accepted. |

Review: t4/u4a is NOT an UNRESOLVED task case; the question names B, while evidence is
insufficient to complete it. The separate t4/u4b is a fully unresolved user unit.
t6 has a precisely bounded unresolved quoted instruction, not an unresolved entire
message. t8 is an SM5 change and an old-state/new-evidence conflict.

## Review disposition and work still required

The narrative review accepts these distinctions as the operational intended semantics.
It does not certify machine-readable labels that have not yet been authored.

Before freeze, materialize and audit:

1. C1/C2/C3 initial input bytes, source IDs and eight reference histories per condition;
   reference UUID births must be real marker text, not merely claimed by oracle metadata.
2. All 144 condition-turn oracles: full state snapshots, resolved/unresolved span quotes,
   active/focus, lifecycle proposals, per-birth identities and forbidden task/operation cases.
3. Explicit state/answer evidence spans with unique source occurrences. Natural-language
   correct-answer variants must not be silently penalized by arbitrary substring tests.
4. SM1-SM6 actual adjacent state changes/retentions, separated by condition and difficulty.
   Candidate SM5 opportunities: F2/F6 change, F4/F5 retain. Verify the gaps mechanically.
5. Exact prompt and runtime settings, model alias provenance and deterministic evaluator
   dependency bytes. Attach delegated authorization and review record only after these
   objects exist. Retain the freeze pin before any experiment, not after seeing outputs.

No validation examples have been authored or inspected in this narrative draft.
