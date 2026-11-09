# Task-aware Compact integration

**Level B only, synthetic experiment.** At dsh `0.2.2-rc.1` the documented
`ctx.systemPrompt.context(PromptContext)` registry contributes dynamic
user-role operational context at request assembly/admission. It is not a
pre-/post-Compact augmentation hook. A provider-specific replacement of the
compaction backend or summarizer is not used.

The host calls `registerSyntheticTaskRecovery` explicitly with
`enabled: true`, `synthetic: true`, pinned runtime, a marked dedicated
journal root, the authorized graph scope, and a live target Agent in that
Workspace. The normal plugin never registers it. The callback verifies exact
Agent identity, live Session, Workspace and the scoped graph cut. It returns a
literal package only on success. Disabled/mismatch/assembly error/budget
failure does not replace baseline Compact or block the normal request.

The runtime may append its own `runtime-context` snapshot to the **target**
synthetic Journal. A retained unchanged snapshot is not duplicated; a
shadowed snapshot can be re-admitted by stock dsh. Idempotence means a stable
package/hash and one live effective contribution, not zero new native
compaction events. ACMI does not edit the original journal; stock Compact
appends its own start, summary, replace and end events. Unregistering is not
retroactive erasure of an already committed target snapshot. No claim of
hostile Windows path protection, production opt-in, or token pricing by dsh.

See the [runtime evidence](../experiments/phase-0.8-dsh-compact-hook-investigation.md)
and [recovery evidence](../experiments/phase-0.8-cross-session-recovery.md).
