# Task Understanding proposals

`proposeGraphChanges` is a pure Core operation over a cut and a bounded delta
(last 64 already-authorized facts). It does not receive the store, a writer
grant, a filesystem API, a model client, or raw messages. A single versioned
proposal is derived from a strictly validated structured suggestion and its
fact reference. With no hint, a grounded failed-turn rule may propose
inspecting the failure; otherwise the result is unresolved.

Supported proposals: objective/criteria reframe, bounded decomposition,
same-Task dependency or join edge, mainline advance, result production
(unverified), explicit result review stage, join satisfaction, decision
and next action. Proposed events are a preview, not state. A runtime
reference establishes that the event was observed, not that proposed prose
was in the message. No automatic natural-language attribution or lifecycle
inference is claimed. Bootstrap of a new Task remains an explicit host action.

Proposals bind Workspace, Task, stream revision, projected source revision,
policy, normalized suggestion and exact runtime evidence. A deterministic
digest identifies an identical proposal on the same revision. Provenance is
`heuristic_proposed` (never a self-rated confidence); its evidence is
`runtime_observed`. The proposal marks confirmation as mandatory.

The host-only `review` requires a distinct write grant. It rereads the exact
assigned fact from the store, regenerates the canonical proposed diff, checks
revisions, and runs the graph reducer for allowed transitions and cycles.
An explicit acceptance writes all changes and the review receipt in one
transaction. Rejection writes only the immutable review receipt; retries of
the same proposal return that disposition, including across restart.
Tampering/stale revisions are typed failures, not permission to rebase a
proposal silently. Accepted events use `host_confirmed` and cite proposal ID.
No model or runtime tool is given either the store writer or review API.
