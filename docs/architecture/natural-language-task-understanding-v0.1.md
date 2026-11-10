# Natural-language Task Understanding v0.1

Qualification measures two separate outcomes: the raw offline predictor's
interpretation of a bounded dialogue, and whether trusted validation allows
the corresponding proposal. An invalid or rejected output is not a correct
prediction. The five intent classes, target Task ID, advisory graph claims,
and evidence roles remain separate. A routing answer is never an operation.

The provisional corpus uses individually authored Chinese, English and mixed
dialogues with workflow variation, omissions, contradictions, and deliberate
unresolvable cases. The packaging generator assigns stable case/Task IDs,
validates scope and split groups, and computes deterministic hashes; it does
not expand templates or call a model. Labels are AI provisional, not human
ground truth. See the [annotation guide](../annotation/task-understanding-label-guide-v0.1.md).

The evaluator sees at most 16 recent turns, up to eight approved candidates
and bounded graph/evidence metadata. Under budget pressure it drops old turns;
when the minimum packet does not fit it does not call an adapter. Tool and
Subagent message bodies never enter the prompt packet. Shadow reads the
committed dsh suffix but neither submits a proposal nor mutates a Task.
