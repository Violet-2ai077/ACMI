# Persistent Context Runtime

Host preparation obtains a scope-checked cut from the persistent Task
projection, not from the target Session's chat history. The existing
deterministic Context Assembly policy builds a budgeted package with
provenance, source revision, policy version and package hash. The host
prepares off the synchronous request callback, so a cold open, checkpoint
recovery, serialization or Journal read is never triggered by that callback.

Use `registerPersistentDshRecovery` only with explicit synthetic opt-in,
the pinned runtime, marked isolated Journal root, separate graph store and
the exact target live Agent. Registration is not part of the default ACMI
plugin. Store miss/error, closed/revoked scope, mismatching Agent or
incarnation, changed graph/source revision, expiry and insufficient budget
produce no new ACMI contribution. Preparation can refresh a snapshot; the
callback never silently rebuilds one.

The hook is public `ctx.systemPrompt.context(PromptContext)`, a **Level B**
dynamic request contribution. It is not an additive native pre-Compact
hook. The original Compact backend, summary and Session writer are
untouched. Package text is labelled historical evidence, not instructions.
See [snapshot lifecycle](context-snapshot-lifecycle-v0.1.md) for the
important same-Session revocation limitation.
