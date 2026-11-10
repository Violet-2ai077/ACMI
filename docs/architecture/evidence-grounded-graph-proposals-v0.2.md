# Evidence-grounded Graph Proposals v0.2

## Boundary and API

`validateLayeredClaims(context, graph, draft)` is a deterministic Core validator for
**review-only** observations and drafts. `context` is a trusted, bounded
`UnderstandingContextPackage`; `graph` is a Host-supplied `LayeredClaimGraph`
read snapshot; `draft` is untrusted, bounded, decoded JSON. An analyzer must not
supply the context, graph, actor, evidence role, or graph revision used as authority.
The Host still needs to compare its live cut before using or displaying a receipt;
the validator cannot discover subsequent changes to an older trusted snapshot.

The draft echoes all ten cut fields and carries at most 16 claims. Each claim has
an ID, an issued active `taskHandle`, a claim kind, exact kind-specific fields, and
one to four evidence links. Unknown fields and kinds fail schema validation. A
valid active handle must be unique, open and bindable in this package; only exact
turn evidence in the current Host-bound Task can ground a text-based proposal.
This validator does not select or bind a Task or authorize cross-Session access.

Output is a frozen receipt, not an operation. Each claim has a relationship
(`supports`, `contextualizes`, `contradicts`, `insufficient`), explicit
`review_only` or `unresolved` uncertainty, a reason and any
verified sources. Each verified source has an actor, type, role, ID and source
revision; textual sources also have a UTF-16 half-open span and protected
`{ id, digest }` excerpt reference. Raw excerpts and proposed claim payloads are
not returned. `draft` means every claim was supported for review only; an empty
or malformed draft `abstain`s, an unsupported claim leads to `clarify`, and
stale scope, contradictory evidence or invalid batch topology leads to
`unresolved`. Do not partially apply the supported claims in a non-draft batch.
No outcome provides Host authorization, schedules work, or emits Graph Events.

## Exact statement subset

The validator checks exact content and surrogate-safe bounds against the trusted
current turn, and compares its full digest and source revision. A text-based
claim must cite the complete current message, not a cherry-picked positive span.
Separating clauses by semicolons or lines is permitted only when **all** nonblank
clauses match this batch's explicit claim forms. Question, quotation, condition,
hypothetical and negation fences intentionally decline rather than attempt broad
natural-language inference. A matched explicit user rejection is counterevidence
for acceptance, not support. A constraint can itself be negative; a negated
instruction to record the constraint cannot ground it. Partial approval and
supersession are not silently promoted to full acceptance.

| Claim kind | Exact scripted turn form | Main restrictions |
| --- | --- | --- |
| `decision-proposed` | `Suggest decision ID for TOPIC: TEXT` | User or Assistant suggestion, new ID and no active duplicate; not acceptance. |
| `decision-accepted`, `decision-rejected` | `Approve decision ID for TOPIC: TEXT`, `Reject decision ID for TOPIC: TEXT` | User only; exact scoped decision, topic, text and valid predecessor state. Accept cannot bypass an existing accepted same-topic decision. |
| `decision-superseded` | `Supersede decision OLD with NEW for TOPIC: TEXT` | User only; new ID and changed text, current accepted head, same Task/topic, acyclic lineage with no competing successor. Requires a Host-certified complete lineage view. |
| `objective-refined` | `Refine objective: OBJECTIVE` | Bound active Task; no new Task or lifecycle operation. |
| `worknode-proposed`, `branch-proposed` | `Propose work draft:ID under PARENT: TITLE`, `Propose branch draft:ID under PARENT: TITLE` | Existing open WorkNode parent; fresh local draft ID only. |
| `worknode-refined` | `Refine work ID: OBJECTIVE` | Existing scoped non-completed WorkNode. |
| `work-transition` | `Set work ID to STATE` | Valid transition of existing work, not a Task closure or a Join. |
| `constraint-proposed` | `Record constraint for TARGET: TEXT` | Target is `task` (current bound Task) or a scoped non-completed WorkNode. |
| `next-action-proposed` | `Propose next action for ID: TEXT` | Explicit scoped non-completed WorkNode, not execution authority. |
| `dependency-proposed` | `Work FROM depends on TO` | Direction is dependent to prerequisite; scoped distinct existing work, no duplicate. |
| `join-proposed` | `Configure join ID all-of A, B` (or `any-of`) | Existing pending/blocked unconfigured Join, 1-8 distinct scoped WorkNode prerequisites, supported predicate. Not a Join satisfaction claim. |

An Assistant suggestion can only qualify the suggestion state if its exact
content is separately available as trusted input. The default packet builder
does not expose raw Assistant or Tool content. These explicit forms are a narrow
testable guard, not a production natural-language interpreter. Paraphrases,
role ambiguity, unresolved references, correction versus new work, implicit
approval and out-of-form requests remain unresolved here. Current examples in
Chinese such as conditional approval or a question are tested as non-approval;
the validator does not claim general Chinese-language understanding.

## Typed runtime and graph checks

`execution-completed` requires an `execution-completed` or `subagent-completed`
fact with the same workspace, Session/incarnation, Task, WorkNode and cause.
`result-observed` only records matching `tool-result` metadata. The
`result-produced`, `result-inspected` and `result-consumed` claims each require
their own distinct trusted fact kind, scoped result ID and cause; a previous
stage cannot substitute. Citing a fact requires its exact ID and source
revision in the bounded packet, not merely a tool call name.

`result-summary-proposed` requires a separately available Host-controlled,
approved bounded excerpt (no raw tool stream), its exact span/content digest,
and a causal `tool-result` or `result-produced` fact with the same content digest
and revision. Only the complete protected excerpt can support the extractive
summary proposal. This is not verification of the result's truth. Metadata
alone cannot justify content. `result-accepted`, `join-satisfied` and
`mainline-advanced` are never grounded as new states by this validator; even a
valid reference remains contextual and awaits the separately authorized Host
workflow. Execution completion and output consumption have no such side effect.

The Host supplies a closed, bounded topology view for dependency and Join
proposals. Incomplete topology, unknown endpoints, duplicate proposals,
decision-lineage conflicts, or a cycle in the existing-plus-proposed batch
fail closed. Join inputs are oriented as prerequisites for cycle detection.
Current caps are 512 nodes, 2,048 edges, 512 decision/result records each, a
1,024 UTF-16 unit protected result excerpt, and at most eight prerequisites per
Join. No global catalog, Journal, provider, writer or network is accessed.
Resource caps are guard limits, not a production latency measurement.

## Verification and limits

`pnpm exec vitest run packages/core/tests/layered-claims.test.ts` covers valid
explicit drafts; changed cut fields and graph scope; forged, shortened and
surrogate-splitting spans; false approval from actor, question, quote, negation
and condition; result metadata and typed lifecycle separation; protected
summary; invalid direction, transition, Join and supersession; duplicate and
conflicting drafts; and generated chain DAGs where every closing edge must be
rejected. These are deterministic synthetic contract tests. They do not measure
model quality or authorize a real provider, old Holdout replay, durable Shadow
behavior, automatic Binding or Graph mutation.
