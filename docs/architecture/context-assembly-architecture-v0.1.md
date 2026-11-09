# Task-aware Context Assembly

Inputs are an explicit Task UUID, host-authorized WorkspaceScope and reader,
optional assertion of the active WorkNode, a budget, policy version and an
explicit dependency toggle. The active node is the trusted mainline pointer;
unknown, ambiguous or incomplete state is not guessed. The engine reads one
projected Task cut, not a raw Session store. It never enumerates unrelated
Tasks, social messages, unattributed records or other Workspaces. The absence
of these records is by construction, not a claim to have scanned and counted
them. A relevant unknown must be entered as a scoped unresolved fact without
assigning the ambiguous original message to the Task.

- Tier 0: objective/criteria, active work, execution/wait, blockers, active
  constraints, required transient state and unresolved evidence. Incomplete
  source cuts or insufficient budget fail closed.
- Tier 1: validated next action, accepted decisions with rationale, required
  accepted results, related WorkNode state and verified artifacts. Next action,
  decisions and accepted dependencies sort ahead of bulk optional items.
- Tier 2: active/predecessor progress, verified causal Tool outcomes supplied
  by the host, less-relevant nodes and essential unreviewed dependency output.
  Raw transcripts, provider payloads and arbitrary Tool arguments are not read.
- Optional artifacts, Tool summaries and progress have a bounded Unicode-safe
  excerpt. Critical items and all source references stay whole.

Explicit supersession is an event, not a last-write-wins heuristic. Competing
accepted decisions in one relevant topic or an explicit dispute become a
conflict citing all sides. Superseded/rejected/stale candidates are not
presented as active. Accepted dependency output cites the selected producer
result and review transitions. A still-unreviewed essential output for the
active node is labelled separately; unaccepted speculative successors are
omitted without expanding a result-by-join Cartesian product.

The projection caches its immutable cut and invalidates it on any new
delivery. Retrieval and candidate building operate on bounded projected state,
not accumulated raw Session history. The dsh experiment has a single-entry
cache confined to one registration, scoped reader, request and policy; source
revision, graph version and Task/Workspace identity are embodied in its
immutable cut key. Authorization is rechecked before a cached package is used.
Project/Knowledge Memory, automatic attribution, graph inference and live
cross-Task revision propagation are future work.
