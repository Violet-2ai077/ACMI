# Subagent lifecycle evidence

Stock npm `0.2.2-rc.1` records parent `subagent/catalog` (local v0; external
v2) and child `subagent/descriptor` v3. Parent incarnation and child
id/incarnation come from the catalog coordinate, and the child origin/header
parent and descriptor mode must agree. The index returns source coordinates,
mode-dependent membership, latest causally matched native turn and an explicit
`execution_state_unknown_after_restart` Scheduler state. An external entry is
catalog-only, not a fabricated local Session. No global order across Sessions.

`subagent/start`, `subagent/end`, run ids and result promises are live-only.
No notification is assigned a synthetic Journal sequence or used to accept
results, satisfy a join, or infer waiting. A native `turn/end` describes one
turn; it does not prove Scheduler cleanup, parent inspection, consumption or
acceptance. The existing explicit review and join paths remain separate.

The local upstream reference has a later flattened activation signature and
catalog v3 names. Published package inspection and running stock tests are the
authority for this release; descriptor and catalog projections are version gated.
