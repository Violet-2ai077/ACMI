# Path 1 Mechanism Validation Synthesis: From Heavy Same-Generation State Falsification to Four Validated Lightweight Primitives

- **Date**: 2026-11-21
- **Status**: Path 1 (Mechanism Validation) Complete & Closed
- **Model Under Test**: `deepseek-v4.1-flash` (`https://opencode.ai/inference/go/v1/chat/completions`)
- **Primary Ablation Suites**: [`experiments/th1-b/`](../../experiments/th1-b/REPORT.md) (264 calls), [`experiments/tc5-b/`](../../experiments/tc5-b/REPORT.md) (88 calls), [`experiments/tc3-b/`](../../experiments/tc3-b/REPORT.md) (72 calls) — **424 controlled single-factor ablation calls** (0 semantic/format retries, 0 output repairers, 0 LLM Judges)
- **Preceding Phase 0.9.19 Baseline & Archive**: [`research/phase-0.9.19/STATUS.md`](../../research/phase-0.9.19/STATUS.md), [`research/phase-0.9.19/RESEARCH-ARCHIVE.md`](../../research/phase-0.9.19/RESEARCH-ARCHIVE.md), immutable archive tag [`archive/phase-0.9.19-raw-evidence`](https://github.com/Violet-2ai077/ACMI/tree/archive/phase-0.9.19-raw-evidence) (`25c25c6` on `origin/research/th1-handoff-20261120`)

---

## 1. Executive Summary & Final Verdict (执行摘要与最终裁定)

Path 1 of the ACMI research program set out to answer a foundational mechanism question before building further runtime or storage infrastructure:

> **Can a language model identify work boundaries, maintain task identity across interleaved multi-task sessions, and survive context compression/handoff without corrupting either its user-facing answer or the active workspace state?**

Across earlier exploratory phases (Phases 0.9.8–0.9.19: `FM1`, `BS1`, `TC1–TC5`, `TH1`) and **424 new pre-frozen, single-factor ablation API calls** (`TH1-B`, `TC5-B`, `TC3-B`), Path 1 reaches a clear, two-part verdict:

1. **What Is Falsified and Permanently Retired (已证伪并永久弃用的重型路线)**:
   - Asking a model in a single generation to both answer the user and maintain a **heavy structured work-state JSON tree** (UUID slots, decision inventories, acceptance lists, active/done arrays) is **structurally unreliable and permanently retired**.
   - In [`Phase 0.9.10`](../experiments/phase-0.9.10-final-report.md), coupling a full attribution envelope to the response yielded **0/24** valid native answers. In `FM1` (`finite-v1`, 48 closed-loop calls), even when JSON syntax succeeded, the model exhibited **4/6 decision reversals** (e.g., prose explicitly selected green `#1F7A5C` while the same generation's structured state recorded blue `#2B4C7E`), **retrospective task UUID mutation (`102 -> 103`)**, and **ghost item retention**.
2. **What Is Positively Validated and Closed (正面闭合的轻量机制路线)**:
   - Decoupling **Task Identity** from **Workspace State Maintenance** and enforcing four lightweight mechanisms closes every failure mode exposed in `TC5`, `TH1`, and `TC3`:
     1. **Minimal Inline Tail Marker (`<|task:N|>` / `<|task:UNRESOLVED|>`)**: **24/24 (100%)** in `TC1`, **14/14 (100%)** in `TC2`, **24/24 (100%)** in `TC3`, **24/24 (100%)** in `TC4`, and **72/72 (100%)** across all three de-greenhouse stripping tiers (`S0`, `S1`, `S2`) in [`TC3-B`](../../experiments/tc3-b/REPORT.md) (including 14-turn absence recovery at Turn 24 without historical `reasoning_content` or client headers).
     2. **Explicit Anti-Default (Anti-Recency) Attribution Contract (`SYSTEM_C1`)**: In [`TC5-B`](../../experiments/tc5-b/REPORT.md), counterbalanced prefix probes proved that uncontracted implicit-ambiguity failures are driven **100% by a Recency heuristic (`4/4` default guesses on `recent_relevant`, `0/16` on older tasks) rather than Primacy**. Adding the single-factor `SYSTEM_C1` contract achieved **16/16 (100%) ambiguity clarification**, **0/16 (0%) over-abstention**, and **16/16 (100%) unambiguous returns** in Experiment A, plus **4/4 (100%) implicit ambiguity clarification** and complete elimination of Turn 7 cross-task contamination in the 24-turn closed-loop Experiment B.
     3. **Hard Global/Local Boundary Compression (`COMPRESSOR_STRICT`)**: In [`TH1-B`](../../experiments/th1-b/REPORT.md), explicitly forbidding workspace-wide rules/footers inside task-local compaction notes achieved **24/24 (100%) pass rate**, **0% stale-footer leak rate**, and **100% local trail/seal preservation** across all three reasoning tiers (`max`, `low`, `none`).
     4. **Authoritative Override Handoff Contract (`RECEIVER_C1`)**: In [`TH1-B`](../../experiments/th1-b/REPORT.md), declaring `memory` as the workspace-level authoritative state store that unconditionally overrides any global rule mentioned in `task_records` or `task_note` eliminated stale-rule resurrection from **100% (8/8 resurrected in `compact_P0_C0`) down to 0% (120/120 passed across all `C1` conditions in `max`, `low`, and `none`)**, while cutting `max`-tier reasoning tokens on polluted inputs by **90.5% (`1708.6 -> 162.9`)** and latency by **4.0x (`18.12s -> 4.56s`)**.

### Scope & Honesty Boundary (诚实边界声明)

ACMI remains a **mechanism-validated Alpha and research infrastructure**, not a finished production-grade general long-term memory engine. All experiments were conducted under controlled synthetic and semi-natural multi-task workloads on `deepseek-v4.1-flash` (`0.2.2-rc.1` target harness ecosystem). These results do not claim universal cross-model generalization without per-model conformance checks, nor do they authorize autonomous tool execution or multi-tenant deployment. Instead, Path 1 provides the exact, empirically falsified and verified engineering blueprint for **Path 2 (Lightweight Practical MVP Tooling)**.

---

## 2. Comprehensive Experimental Evidence Matrix (全景实验证据矩阵)

### 2.1 Historical Baselines, Diagnostics, and Falsifications

| Study / Phase | Calls & Design | What Was Tested | Observed Outcome & Mechanism Lesson |
| --- | --- | --- | --- |
| [**Phase 0.9.10**](../experiments/phase-0.9.10-final-report.md) | 24 calls (local model) | Same-generation user answer + full structured attribution envelope | **0/24 usable native answers** under strict envelope validation. Heavy same-generation schema degrades primary answer delivery. |
| [**Phase 0.9.14 WorkAnchor**](../experiments/phase-0.9.14-work-anchor-report.md) | 24 calls (paired A/B) | Trusted request-scoped `WorkAnchor` for explicit continuation | Explicit continuation rose **0/4 -> 4/4 (100%)**; overall identity 8/12. Host-verified anchors solve explicit continuation, not implicit switching. |
| **FM1 (`finite-v1`)** | 48 calls (12 × 4-turn closed loops, C1/C2/C3) | Same-generation answer + full structured work-state JSON maintenance | **Falsified heavy state maintenance**: **4/6 decision reversals** (prose chose green `#1F7A5C`, state JSON wrote blue `#2B4C7E`), **UUID mutation (`102 -> 103`)**, and **ghost item retention**. |
| **BS1 (`boundary-v1`)** | 32 calls (4 × 8-turn closed loops) | Pure work-segment boundary detection (`CONTINUE` / `NEW` / `UNRESOLVED`) without state JSON | **28/28 (100%) post-initialization transitions correct** (15 `CONTINUE`, 11 `NEW` including 6 returns, 2 `UNRESOLVED`); 31/32 protocol valid (1 initial marker omitted). |
| **TC1 (`continuity-v1`)** | 24 calls (4 × 6-turn closed loops) | Minimal inline tail marker `<\|task:N\|>` identity continuity without state JSON | **24/24 (100%) canonical markers** (`10/10` births, `3/3` continuations, `11/11` returns restored to actual birth markers). |
| **TC2 (`continuity-long-v1`)** | 14 calls (1 × 14-turn closed loop) | 5 overlapping tasks across 14 turns (13 switches, 9 returns) | **14/14 (100%) canonical markers**, **9/9 (100%) returns restored**, **14/14** lexical answer checks. |
| **TC3 (`continuity-natural-v1`)** | 24 calls (1 × 24-turn closed loop) | 5 overlapping notice tasks, 19 returns without client names in user turns, max gap = 14 turns | **24/24 (100%) canonical markers**, **19/19 (100%) returns restored**, **24/24** lexical checks. Exposed question: did it rely on historical `reasoning_content` or assistant `【...】` headers? (Resolved in **TC3-B**). |
| **TC4 (`continuity-ambiguity-v1`)** | 24 calls (2 × 12-turn closed loops) | Explicit provenance-missing ambiguity (`UNRESOLVED` + clarification + return) | **24/24 (100%) canonical markers**, **4/4 (100%) `UNRESOLVED` clarifications**, **14/14 (100%) returns restored**. |
| **TC5 (`continuity-implicit-v1`)** | 24 calls (2 × 12-turn closed loops) | Unannounced implicit ambiguity (request matches shared features of 2 tasks) | **8/8** clear returns & **4/4** post-clarification returns correct, but **only 1/4 (25.0%) implicit ambiguities clarified** (3/4 guessed task `1`, confounding Recency with Primacy and causing `t7` cross-task contamination). (Resolved in **TC5-B**). |
| **TH1 (`th1-handoff`)** | 24 calls (2 paired 5-turn variants) | Task filtering, context compaction, and workspace memory handoff (`footer` override) | End-to-end handoff **0/2**: `compact + memory` **0/2** (both resurrected stale footer from summary), `filtered + memory` **1/2** (variant 1 resurrected stale footer `M94`), `mixed` **2/2**, `gold` **2/2**. (Resolved in **TH1-B**). |

---

### 2.2 TH1-B: Stale-Rule Resurrection Single-Factor Ablation ([`experiments/th1-b/`](../../experiments/th1-b/REPORT.md))

**Objective**: Isolate why a downstream receiver resurrects a superseded workspace rule (`footer`) when handed a task-filtered transcript or compacted summary alongside up-to-date workspace `memory`, and test both upstream hard-boundary compaction (`COMPRESSOR_STRICT`) and downstream authority-override contracts (`RECEIVER_C1`) across 8 counterbalanced scenarios (`V0–V7`) and 3 reasoning effort tiers (`max`, `low`, `none`; **88 tasks × 3 tiers = 264 live API calls**).

#### Table 2.2.1: Cross-Tier Ablation Matrix (`max` vs `low` vs `none`, 8 Scenarios per Cell)

| Condition | Repr ($R$) | Pollution ($P$) | Contract ($C$) | `max` Pass Rate | `max` Stale Res. | `low` Pass Rate | `low` Stale Res. | `none` Pass Rate | `none` Stale Res. |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `filtered_P0_C0` | `filtered` | `P0` (Polluted) | `C0` (Baseline) | **50.0% (4/8)** | 12.5% (1/8)* | **87.5% (7/8)** | 12.5% (1/8) | **37.5% (3/8)** | **62.5% (5/8)** |
| `filtered_P0_C1` | `filtered` | `P0` (Polluted) | `C1` (Authority) | **100.0% (8/8)** | **0.0% (0/8)** | **100.0% (8/8)** | **0.0% (0/8)** | **100.0% (8/8)** | **0.0% (0/8)** |
| `filtered_P1_C0` | `filtered` | `P1` (Purged) | `C0` (Baseline) | **100.0% (8/8)** | 0.0% (0/8) | **100.0% (8/8)** | 0.0% (0/8) | **100.0% (8/8)** | 0.0% (0/8) |
| `filtered_P1_C1` | `filtered` | `P1` (Purged) | `C1` (Authority) | **100.0% (8/8)** | **0.0% (0/8)** | **100.0% (8/8)** | **0.0% (0/8)** | **100.0% (8/8)** | **0.0% (0/8)** |
| `compact_P0_C0` | `compact` | `P0` (Polluted) | `C0` (Baseline) | **0.0% (0/8)** | **100.0% (8/8)** | **0.0% (0/8)** | **100.0% (8/8)** | **0.0% (0/8)** | **100.0% (8/8)** |
| `compact_P0_C1` | `compact` | `P0` (Polluted) | `C1` (Authority) | **100.0% (8/8)** | **0.0% (0/8)** | **100.0% (8/8)** | **0.0% (0/8)** | **100.0% (8/8)** | **0.0% (0/8)** |
| `compact_P1_C0` | `compact` | `P1` (Purged) | `C0` (Baseline) | **100.0% (8/8)** | 0.0% (0/8) | **100.0% (8/8)** | 0.0% (0/8) | **62.5% (5/8)**† | 0.0% (0/8) |
| `compact_P1_C1` | `compact` | `P1` (Purged) | `C1` (Authority) | **100.0% (8/8)** | **0.0% (0/8)** | **100.0% (8/8)** | **0.0% (0/8)** | **100.0% (8/8)** | **0.0% (0/8)** |
| `compress_strict` | Compressor | Raw Local Input | `COMPRESSOR_STRICT` | **100.0% (8/8)** | **0.0% leak** | **100.0% (8/8)** | **0.0% leak** | **100.0% (8/8)** | **0.0% leak** |
| `compact_strict_C0` | `compact_strict` | Compressor Out | `C0` (Baseline) | **100.0% (8/8)** | 0.0% (0/8) | **100.0% (8/8)** | 0.0% (0/8) | **87.5% (7/8)**† | 0.0% (0/8) |
| `compact_strict_C1` | `compact_strict` | Compressor Out | `C1` (Authority) | **100.0% (8/8)** | **0.0% (0/8)** | **100.0% (8/8)** | **0.0% (0/8)** | **100.0% (8/8)** | **0.0% (0/8)** |

*\*Note on `max` `filtered_P0_C0`: In addition to 1/8 direct stale resurrection (`V1`), 3/8 tasks (`V4`, `V5`, `V7`) entered an unresolvable authority-conflict reasoning spiral that exhausted the 4,096-token completion ceiling (`finish_reason: "length"`, `json_valid = false`).*
*†Note on `none` `compact_P1_C0` (5/8) and `compact_strict_C0` (7/8): With `reasoning_effort=none` and no authority contract (`C0`), the model did not resurrect stale footers (`0/8`), but output `UNKNOWN` for the footer on 3/8 (`compact_P1_C0`: `V0`, `V6`, `V7`) and 1/8 (`compact_strict_C0`: `V6`) because the summary omitted footer mentions and `C0` did not instruct the model to bind workspace `memory.footer` as the authoritative default. Pairing with `C1` (`compact_P1_C1`, `compact_strict_C1`) restored **8/8 (100.0%)** even at `reasoning_effort=none`.*

#### Table 2.2.2: Quantifying the "Authority Ambiguity Tax" on Polluted Inputs (`P0` = `filtered_P0` + `compact_P0`, 16 Tasks per Tier)

| Reasoning Tier | Contract Pair (`P0` Polluted Inputs) | Pass Rate | Stale Resurrection Rate | Mean `reasoning_tokens` | Median `reasoning_tokens` | Mean Latency (s) |
| --- | --- | --- | --- | --- | --- | --- |
| **`max`** | `P0_C0` (No Authority Contract) | 25.0% (4/16) | 56.3% (9/16) + 18.8% (3/16) loop | **1708.6** | **1245.5** | **18.12s** |
| **`max`** | `P0_C1` (`RECEIVER_C1` Contract) | **100.0% (16/16)** | **0.0% (0/16)** | **162.9 (-90.5%)** | **165.5 (-86.7%)** | **4.56s (4.0x faster)** |
| **`low`** | `P0_C0` (No Authority Contract) | 43.8% (7/16) | 56.3% (9/16) | 384.6 | 249.5 | 5.05s |
| **`low`** | `P0_C1` (`RECEIVER_C1` Contract) | **100.0% (16/16)** | **0.0% (0/16)** | **171.8 (-55.3%)** | **180.5** | **2.91s (1.7x faster)** |
| **`none`** | `P0_C0` (No Authority Contract) | 18.8% (3/16) | 81.3% (13/16) | 0.0 | 0.0 | 1.44s |
| **`none`** | `P0_C1` (`RECEIVER_C1` Contract) | **100.0% (16/16)** | **0.0% (0/16)** | **0.0** | **0.0** | **1.55s** |

**Key Mechanism Takeaways from TH1-B**:
1. **Why Compaction Amplifies Resurrection (`filtered_P0_C0` 50% vs `compact_P0_C0` 0%)**: A raw filtered transcript preserves conversational turn numbers (`turn 1`, `turn 3`), allowing the receiver in 4/8 cases to notice that `memory.footer.source` (`turn 4` or `turn 5`) is newer. Naive task compaction strips turn provenance and flattens the old footer into a timeless assertive clause (`"Workspace footer rule is M16"`), causing **100% (8/8) stale resurrection** across all reasoning tiers when the receiver lacks an authority rule (`C0`).
2. **Zero Overcorrection on Local State (`local_corruption_rate = 0/192`)**: Across all 120 `C1` tasks (including negative controls `V6` and `V7`, where a competing task's local seal `S99/X88` or `S63/Y11` was injected as a distraction), `RECEIVER_C1` never once corrupted the target task's local `trail` or `seal`.
3. **Upstream Isolation (`COMPRESSOR_STRICT`) and Downstream Authority (`RECEIVER_C1`) Must Be Paired**: `COMPRESSOR_STRICT` prevents stale global assertions from entering task notes (`24/24` zero leak), while `RECEIVER_C1` guarantees that the receiver binds global `memory` even at `reasoning_effort=none` (`120/120` pass) and remains immune to uncompacted polluted transcripts (`filtered_P0_C1` `24/24` pass).

---

### 2.3 TC5-B: Implicit Ambiguity Recency/Primacy Counterbalance & Anti-Default Attribution ([`experiments/tc5-b/`](../../experiments/tc5-b/REPORT.md))

**Objective**: Decouple Recency (most recently active task) from Primacy (first-born task `<|task:1|>`) in implicit ambiguity failures, and test whether a single-factor Anti-Default Attribution Contract (`SYSTEM_C1`) eliminates guessing on ambiguous turns without inducing over-abstention (`UNRESOLVED`) on content-grounded unambiguous returns (**88 live API calls at `reasoning_effort=max`**: 64 prefix-probe calls in Experiment A + 24 closed-loop turns in Experiment B).

#### Table 2.3.1: Experiment A — 32 Frozen Counterbalanced Prefix Probes × `{C0, C1}` (64 Calls)

| Contract | Subset / Slice | Probes | `UNRESOLVED` Marker Rate | Full Clarify / Return Pass | `guessed_recent` Rate | `guessed_older` Rate | Over-Abstention Rate | Mean `reasoning_tokens` | Mean Latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **`SYSTEM_C0`** | Ambiguous (`recent_relevant="1"`, Recency=1/Primacy=1) | 8 | 75.0% (6/8) | 75.0% (6/8) | **25.0% (2/8)** | **0.0% (0/8)** | — | — | — |
| **`SYSTEM_C0`** | Ambiguous (`recent_relevant="2"`, Recency=2/Primacy=1) | 8 | 75.0% (6/8) | 75.0% (6/8) | **25.0% (2/8)** | **0.0% (0/8)** | — | — | — |
| **`SYSTEM_C0`** | **All Ambiguous Probes** | **16** | **75.0% (12/16)** | **75.0% (12/16)** | **25.0% (4/16)** | **0.0% (0/16)** | — | — | — |
| **`SYSTEM_C0`** | Unambiguous Return (`expected === recent_relevant`) | 8 | 0.0% (0/8) | 75.0% (6/8) | — | — | **0.0% (0/8)** | — | — |
| **`SYSTEM_C0`** | Unambiguous Return (`expected !== recent_relevant`) | 8 | 0.0% (0/8) | 100.0% (8/8) | — | — | **0.0% (0/8)** | — | — |
| **`SYSTEM_C0`** | **All 32 Probes Combined** | **32** | — | **81.3% (26/32)** | **25.0% (4/16 amb)** | **0.0% (0/16 amb)** | **0.0% (0/16 unamb)** | **236.8** | **4.48s** |
| **`SYSTEM_C1`** | Ambiguous (`recent_relevant="1"`, Recency=1/Primacy=1) | 8 | **100.0% (8/8)** | **100.0% (8/8)** | **0.0% (0/8)** | **0.0% (0/8)** | — | — | — |
| **`SYSTEM_C1`** | Ambiguous (`recent_relevant="2"`, Recency=2/Primacy=1) | 8 | **100.0% (8/8)** | **100.0% (8/8)** | **0.0% (0/8)** | **0.0% (0/8)** | — | — | — |
| **`SYSTEM_C1`** | **All Ambiguous Probes** | **16** | **100.0% (16/16)** | **100.0% (16/16)** | **0.0% (0/16)** | **0.0% (0/16)** | — | — | — |
| **`SYSTEM_C1`** | Unambiguous Return (`expected === recent_relevant`) | 8 | 0.0% (0/8) | **100.0% (8/8)** | — | — | **0.0% (0/8)** | — | — |
| **`SYSTEM_C1`** | Unambiguous Return (`expected !== recent_relevant`) | 8 | 0.0% (0/8) | **100.0% (8/8)** | — | — | **0.0% (0/8)** | — | — |
| **`SYSTEM_C1`** | **All 32 Probes Combined** | **32** | — | **100.0% (32/32)** | **0.0% (0/16 amb)** | **0.0% (0/16 amb)** | **0.0% (0/16 unamb)** | **222.7** | **4.26s** |

#### Table 2.3.2: Experiment B — Original TC5 24-Turn Closed-Loop Regression (`SYSTEM_C0` Historical vs `SYSTEM_C1` Live)

| Metric | Original TC5 (`SYSTEM_C0`, 24 Turns) | TC5-B Experiment B (`SYSTEM_C1`, 24 Turns) | Mechanism Delta |
| --- | --- | --- | --- |
| **Implicit Ambiguity Turns Clarified (`t6`, `t10` × 2 stories)** | **25.0% (1/4)** (`3/4` guessed `<\|task:1\|>`) | **100.0% (4/4)** (all 4 emitted `<\|task:UNRESOLVED\|>` + named both candidates) | **+75.0 percentage points (4/4 closed)** |
| **Post-Clarification Turn 7 Delivery (`warehouse-queries` `t7`)** | Cross-task contamination (asked superfluous follow-up question instead of delivering SQL clause) | **Clean direct delivery** (`<\|task:2\|>`, `PARTITION BY sku ORDER BY updated_at DESC`) | Counterfactual cascade pollution eliminated |
| **Unnecessary Abstentions (`UNRESOLVED` on clear turns)** | 0/20 | **0/20 (0.0%)** | Zero over-abstention penalty |
| **Semantic Task Marker Identity Accuracy** | 21/24 (87.5%) | **24/24 (100.0%)** (all 24 turns emitted exact expected marker at end) | All 3 implicit-ambiguity misattributions fixed |
| **Legacy Regex `strict_valid` (`!/```\s*$/` before marker)** | 24/24 (100.0%) | **23/24 (95.8%)** (`warehouse-queries` `t3` placed `<\|task:1\|>` after a closed ```` ```sql ... ``` ```` fence) | Identifies parser rule refinement for Path 2 |

---

### 2.4 TC3-B: De-Greenhouse 24-Turn Task Continuity Stress Test ([`experiments/tc3-b/`](../../experiments/tc3-b/REPORT.md))

**Objective**: Test whether the 24/24 result in original `TC3` (`overlapping-notices`, 5 overlapping tasks, 19 returns without client names in user prompts, up to 14 intervening turns) depended on two "greenhouse" artifacts: (1) replaying previous turns' `reasoning_content` (CoT) in conversation history, and (2) the model spontaneously writing explicit client headers (`【云栖读书会】`, `【云溪读书会】`, `【溪岸书店】`) in its own assistant responses (**3 conditions × 24 turns = 72 live API calls at `reasoning_effort=max`** under verbatim `SYSTEM_C0`).

#### Table 2.4.1: Overall De-Greenhouse Ablation Results (24 Turns per Condition)

| Condition | Historical Assistant Payload | Strict Valid | Canonical Exact | Return Restoration (19 turns) | Answer Minimal | Full Pass | Closed-Fence Diagnostic | Mean `reasoning_tokens` | Mean Latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **`S0_baseline`** | `content` + full `reasoning_content` (Unstripped) | **24/24 (100%)** | **24/24 (100%)** | **19/19 (100%)** | **24/24 (100%)** | **24/24 (100%)** | 0 | **182.0** | **3.66s** |
| **`S1_strip_cot`** | `content` only (`reasoning_content: ""` per `pi-ai` schema, 0 CoT chars) | **24/24 (100%)** | **24/24 (100%)** | **19/19 (100%)** | **24/24 (100%)** | **24/24 (100%)** | 0 | **232.1 (+27.5%)** | **4.25s** |
| **`S2_strip_cot_and_header`** | `content` only + `stripExplicitHeaders(content)` (`【...】` removed & all 6 proper nouns -> `该项目`) | **24/24 (100%)** | **24/24 (100%)** | **19/19 (100%)** | **24/24 (100%)** | **24/24 (100%)** | 0 | **232.5 (+27.7%)** | **4.06s** |

#### Table 2.4.2: Reasoning Effort & Latency by Gap Span Bucket (`birth_or_continue` vs `short_return` vs `long_return`)

| Gap Span Bucket | Turns in Story | `S0` Full Pass | `S1` Full Pass | `S2` Full Pass | `S0` Mean / Med CoT Tokens | `S1` Mean / Med CoT Tokens | `S2` Mean / Med CoT Tokens | `S0 -> S2` CoT Delta |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **`birth_or_continue`** (`gap = 0`) | 5 (`t1, t2, t4, t5, t7`) | **5/5 (100%)** | **5/5 (100%)** | **5/5 (100%)** | 195.4 / 161.0 | 212.0 / 216.0 | 248.6 / 216.0 | +27.2% |
| **`short_return`** (`gap = 1..4`) | 16 (`t3, t6, t8, t10..t11, t13..t23`) | **16/16 (100%)** | **16/16 (100%)** | **16/16 (100%)** | 183.5 / 176.5 | 226.6 / 208.0 | 206.1 / 182.0 | +12.3% |
| **`long_return`** (`gap = 5..14`) | 3 (`t9` [gap=5], `t12` [gap=5], `t24` [gap=14]) | **3/3 (100%)** | **3/3 (100%)** | **3/3 (100%)** | **151.7 / 153.0** | **295.3 / 200.0** | **346.7 / 295.0** | **+128.5% (2.29x)** |
| **Turn 24 Highlight** (`gap = 14`) | 1 (`t24`, last visited at `t9`) | **1/1 (`<\|task:1\|>`)** | **1/1 (`<\|task:1\|>`)** | **1/1 (`<\|task:1\|>`)** | 153 (`3.48s`) | 200 (`5.95s`) | 143 (`4.91s`) | Zero accuracy drop |

**Key Mechanism Takeaways from TC3-B**:
1. **De-Greenhouse Invariance**: Even when every historical assistant message is stripped of all CoT tokens and scrubbed of every bracketed header (`【云栖读书会】`, `【云溪读书会】`, `【溪岸书店】`) and proper noun (`S2`), the model recovers **19/19 (100%)** task returns — including `t24` after 14 intervening turns — purely by matching domain-content features (`纸质书/共读` -> Task 1 `周六14:00南馆三楼`) to its own historical `<|task:N|>` markers.
2. **The Long-Gap "Online Re-Scan Tax"**: Stripping historical CoT and explicit headers increases `long_return` reasoning tokens by **128.5% (`151.7 -> 346.7` mean, peaking at `602` tokens on `S2` `t9`)** because the model must re-parse the raw dialogue history turn-by-turn in its current thinking block to reconstruct the `1..5` task mapping. In Path 2, the host can eliminate this re-scan tax at zero model complexity by injecting a **read-only 1-line-per-task catalog header** (compiled deterministically by the host from confirmed birth turns).

---

## 3. Reproducibility & Forensic Custody Index (可复现性索引)

All three single-factor ablation suites (`TH1-B`, `TC5-B`, `TC3-B`) are committed in self-contained, zero-dependency directories under `experiments/` (using only Node.js built-in modules `node:fs`, `node:path`, `node:os`, `node:crypto`, `node:url`, `node:test`, `node:assert/strict`, and global `fetch`).

### 3.1 Anti-Self-Deception Engineering Discipline

Every experiment in `experiments/{th1-b,tc5-b,tc3-b}/` enforces four non-negotiable rules:
1. **Pre-Exposure SHA-256 Freeze**: All corpus scenarios, prompts, strippers, and deterministic evaluators are hashed into `frozen-manifest.json` via `--dry-run` before the first live API request; `run.mjs` verifies every file digest before opening any network connection.
2. **Zero Semantic or Format Retries**: Only transport-layer errors (HTTP 408/429/5xx or socket disconnects) are retryable (`transport_retries` logged per call: `1` in `th1-b` `max`, `0` in `th1-b` `low`/`none`, `0` in `tc5-b`, `0` in `tc3-b`). Model outputs that fail JSON parsing or marker formatting are graded as failures as-is.
3. **Zero Output Repairers & Zero LLM Judges**: `TH1-B` grades strictly via `JSON.parse(rawContent.trim())` without stripping markdown code fences; `TC5-B` and `TC3-B` grade strictly via deterministic regex `parseOutput(rawContent)` and lexical `answerChecks`.
4. **Immediate Per-Call Raw Persistence**: Every single API completion immediately writes its full request body, response body, token usage, `reasoning_content`, `content`, timestamps, and latency via synchronous `writeFileSync` to `runs/<run-id>/raw/<ordinal>-<task-id>.json`.

### 3.2 Experiment Artifacts & Frozen Manifest Digests

| Suite | Directory & Unit Test | Frozen Manifest & Core Digests | Committed Live Run Directories (`runs/<run-id>/`) |
| --- | --- | --- | --- |
| **TH1-B** | [`experiments/th1-b/`](../../experiments/th1-b/REPORT.md)<br>`node --test experiments/th1-b/th1-b.node-test.mjs` | [`frozen-manifest.json`](../../experiments/th1-b/frozen-manifest.json)<br>`scenarios_sha256`: `2d606ba9...738b96`<br>`prompts_sha256`: `cc075c4a...4e7ed`<br>`task_matrix_sha256`: `aaf01431...48a35` | [`2026-11-21T13-33-35-351Z-max-all`](../../experiments/th1-b/runs/2026-11-21T13-33-35-351Z-max-all/REPORT.md) (88 calls)<br>[`2026-11-21T16-51-22-301Z-low-all`](../../experiments/th1-b/runs/2026-11-21T16-51-22-301Z-low-all/REPORT.md) (88 calls)<br>[`2026-11-21T16-57-06-935Z-none-all`](../../experiments/th1-b/runs/2026-11-21T16-57-06-935Z-none-all/REPORT.md) (88 calls) |
| **TC5-B** | [`experiments/tc5-b/`](../../experiments/tc5-b/REPORT.md)<br>`node --test experiments/tc5-b/tc5-b.node-test.mjs` | [`frozen-manifest.json`](../../experiments/tc5-b/frozen-manifest.json)<br>`probes_sha256`: `cc229e2e...5a120`<br>`stories_sha256`: `6ac18bc2...9960b`<br>`prompts_sha256`: `09fac134...717d5` | [`2026-11-21T17-34-29-621Z-max-all`](../../experiments/tc5-b/runs/2026-11-21T17-34-29-621Z-max-all/REPORT.md) (88 calls: 64 Exp A + 24 Exp B) |
| **TC3-B** | [`experiments/tc3-b/`](../../experiments/tc3-b/REPORT.md)<br>`node --test experiments/tc3-b/tc3-b.node-test.mjs` | [`frozen-manifest.json`](../../experiments/tc3-b/frozen-manifest.json)<br>`story.mjs`: `7dd55811...5884e08`<br>`stripper.mjs`: `f24c49fd...d47b3a8`<br>`evaluate.mjs`: `a9b49ef5...79e3056` | [`2026-11-21T17-59-15-189Z-max-all`](../../experiments/tc3-b/runs/2026-11-21T17-59-15-189Z-max-all/REPORT.md) (72 calls: 24 `S0` + 24 `S1` + 24 `S2`) |
| **Phase 0.9.19 Raw Archive** | [`research/phase-0.9.19/RESEARCH-ARCHIVE.md`](../../research/phase-0.9.19/RESEARCH-ARCHIVE.md) | Heavy 573k-line raw evidence archive (`FM1`, `BS1`, `TC1–TC5`, `TH1`, `Gate 2` split ZIPs) | Retained on branch `origin/research/th1-handoff-20261120` under immutable tag [`archive/phase-0.9.19-raw-evidence`](https://github.com/Violet-2ai077/ACMI/tree/archive/phase-0.9.19-raw-evidence) (`25c25c6`) |

---

## 4. Four Validated Architectural Primitives for Path 2 (面向第二条路线 MVP 的 4 条定型架构原语)

With Path 1 mechanism validation closed, Path 2 (Lightweight Practical MVP Tooling) builds directly on four empirically verified primitives:

### Primitive 1: Minimal Inline Identity Tail Marker + Anti-Recency Contract + Host Light Catalog
- **Mechanism**: Every assistant response ends with a single lightweight token `<|task:N|>` (`N` in `1..999`) or `<|task:UNRESOLVED|>`, governed by the `SYSTEM_C1` Anti-Default Attribution Contract (forbidding Recency/Primacy guessing when a request matches shared features of multiple tasks).
- **Parser Refinement (from TC5-B Exp B `t3`)**: The host tail-marker parser must permit `<|task:N|>` on its own trailing line immediately after a *closed* markdown code fence (```` ```...```\n<|task:N|> ````), rejecting only markers trapped *inside* an unclosed code fence.
- **Amortizing the Long-Gap Re-Scan Tax (from TC3-B `S2` & Phase 0.9.14 `WorkAnchor`)**: The host deterministically compiles a read-only, 1-line-per-task summary catalog from confirmed birth turns (and attaches a verified `WorkAnchor` when the operator explicitly selects a task), keeping long-gap reasoning cost flat (~150 tokens) without trusting the model to rewrite a state catalog.

### Primitive 2: Host-Authoritative Workspace State Ledger (Zero Model-Maintained State JSON)
- **Mechanism**: Never ask the model to re-emit or maintain a nested JSON work-state tree in its generation (`FM1` falsification).
- **Host Responsibility**: Workspace-level shared state (such as active rules, configurations, or global keys) is stored in a host-managed key-value ledger with monotonic turn provenance (`source_turn`) and explicit supersession tombstones (`superseded_values: [...]`).

### Primitive 3: Hard Global/Local Boundary Compressor (`COMPRESSOR_STRICT`)
- **Mechanism**: When compacting a task's historical transcript into a handoff summary (`task_note`), the compressor prompt must enforce a strict schema boundary: summarize **only task-local state transitions and deliverables** (e.g., local code trails, local seals, file edits), and **strictly exclude** all workspace-global rules/footers (even if they were originally announced inside one of that task's turns).
- **Empirical Guarantee**: Validated at **24/24 (100%) zero global-rule leakage** and **100% local state retention** across `max`, `low`, and `none` reasoning tiers in `TH1-B`.

### Primitive 4: Authoritative Override Handoff Contract (`RECEIVER_C1`)
- **Mechanism**: Whenever a downstream session or handoff receiver is given both task-scoped context (`task_records` or `task_note`) and workspace-level `memory`, the receiver system prompt must include the explicit authority hierarchy (`RECEIVER_C1`):
  1. `memory` is the single authoritative source of truth for workspace-global keys; any conflicting value in `task_records` or `task_note` is a superseded historical remnant and must be ignored.
  2. `task_records` / `task_note` remain authoritative solely for task-local state (e.g., local artifact evolution and local seal).
- **Empirical Guarantee**: Validated at **120/120 (100%) pass rate, 0% stale resurrection, 0% local corruption** across `max`, `low`, and `none` reasoning tiers in `TH1-B`, while reducing `max`-tier reasoning token consumption on polluted histories by **90.5%**.
