# Phase 0.8 Context Assembly benchmark

Reproduce after `pnpm build` with
`node scripts/phase-0.8/benchmark.mjs <output-directory>`.
The output is `scenarios.json` (family/seed/labels) and `results.json`
(per-scenario scores and hashes, breakdown and latency distributions).
There are 120 cases: 20 variants of each of six template families.
Development is interleaving, multi-Session history, parallel work, and
Unicode/budget pressure with conflicts. Holdout is branch retry/join and
explicit cross-Task receipts (40 cases, by family). Pressure was used to
tune next-action priority, so it is not counted as holdout. Fixtures and
labels are `agent_generated_not_human_reviewed`, same-project, not blind.

All modes receive the same fixture and cap, with a 192-unit wrapper.
Raw mode retains all lines if they fit, otherwise favors recent lines.
Whole-Session takes the last ten signal lines. Task-only takes the last
14 target-attributed signal lines and cannot resolve dependencies. These are
deterministic extractive baselines, not model summaries. ACMI additionally
gets the authoritative graph annotations for those inputs. This measures
the value of the structured representation and policy, not automated
understanding from raw text.

| Mode | Core fact recall | Active position/state | Correct dependency cases | Unrelated markers (lower better) | p50 estimated units |
| --- | ---: | ---: | ---: | ---: | ---: |
| Raw/recent | 580/720 | 80/120 | 60/80 | 230/260 | 7,097 |
| Whole-Session | 347/720 | 40/120 | 20/80 | 194/260 | 423 |
| Task-only | 560/720 | 100/120 | 20/80 | 0/260 | 508 |
| ACMI | 696/720 | 116/120 | 80/80 | 0/260 | 6,329 |

Four 500-unit cases refused with `budget_insufficient`, not a partial
context. They count as missed facts and state in the 120-case denominator.
Emitted cases retained 696/696 facts, 116/116 active states and next actions.
ACMI's improvement over Task-only is **state and dependency correctness**,
not a further reduction of foreign markers (both zero). ACMI uses fewer
estimated units than raw at p50, but more than either extractive summary due
to richer facts, JSON and citations. Fact density per 1,000 estimated units
is 0.646 raw, 2.917 whole, 4.439 Task-only, 0.937 ACMI; raw-token savings
do not imply superior density to a short extractive summary.

Metric definitions:

- Fact retention: expected objective, criteria, accepted/current decision
  text, constraint, unresolved fact and next action retained / six per case.
  Decision, constraint, unresolved and next action are also reported separately
  as hits / cases; conflicts as both sides retained (and explicitly disputed
  with references for ACMI) / 20 conflict cases.
- Active and execution state: expected node/lifecycle and expected execution
  state retained / cases; plain baselines use labelled marker presence.
- Dependency correctness: exact output plus correct stage/class (or correct
  exclusion) / expected dependency cases. Unconsumed contamination: promoted
  to accepted / non-accepted cases (0/34 ACMI; zero for the literal baselines
  too, which do not infer acceptance). Mere exposure of an excluded result is
  penalized in correctness rather than counted as acceptance.
- Unrelated/stale contamination: forbidden markers found / labelled marker
  opportunities. ACMI stale 0/140. This is fixture leakage detection, not
  proof against arbitrary untrusted upstream evidence.
- Budget: same UTF-8 byte estimate and reserve; units and p50/p95 reported.
  Refusal is zero emitted units. Structured provenance is checked against
  the known synthetic source coordinates for each included item.
- Latency: wall time per operation, nearest-rank p50/p95; separate replay,
  checkpoint restore, append, warm snapshot read, candidate collection,
  assembly, estimation, serialization and package load. The parent also
  measures one separate Node process including startup, not an SLA.

Host: Windows x64, Node 24.16.0, i5-12400 (12 logical CPUs), about 31.7 GiB.
Cases hold up to 516 source rows, 302 graph events and 201,941 raw fixture
bytes. Warm assembly needs no raw source read. The full timing distribution
and exact source hashes are packaged; do not extrapolate to production.
