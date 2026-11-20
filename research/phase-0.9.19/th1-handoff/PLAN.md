# TH1: task-local history, compaction, and scoped memory

This is a new synthetic pilot, not a rerun of TC5, a production write, or a
change to any old gate. No human transcripts, credential values, or oracle
labels go to the model. Use the previous opencode-go / deepseek-v4.1-flash
research route. 24 model calls maximum, no retries, no repairs. Stop on
transport/evidence failure. Preserve semantic failures. Freeze source and
dependency hashes before the first call.

Two counterbalanced five-turn sessions describe similar print jobs. Reverse
the birth order, swap the tasks' two revision histories, and change the global
footer between sessions. One turn changes both a task-local fact and a global
preference. A third (unseen) job is used only for a memory transfer probe.
The trials are paired variants, not independent population samples.

1. Sender gives a normal short answer, a self-assigned stable task tag and
   proposed workspace-memory writes in one generation. No task directory.
2. Use the tag from the target's known opening turn as the lookup handle:
   selecting a target is explicit; discovering what the user wants is not
   under test. Stable-filter by actual tag, no relabeling or time sorting.
   Measure purity AND coverage/sequence against hidden authored event IDs for
   both jobs. These are chronology checks, not arbitrary causal recovery.
3. Index proposed memory by exact key, last-write-wins, with source turn; do
   not whitelist individual keys or sanitize incorrect values. Reopen from disk.
4. New receiver requests, no sender reasoning or shared message history:
   mixed public transcript; actual filtered transcript + actual global memory;
   actual compact of that filtered transcript + actual global memory; authored
   compact + authored memory as a positive control. Same receiver instructions.
   Full baseline has both tasks and their global edits but no model tags/memory.
   Measure context bytes, ordered local change trail, rendered latest delivery
   and footer exactly. Rotate arm order. Compact is a separate, measured model
   call, not a hidden repair. Compare to source for actual size reduction.
5. Fresh third-job query with only reopened memory vs no memory. Check transfer
   of the latest global footer and abstention on local seals. Also inspect
   stored keys/values directly, not just the final answer.

Local success requires exact both-task separation, exact/source-grounded
latest global memory with no other keys, correct filtered and compact handoff,
smaller compact than filtered context, and both third-job contrasts in both
variants. Full/gold are interpretation controls. A full-context tie is not a
quality improvement. No general or cross-workspace memory claim. Freeze
evaluator and inputs; do not regrade or retry an incorrect model answer.
