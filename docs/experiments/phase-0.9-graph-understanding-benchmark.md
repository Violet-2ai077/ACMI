# Phase 0.9 Graph Understanding benchmark

| Baseline | Valid changes TP / FP / FN | Recall | Holdout TP / FP / FN | Expected unresolved reasons |
| --- | --- | ---: | --- | --- |
| Rules | 120 / 0 / 150 | 44.44% | 10 / 0 / 10 | 10 / 60 |
| Rules + scripted mock | 160 / 0 / 110 | 59.26% | 10 / 0 / 10 | 40 / 60 |
| Bounded context + structured mock | 270 / 0 / 0 | 100% | 20 / 0 / 0 | 60 / 60 |
| Abstention-first | 110 / 0 / 160 | 40.74% | 0 / 0 / 20 | 10 / 60 |

The comparison counts normalized change signatures after preview; proposal-only diffs are not counted as durable graph mutations. JSON includes WorkNode/decomposition, dependency, branch/join, state, decision and evidence counts. Mock outputs are authored script responses and can encode fixture structure. This measures downstream interpretation and safeguards, not how accurately an actual model generates them.

Across 1,400 case-mode rows: zero unrelated-Task contamination, cross-Workspace leakage, arbitrary-ID acceptance, inferred Result acceptance, inferred Join satisfaction or inferred Task closure. Real Provider requests: zero. The Store subrun verifies 70 cases, including 10 stale-revision and 10 cycle rejections.
