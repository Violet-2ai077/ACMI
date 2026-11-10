# Phase 0.9 proposal review

From the authorized local Host, call `store.listUnderstanding(readGrant, taskId)`. Inspect `proposal.intent`, `changes` (stable change IDs plus actual GraphEvent diffs), `evidence`, `unresolved`, and `risks`. Check the graph and source/candidate revisions. Do not treat a synthetic excerpt or Runtime Fact as independent proof of the proposed conclusion.

After review, explicitly call `store.reviewUnderstanding(writeGrant, id, { decision: 'accept', reviewerId, reason })` or use `decision: 'reject'`. To leave unresolved, do not call the write endpoint. The exact command may be retried after loss of ACK. A different terminal decision is a conflict. If stale, review a new proposal generated from the current graph and exact evidence; never bypass the CAS. Accepting an intent alone only records a receipt and cannot switch Binding or create a Task.

Use `store.stageUnderstanding(readGrant, writeGrant, request)` for an explicit synthetic source ID when the worker has not attributed it. Unassigned user evidence permits only intent, not a graph diff. The API is Host-only, not a model tool or Observer write endpoint.
