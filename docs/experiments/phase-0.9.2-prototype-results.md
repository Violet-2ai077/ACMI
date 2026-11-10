# Phase 0.9.2: Offline prototype results

**Result:** Hierarchical scoping improved false merges. Cursor/revision state improved replay handling, and a recent list recovered the constructed A/B/A turn. The hard trigger reduced examined candidates but dropped valid work. The ungated stateful ablation was the stronger comparator on these fixtures, not a qualified product configuration.

## Dataset and reproduction

- Development: 4 scenarios / 21 turns. Validation: 4 separate scenarios / 25 turns. Newly authored synthetic English observations, separate task identities/storylines across splits. Labels: `ai_provisional_not_human_reviewed`; no human annotation, no historical corpus access, no old or new holdout scoring, 0 Provider requests.
- Fixture artifact SHA-256: `2749f4826a839310f583695d2ab5c551427c6de891debf45115884468bbf0753`.
- `node --test scripts/phase-0.9.2/prototype.node-test.mjs` checks the prototype locally. `node scripts/phase-0.9.2/prototype.mjs <new-output-directory>` emits observations, traces, comparison and limitations. Counts should replay exactly; latency varies by machine/load. Run with Node v24.16.0 on Windows x64.

## Routing, coverage and abstention

| Split | Configuration | Exact route + ID | Commitment coverage | Correct among commitments | Resolvable commitment recall | Abstention precision / recall | False merges | False splits |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Dev | Flat | 16/21 | 12/21 | 8/12 | 8/9 | 3/4; 3/6 | 4 | 1/8 |
| Dev | Hierarchical | 19/21 | 9/21 | 8/9 | 8/9 | 6/7; 6/6 | 1 | 1/8 |
| Dev | Event/state hybrid | 19/21 | 9/21 | 8/9 | 8/9 | 6/6; 6/6 | 1 | 1/8 |
| Dev | No-trigger ablation | 20/21 | 10/21 | 9/10 | 9/9 | 6/6; 6/6 | 1 | 0/8 |
| Val | Flat | 21/25 | 14/25 | 10/14 | 10/11 | 5/5; 5/5 | 4 | 0/10 |
| Val | Hierarchical | 21/25 | 13/25 | 10/13 | 10/11 | 5/6; 5/5 | 3 | 1/10 |
| Val | Event/state hybrid | 20/25 | 8/25 | 7/8 | 7/11 | 5/6; 5/5 | 1 | 4/10 |
| Val | No-trigger ablation | 23/25 | 11/25 | 10/11 | 10/11 | 5/6; 5/5 | 1 | 1/10 |

A commitment is a `continue`, `switch` or `create` result. Exact requires both route and selected ID. `uncertain` only counts as correct when the expected route is `uncertain`. A false merge is a wrong selected existing ID (including one selected for an expected non-ID outcome); a false split is a resolvable existing-task turn emitted as create, uncertain or no-task. These are turn-level failure proxies, not clustering statistics. Rejection by the guard is not a correct route. `n/a` represents a zero denominator.

## Trigger, state, work intent and work cost

| Configuration | Trigger recall Dev / Val | Analysis rate Dev / Val | Turn act exact Dev / Val | Work intent exact Dev / Val | Validation state checks | Candidate comparisons Dev / Val |
|---|---:|---:|---:|---:|---:|---:|
| Flat | 16/16; 17/17 | 21/21; 25/25 | 20/21; 22/25 | 20/21; 22/25 | unsupported | 35; 45 |
| Hierarchical | 16/16; 17/17 | 21/21; 25/25 | 20/21; 22/25 | 20/21; 22/25 | unsupported | 31; 44 |
| Event/state hybrid | 15/16; 14/17 | 16/21; 16/25 | 19/21; 21/25 | 19/21; 21/25 | 6/6 | 29; 33 |
| No trigger | 16/16; 17/17 | 21/21; 23/25 | 20/21; 24/25 | 20/21; 24/25 | 6/6 | 31; 40 |
| No recent memory | 15/16; 14/17 | 16/21; 16/25 | 19/21; 21/25 | 19/21; 21/25 | 5/6 | 29; 33 |
| No typed facts | 14/16; 13/17 | 15/21; 15/25 | 18/21; 20/25 | 19/21; 21/25 | 6/6 | 29; 33 |

- **Trigger:** `Pick up where we left off`, `Move on to ...`, `Take another pass ...`, and `Proceed with ...` did not match the narrow lexical trigger. No-trigger analysis processes 23/25 validation events, not all 25, because replay/collision suppression is independent of gating. Hybrid validation trigger precision is 14/16; disabling the trigger raises recall from 14/17 to 17/17, with 33 -> 40 candidate comparisons. Analyzed clean user-text characters in validation are 680 vs 825, but gated execution also inspects a bounded trigger-text stream (748 characters); these counters are not tokens or total CPU cost.
- **State:** The six checked validation events exercise candidate-revision invalidation, older replay, policy invalidation, same-cursor collision, cursor gap and epoch rotation. The no-memory variant cannot invalidate a non-existent pointer, hence 5/6 on this check set. No-memory also loses `dev-water` turn 4: 18/21 exact and 2/8 false splits, versus 19/21 and 1/8 with memory. Non-replay binding observations were copied unchanged; inferred identities did not alter host binding.
- **Runtime facts:** No-typed-facts misses one review-worthy typed event in each split, without changing route+ID. This would be invisible if only final routing were measured.
- **Timing:** `results.json` measures local per-turn average latency for each batch (8 warmups, 64 measured batches per configuration/split). One illustrative validation run yielded p50/p95: flat 0.003028/0.006800 ms, hierarchical 0.002872/0.006192 ms, hybrid 0.004704/0.011024 ms, no-trigger 0.004988/0.010576 ms. Candidate comparisons fell but the timed hybrid includes state reconciliation and output trace overhead. These timings cannot estimate model/API latency, cost or throughput; small differences are not decision-grade.

## Proposal and guard

| Split | Configuration | Proposal kind+ID precision / recall | Guard rejected | Wrong past guard | Executions |
|---|---|---:|---:|---:|---:|
| Dev | Flat | 5/9; 5/6 | 2 | 2 | 0 |
| Dev | Hierarchical | 5/6; 5/6 | 0 | 1 | 0 |
| Dev | Event/state hybrid | 6/7; 6/6 | 0 | 1 | 0 |
| Dev | No trigger | 6/7; 6/6 | 0 | 1 | 0 |
| Val | Flat | 4/8; 4/5 | 0 | 4 | 0 |
| Val | Hierarchical | 4/7; 4/5 | 0 | 3 | 0 |
| Val | Event/state hybrid | 3/4; 3/5 | 0 | 1 | 0 |
| Val | No trigger | 4/5; 4/5 | 0 | 1 | 0 |

Proposal correctness evaluates the kind and Task ID, not generated objective text. `dev-dock` demonstrates independent guard rejection for wrong-workspace and stale-ID proposals. `val-rig` demonstrates the opposite: a negated objective change was proposed and passed provenance checks for review. `val-rig` also contrasts order-dependent flat selection with staged abstention on a sentence mentioning both similar candidates; neither implemented contrastive understanding.

The evidence supports a shadow staged/cursor comparator and measuring any trigger against an ungated positive denominator. It does not establish better intent understanding in the field, safe automatic graph mutation, human gold, representative error prevalence or model qualification.
