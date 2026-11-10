# Phase 0.9.3 Shadow operations

The layered dsh Shadow is an explicit read-only call for isolated synthetic fixtures. It is **default-off**: absent `enabled: true`, absent `synthetic: true`, or a nonmatching stock runtime version returns `disabled`. No normal `dsh` plugin path invokes it. Do not point it at the installed user's Session root, enable production Context Injection, or supply a real Provider.

1. Use the reproducible [Source/Built fixture](../experiments/phase-0.9.3-runtime-shadow.md). It creates an isolated Journal and Graph root and a local scripted loop; no `dsh` installation or user profile change is needed.
2. A trusted fixture Host calls `createDshLayeredShadow` with scoped **read** access, an authorization callback, a Task ACL, a current revision/epoch reader and a bounded local catalog reader. Do not pass a writer, credential or network-backed callback. Bind the callbacks to the same Workspace, Session incarnation and authorized scope.
3. After the native Host has drained and committed the trusted delta, call `observe` with the committed last cursor, previous cursor boundary, the native `turn/start` + user message + completed `turn/end`, and up to 12 preselected fact coordinates. The warm path never enumerates the Journal. `host_event` is a separate trusted Host-only envelope; do not construct it from user or tool text.
4. `evaluated` returns observational layer outputs and input size/work metrics. An `objective-refined` or other valid draft is not an Inbox item or permission to apply anything. Preserve the exact before/after snapshot per invocation; changes made by the fixture before or between those windows are not shadow writes.
5. Compare gated metadata against `trigger: 'ungated'` using separate instances. A `skipped` metadata event advances only the observation boundary. Required user and causal events are never skipped by keywords. `cursor % 8 === 0` samples Host metadata through the layered path.

| Status | Operator action |
|---|---|
| `disabled`, `unavailable`, `stale` | Do not bypass authorization. Recheck fixture flags/version, Session incarnation, committed cursor, current Binding/Graph, candidate/authorization epoch and Task ACL. Do not use old output. |
| `duplicate` | No action. The same checkpoint is not analyzed again. |
| `collision` | Stop using this cursor and reconcile the isolated Host observation. Do not submit either result. |
| `busy_session`, `busy_global` | Apply Host backpressure. The shadow keeps no queue; retry only from a still-current scoped cut. |
| `cancelled`, `failed` | No checkpoint advanced. Observe in-flight metrics and let outstanding cooperative work settle. Close the instance to cancel all observers; do not increase limits to hide a stuck reader. |

Any changed Journal or Graph hash, Binding/Proposal change, unexpected file, network call, or real Provider request is a stop condition. Disable/close the shadow, preserve sanitized evidence and investigate. Do not repair the original Journal or apply a draft as part of recovery. Delete only the fresh fixture directory whose resolved path is verified under the test temp root.
