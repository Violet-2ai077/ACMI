# Trusted runtime ingestion

`RuntimeFact` v1 is separate from `GraphChange` and `GraphProposal`. The pinned
dsh adapter normalizes native rows into closed metadata variants. Strict
validation checks partition, complete source coordinate, event kind and
variant fields. Full user/assistant messages, tool arguments/results,
runtime-context bodies and provider payloads never enter the fact store.
An unrecognized native event advances the contiguous cursor as `unmapped`.

Identity is adapter + instance (opaque marked Workspace partition) + Session
ID + native header `createdAt` incarnation + Session-local seq. The fact ID
hashes that tuple. This is not global order or a source authenticity signature.
The source revision is a stable epoch for that admitted Session incarnation;
the local seq identifies a row in that epoch. SQLite records observation time
separately, not an invented occurrence time. The graph stream has its own
independently allocated order and source-revision chain.

Trusted host code explicitly attaches a live Session object and may supply
a Task/WorkNode association. Association does not write a dsh Binding. Native
explicit Binding records are validated forward and take precedence for
subsequent attributed facts. Ambiguous user messages are unassigned unless
the host supplied a matching source assignment. Tool results must resolve
an earlier exact same-epoch call seq with matching turn/step/call ID and
single result use; they keep the call's attribution across switches. Terminal
turn events similarly consult the recorded turn-open identity. Unassigned
facts are bounded and inspectable without guessing Task membership.

The hook buffers `session/event` notifications for attached Sessions only.
The host calls `drain`: stock Session flush and writer identity/path checks
precede graph writes. Each native row, assignment, graph references and cursor
commit in one local transaction. The dsh writer and graph DB do not share a
transaction. A crash after native flush but before graph commit is recovered
by a host-driven reconciliation of that one Session. Normal drains consume
only their live suffix and do not decode historical Journals.

Initial attach/reload/gap recovery can decode one bounded guarded Journal;
reconciliation checks incarnation, inherited boundary, persisted watermark
and the last normalized anchor before replaying the missing suffix. Inherited
rows are never duplicated. A gap, overflow, disagreement or missing native
row is explicit; no synthetic seq or blanket "exactly once" claim. Queues
are bounded to 32 attached Sessions and 2,048 buffered notifications.

With an explicit valid node association, turn-open derives an
AgentExecution start; its matching end may derive a terminal execution.
Child association checks native child origin and live parent identity against
the recorded parent execution. This does not complete the logical WorkNode,
create a verified WorkResult, accept it, satisfy a join, or move mainline.
See the [capability matrix](../experiments/phase-0.8.1-runtime-event-ingestion.md).
