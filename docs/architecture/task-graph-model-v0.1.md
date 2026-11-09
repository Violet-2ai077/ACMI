# Task Graph v0.1

Task UUID is durable; a Session is an evidence source. A trusted host selects a
Task stream in one Workspace. One stream may cite multiple Sessions, and each
Session may contain evidence for different streams. Nothing scans a Session to
infer the current Task.

| Entity | Identity and responsibility |
| --- | --- |
| Task | Existing v4 Task UUID, objective, criteria, open/closed and explicit mainline position |
| WorkNode | Task-local ID, role, logical lifecycle, attempt, latest transition |
| AgentExecution | Concrete interval with execution ID, node attempt, Agent identity, source Session/incarnation, optional parent, independent status |
| WorkResult | Immutable typed summary, producer execution and attempt, verification flag and production ref |
| ResultReview | Consumer node/attempt and result ID, ordered source refs for each review stage |
| Join | WorkNode with explicit prerequisites and a separate satisfaction ref |

Typed WorkNode relations are `decomposes_into`, `depends_on` (consumer to
prerequisite), `continues_as` (mainline predecessor to successor),
`joins_into` (branch to join), and non-gating `references`. Each structural
relation is acyclic independently; reference cycles are allowed and not
traversed. Execution parent and result producer/consumer are typed entity
references, not WorkNode edges. A cross-Task receipt pins one verified,
completed, current-attempt result and its producer revision; it is not a
live query or a graph-to-graph traversal.

`TaskGraph` implements the reader and writer interfaces without disk access.
The host owns durable appends, stream sequence allocation, attributable source
verification, checkpoint storage, and trusted SHA-256. Session-local seq is
provenance, never global ordering. Contiguous Task stream seq plus optional
`after` refs to applied earlier changes govern projection. Deliveries are
buffered behind gaps; exact duplicates are no-ops; conflicting slot/ID reuse
invalidates the stream. Unsupported or impossible events at committed positions
are recorded as unresolved; they do not apply, even when later events arrive.
Corrections must be new events. No automatic Binding/Attribution writes.

A checkpoint is a detached, serializable projection plus sequence/ID/hash
receipts. Restore checks scope, identity, version and checksum before applying
a suffix. This is local integrity, not a signature or a substitute for trusted
storage. A checkpoint is not a full historical timeline: retain the append-only
graph stream for replay and audit. There are 4,096 positions per stream and
24,576 serialized UTF-16 units per event in this prototype. A host must surface
limits, gaps and conflicts rather than dropping events.

Ingestion is a **privileged host operation**, not a tool/model API. The host
must verify origin/source ownership, validate causal Tool Call/Result pairs and
use `captureDependency` for new cross-Task receipts. Replay consumes the
previously approved receipt bytes, not an unrestricted producer lookup.
Receiving a JSON event or a same-Workspace read scope from a client does not
authorize writing. No durable graph store or dsh event-to-graph inference is
provided in Phase 0.8.
