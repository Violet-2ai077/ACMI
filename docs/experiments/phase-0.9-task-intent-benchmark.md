# Phase 0.9 Task Intent benchmark

350 cases, 35 templates, 10 variants each: development 140, validation 80, holdout 130. Partitioning is by family/template and disjoint Task fixtures. Generator version `phase-0.9-synthetic-v1`, seed `0x090b21`, canonical corpus SHA-256 `34d9cf27ad9f33d78adb650ecd4cadd9876009459e2c9c51fa2552094a03b766`. Labels are `synthetic_generator_defined_not_human_reviewed`.

The four modes share the deterministic routing gate. The fixture distribution intentionally exercises its known cue classes and ambiguous controls, not real natural-language accuracy. No rules were tuned to improve holdout scores. Fixtures cover A/B/A in one Session, cross-Session resume, similar objectives with separate work, correction, acknowledgement, ambiguous intent and budget refusal.

| Class | TP | FP | FN | Precision / recall / F1 |
| --- | ---: | ---: | ---: | --- |
| continue_current | 190 | 0 | 0 | 1.000 / 1.000 / 1.000 |
| switch_existing | 30 | 0 | 0 | 1.000 / 1.000 / 1.000 |
| create_new | 20 | 0 | 0 | 1.000 / 1.000 / 1.000 |
| no_task | 20 | 0 | 0 | 1.000 / 1.000 / 1.000 |
| uncertain | 90 | 0 | 0 | 1.000 / 1.000 / 1.000 |

For each mode: 220/220 candidate selections, 0 false merges, 0 false splits, 90/350 abstentions (25.71%). In this benchmark a false merge means assigning new work to an existing Task or selecting the wrong existing UUID; a false split means new Task instead of a labelled existing Task. All modes use the same route by design. Machine-readable per-split counts and hashes are delivered with the corpus.
