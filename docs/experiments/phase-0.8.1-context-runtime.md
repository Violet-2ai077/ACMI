# Persistent dsh context validation

The first request of a genuinely fresh stock Agent/Session includes the
prepared package from the reopened graph. It contains the Task A
objective, confirmed next action and package hash, and excludes Task B
and raw source/tool markers. A changed stream revision invalidates the
prepared snapshot. Re-preparing the same valid revision is idempotent;
refreshing after a new revision yields a new snapshot. A fresh Session
with a tiny budget or expired package still sends its normal request.

After revoking access on the target Session that already received an
ACMI package, the observer finds no new ACMI contribution; the stock
model request nonetheless still contains its **prior** package as native
history. Source and Built both check this distinction. Do not reuse
such a Session when that history must no longer be disclosed. No
supported cleanup hook or production admission is claimed.

See [architecture](../architecture/persistent-context-runtime-v0.1.md)
and [snapshot limits](../architecture/context-snapshot-lifecycle-v0.1.md).
Source/Built are the ACMI TS/compiled entry points; the dsh modules in
both cases are the same published stock package. The bounded timing
witness measures the small request callback; cold graph read, assembly
and serialization are not performed by that callback.
