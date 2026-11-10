# Explicit Host Task Lifecycle Operations v0.1

Phase 0.9.1 provides a local, opt-in API on `LocalGraphStore`. It does not mount a dsh tool, observe model proposals for writes, modify the installed dsh runtime, or append to the original Session Journal. The legacy integration is unchanged. The API is for a trusted Host after explicit operator selection or approval; it is not a remote or model-facing endpoint.

## Host authority

1. Open the already isolated Workspace Graph Store with `taskLifecycle: { operatorAuthority, currentSession }`. Use an operator authority independent of the Graph Store's read and write authorities.
2. Obtain `store.taskLifecycle(writerGrant, operatorGrant)` in trusted code. Neither a read grant nor either write-side grant alone can use this interface. Do not expose the handle, its grants, or the generic Graph Store writer to a model, tool sandbox, or transport that accepts model input.
3. `currentSession(sessionId)` must resolve the exact operator-authorized, live dsh Session from trusted Host state. It must return `null` for missing, retired, or unauthorized Sessions. Return the real Workspace partition, Session ID, incarnation (`String(header.createdAt)`), and next native sequence (`session.seq`), not strings or coordinates extracted from a prompt or proposal. The API rechecks grants and compares all Session identity fields on confirmation, execution, state reads, and audit reads.
4. After explicit Host approval, `host.confirm(sessionRef, command)` validates and snapshots the exact command and issues an opaque in-process confirmation for that handle. Only `host.execute(confirmation)` can commit. JSON, a model proposal, a UUID from text, or a confirmation from a different handle is not authority. The Host may present a proposal for human consideration, but it must not automatically turn a proposal into a confirmation.

## Operations

| Command | Committed effect | Binding effect |
| --- | --- | --- |
| `create` with `objective` and nonempty `criteria` | Host generates a UUIDv4 and appends the graph's `task-opened` event and a receipt in one transaction. | None; selection is also unchanged. |
| `switch` with `taskId` | Sets the selected candidate for this Session. The target must be an existing, open Task in this Graph Store's Workspace. | None; the prior binding continues to control attribution. |
| `bind` with `taskId` and `expectedRevision` | Checks the exact Session and open in-Workspace Task, then appends a binding revision. | Targets this Task for subsequent attributable work; selection is unchanged. |
| `unbind` with `expectedRevision` | Appends a binding revision whose target is null. | Subsequent work is unresolved rather than falling back to another assignment; selection is unchanged. |

`reopen` is not exposed. The current Task Graph reducer has no Host reopen event. Closed Tasks cannot be newly selected or bound. A previously recorded binding remains an audit fact after a Task closes; it does not admit new forward attribution to that closed Task.

For example, after the Host has approved the exact action and established trusted `sessionRef`:

```ts
const host = store.taskLifecycle(writerGrant, operatorGrant)
const creation = host.execute(host.confirm(sessionRef, {
  kind: 'create', operationId: 'operator-request-41',
  objective: 'Verify release readiness', criteria: ['Report blockers'],
}))
if (creation.kind !== 'create') throw new Error('Unexpected receipt kind')

// A different, separately approved Host action; creating the Task did not bind it.
const { binding } = host.state(sessionRef)
host.execute(host.confirm(sessionRef, {
  kind: 'bind', operationId: 'operator-request-42',
  taskId: creation.taskId, expectedRevision: binding.revision,
}))
```

## Revisions, replay, and attribution

- The Host binding revision starts at 0 per exact Session incarnation. `bind` and `unbind` compare-and-swap the expected revision; each committed operation appends `revision + 1`. Creation and candidate selection do not increment it. A recycled Session ID does not inherit any previous incarnation's state.
- Supply a stable Host-generated `operationId` for each action. An identical command with the same ID and exact authorized Session returns its original receipt without reapplying. A different command with that ID fails with `conflict`. For a response lost after commit, obtain a fresh confirmation with the same command and ID after reopening the store. A stale failed command did not commit; obtain current state and a fresh approval rather than silently rewriting the command.
- Bind/unbind confirmation captures the next native sequence. The first Host binding revision requires a fully drained Session so a pending native Binding cannot be hidden in backlog. Later mutations require the live sequence to match, the ingested cursor not to be ahead, and the boundary not to precede the prior binding boundary. Durable attribution uses the last effective binding at or before each fact's sequence; older facts are not reclassified. Revisions at an identical boundary resolve to the newest one.
- Subsequent turn-scoped steps, messages, and tool calls within a previously opened turn keep that turn's attribution; turn endings and tool results keep their existing original-turn/original-call rules. A missing original cause is unresolved. Host-managed unbind suppresses assignment fallback for new work, not existing causal links. No legacy cursor revision or Session Journal row is synthesized by the Host API.
- A Session with an existing native Journal binding cannot enter Host-managed binding. Once Host-managed, a later native binding fact is rejected rather than merged. Use a distinct operator-approved Session for this mode; do not enable legacy native binding writes for it. Opening an already managed Graph Store without the Host configuration disables the Host writer but still honors committed bindings and refuses native mixing on those incarnations. A fresh store without the configuration neither opens the Host API nor starts any binding.

## Audit and failure boundary

The Workspace Graph Store contains an append-only success receipt ledger. A receipt records the Session identity, Host operation ID, kind, target, command digest, UTC commit timestamp, ordered ordinal, and before/after selection and binding. Bind/unbind also record the first effective native sequence; create records the opening graph revision. `host.history(sessionRef, after, limit)` returns bounded, ascending receipts for the exact authorized live Session and checks their consistency. Audit queries from the first page can follow each recorded transition. Rejected or rolled-back commands return errors to the caller and produce no committed receipt.

The ledger and graph share one existing SQLite database and a `BEGIN IMMEDIATE` transaction for each command. A failure before commit rolls back both the mutation and its receipt. After commit, a lost response is resolved by retrying the original command. For a committed binding, undo is a **new**, explicitly approved `bind` or `unbind` with the current revision, never a deletion or an in-place edit. For creation, no rollback of an already committed Task or auto-close is provided. The ledger's integrity checks are not a signature or protection from an operator who can modify the isolated SQLite files. These guarantees do not cover writes by an older binary that does not enforce the ledger, a second system, or the original Journal.

The implementation has no automatic proposal apply, accepted result, satisfied Join, task closure, provider call, or production context injection. The Host API and forward attribution are tested with isolated synthetic Sessions and a temporary Graph Store.
