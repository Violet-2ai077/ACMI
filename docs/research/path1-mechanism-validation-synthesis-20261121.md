# Path 1 Mechanism Validation Synthesis: From Heavy Same-Generation State Falsification to Five Validated Closed-Loop Primitives

- **Date**: 2026-11-22
- **Status**: Path 1 (Mechanism Validation) Complete, Closed & Sealed (`484` Controlled Single-Factor Ablation Calls)
- **Model Under Test**: `deepseek-v4.1-flash` (`https://opencode.ai/inference/go/v1/chat/completions`)
- **Primary Ablation Suites**: [`experiments/th1-b/`](../../experiments/th1-b/REPORT.md) (264 calls), [`experiments/tc5-b/`](../../experiments/tc5-b/REPORT.md) (88 calls), [`experiments/tc3-b/`](../../experiments/tc3-b/REPORT.md) (72 calls), [`experiments/st1-staging/`](../../experiments/st1-staging/REPORT.md) (60 calls) — **484 controlled single-factor ablation calls** (0 semantic/format retries, 0 output repairers, 0 LLM Judges)
- **Preceding Phase 0.9.19 Baseline & Archive**: [`research/phase-0.9.19/STATUS.md`](../../research/phase-0.9.19/STATUS.md), [`research/phase-0.9.19/RESEARCH-ARCHIVE.md`](../../research/phase-0.9.19/RESEARCH-ARCHIVE.md), immutable archive tag [`archive/phase-0.9.19-raw-evidence`](https://github.com/Violet-2ai077/ACMI/tree/archive/phase-0.9.19-raw-evidence) (`25c25c6` on `origin/research/th1-handoff-20261120`)

---

## 1. Executive Summary & Final Verdict (执行摘要与最终裁定)

Path 1 of the ACMI research program set out to answer a foundational mechanism question before building production runtime or memory tooling:

> **Can a language model identify work boundaries, maintain task identity across interleaved multi-task sessions, extract authoritative workspace state evolutions without polluting or reversing decisions, and survive context compression/handoff without resurrecting superseded rules?**

Across earlier exploratory phases (Phases 0.9.8–0.9.19: `FM1`, `BS1`, `TC1–TC5`, `TH1`) and **484 pre-frozen, single-factor ablation API calls** (`TH1-B`: 264 calls; `TC5-B`: 88 calls; `TC3-B`: 72 calls; `ST1`: 60 calls), Path 1 reaches a definitive, end-to-end verdict:

1. **What Is Falsified and Permanently Retired (已证伪并永久弃用的重型路线)**:
   - Asking a model in a single generation to both answer the user and maintain a **heavy structured work-state JSON tree** (UUID slots, decision inventories, acceptance lists, active/done arrays) is **structurally unreliable and permanently retired**.
   - In [`Phase 0.9.10`](../experiments/phase-0.9.10-final-report.md), coupling a full attribution envelope to the response yielded **0/24** valid native answers. In `FM1` (`finite-v1`, 48 closed-loop calls), even when JSON syntax succeeded, the model exhibited **4/6 decision reversals** (e.g., prose explicitly selected green `#1F7A5C` while the same generation's structured state recorded blue `#2B4C7E`), **retrospective task UUID mutation (`102 -> 103`)**, and **ghost item retention**.
2. **What Is Positively Validated and Closed (正面闭合的五原语轻量机制路线)**:
   - Decoupling **Task Identity** from **Workspace State Maintenance** across the entire write-fold-compress-handoff lifecycle closes every failure mode exposed in `FM1`, `TC5`, `TH1`, and `TC3`:
     1. **Minimal Inline Tail Marker (`<|task:N|>` / `<|task:UNRESOLVED|>`)**: **24/24 (100%)** in `TC1`, **14/14 (100%)** in `TC2`, **24/24 (100%)** in `TC3`, **24/24 (100%)** in `TC4`, and **72/72 (100%)** across all three de-greenhouse stripping tiers (`S0`, `S1`, `S2`) in [`TC3-B`](../../experiments/tc3-b/REPORT.md) (including 14-turn absence recovery at Turn 24 without historical `reasoning_content` or client headers).
     2. **Explicit Anti-Default (Anti-Recency) Attribution Contract (`SYSTEM_C1`)**: In [`TC5-B`](../../experiments/tc5-b/REPORT.md), counterbalanced prefix probes proved that uncontracted implicit-ambiguity failures are driven **100% by a Recency heuristic (`4/4` default guesses on `recent_relevant`, `0/16` on older tasks) rather than Primacy**. Adding the single-factor `SYSTEM_C1` contract achieved **16/16 (100%) ambiguity clarification**, **0/16 (0%) over-abstention**, and **16/16 (100%) unambiguous returns** in Experiment A, plus **4/4 (100%) implicit ambiguity clarification** and complete elimination of Turn 7 cross-task contamination in the 24-turn closed-loop Experiment B.
     3. **Independent Asynchronous Staging State Operator Extraction (`ST1` Part A1 & A2)**: In [`ST1`](../../experiments/st1-staging/REPORT.md), separating state extraction from user-facing answering into an asynchronous single-step operator extractor (`ASSERT`, `SUPERSEDE`, `OPEN_QUESTION`, `RESOLVE_QUESTION`, `NO_OP` against read-only `HEAD`) achieved **24/24 (100%) multi-hop extraction accuracy** (with all internal handles `D1/D2/Q1` removed from dialogue text) and **12/12 (100%) boundary trap immunity** (equal-authority conflicts, local scope leaks, and unauthorized resurrections), with **0/36 false writes** and **0 Host-rejected ops**.
     4. **Host Deterministic `foldLedger` (`Active HEAD` + `Tombstones` + `Open Questions`)**: In [`ST1`](../../experiments/st1-staging/REPORT.md) Part B, handing the live-staged & Host-folded ledger to a fresh Worker B session (`ledger_staged_C1`) achieved **6/6 (100%) full pass** (matching the gold oracle ledger `ledger_gold_C1` **6/6**) while reducing reasoning token cost by **58.4% (`252.7 -> 105.0` tokens)** and latency by **32.1% (`3.18s -> 2.16s`)** compared to re-reading the raw dialogue (`raw_noisy_C0`). Ablating `tombstones` (`ledger_staged_no_tombstone_C1`) caused falsification-evidence citation to collapse from **6/6 (100%) to 0/6 (0%)**, causally proving the necessity of explicit tombstones.
     5. **Hard Global/Local Boundary Compression (`COMPRESSOR_STRICT`) + Authoritative Override Handoff Contract (`RECEIVER_C1`)**: In [`TH1-B`](../../experiments/th1-b/REPORT.md), `COMPRESSOR_STRICT` achieved **24/24 (100%) zero global-rule leak**, and `RECEIVER_C1` eliminated stale-rule resurrection from **100% (8/8 resurrected in `compact_P0_C0`) down to 0% (120/120 passed across all `C1` conditions in `max`, `low`, and `none`)**, while cutting `max`-tier reasoning tokens on polluted inputs by **90.5% (`1708.6 -> 162.9`)** and latency by **4.0x (`18.12s -> 4.56s`)**.

### Scope & Repository Seal Boundary (诚实边界与仓库封箱声明)

ACMI remains a **mechanism-validated Alpha and research benchmark repository**, not a finished production-grade general long-term memory engine. With all 484 controlled ablation calls complete, **Path 1 (Mechanism Validation) is formally closed and sealed in this repository** as a permanent, reproducible research and benchmark asset. Subsequent **Path 2 (Lightweight Practical MVP Tooling)** engineering — packaging the five validated primitives into a standalone developer utility — will proceed decoupled from this research repository.

---

## 2. Comprehensive Experimental Evidence Matrix (全景实验证据矩阵)

### 2.1 Historical Baselines, Diagnostics, and Falsifications

| Study / Phase | Calls & Design | What Was Tested | Observed Outcome & Mechanism Lesson |
| --- | --- | --- | --- |
| [**Phase 0.9.10**](../experiments/phase-0.9.10-final-report.md) | 24 calls (local model) | Same-generation user answer + full structured attribution envelope | **0/24 usable native answers** under strict envelope validation. Heavy same-generation schema degrades primary answer delivery. |
| [**Phase 0.9.14 WorkAnchor**](../experiments/phase-0.9.14-work-anchor-report.md) | 24 calls (paired A/B) | Trusted request-scoped `WorkAnchor` for explicit continuation | Explicit continuation rose **0/4 -> 4/4 (100%)**; overall identity 8/12. Host-verified anchors solve explicit continuation, not implicit switching. |
| **FM1 (`finite-v1`)** | 48 calls (12 × 4-turn closed loops, C1/C2/C3) | Same-generation answer + full structured work-state JSON maintenance | **Falsified heavy state maintenance**: **4/6 decision reversals** (prose chose green `#1F7A5C`, state JSON wrote blue `#2B4C7E`), **UUID mutation (`102 -> 103`)**, and **ghost item retention**. (Resolved by **ST1** async staging + Host `foldLedger`). |
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

---

### 2.5 ST1: Asynchronous Staging State Operator Extraction, Host Deterministic Folding & Cross-Worker Tombstone Anti-Regression ([`experiments/st1-staging/`](../../experiments/st1-staging/REPORT.md))

**Objective**: Having falsified same-generation heavy state JSON maintenance in `FM1`, test whether **asynchronous single-step state operator extraction (`ASSERT`, `SUPERSEDE`, `OPEN_QUESTION`, `RESOLVE_QUESTION`, `NO_OP`) + pure-function Host deterministic folding (`foldLedger` with Host-allocated handles `D1../Q1..`) + explicit `tombstones` handoff** closes the write-fold-handoff loop across 6 real engineering domains (`S1_cache_eviction`, `S2_concurrency_lock`, `S3_async_retry`, `S4_frontend_hydration`, `S5_api_pagination`, `S6_build_cache`) and 12 boundary traps (**60 live API calls at `reasoning_effort=max`**: 24 multi-hop evolution steps in Part A1 + 12 boundary traps in Part A2 + 24 cross-worker handoff tasks in Part B). All internal handle strings (`D1/D2/D3/Q1`) were removed from the dialogue corpus so the extractor had to resolve `target_id` purely by inspecting `current_ledger_head`.

#### Table 2.5.1: Part A1 — 6-Scenario × 4-Step Multi-Hop Engineering Evolution Staging (24 Steps, De-Greenhoused)

| Step Kind | Steps | JSON Valid | Op Types Exact | Target ID Exact | Option/Key Exact | Falsification Evidence Cited | False Write Rate | Host Rejected Ops | Full Pass | Mean CoT Tokens | Mean Latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `birth` (Establish `OPT_A` + local distractor) | 6 | 6/6 (100%) | 6/6 (100%) | 6/6 (100%) | 6/6 (100%) | 6/6 (100%) | **0/6 (0.0%)** | **0** | **6/6 (100.0%)** | 56.2 | 1.99s |
| `falsify_and_supersede` (`D1 -> OPT_B` + `OPEN_QUESTION`) | 6 | 6/6 (100%) | 6/6 (100%) | 6/6 (100%) | 6/6 (100%) | 6/6 (100%) | **0/6 (0.0%)** | **0** | **6/6 (100.0%)** | 264.2 | 3.63s |
| `authority_trap_noop` (Junior rollback suggestion -> `ops:[]`) | 6 | 6/6 (100%) | 6/6 (100%) | 6/6 (100%) | 6/6 (100%) | 6/6 (100%) | **0/6 (0.0%)** | **0** | **6/6 (100.0%)** | 50.0 | 1.87s |
| `multi_hop_ruling` (`D2 -> OPT_C` + `RESOLVE_QUESTION Q1`) | 6 | 6/6 (100%) | 6/6 (100%) | 6/6 (100%) | 6/6 (100%) | 6/6 (100%) | **0/6 (0.0%)** | **0** | **6/6 (100.0%)** | 277.8 | 3.74s |
| **All Part A1 Steps** | **24** | **24/24 (100%)** | **24/24 (100%)** | **24/24 (100%)** | **24/24 (100%)** | **24/24 (100%)** | **0/24 (0.0%)** | **0** | **24/24 (100.0%)** | **162.0** | **2.81s** |

#### Table 2.5.2: Part A2 — 12 Frozen Boundary Trap Probes (Authority Conflict, Local Leak & Unauthorized Resurrection)

| Trap Category | Probes | Expected Behavior | JSON Valid | Op Types Exact | Key/No-Op Exact | False Write Rate | Host Rejected Ops | Full Pass | Mean CoT Tokens | Mean Latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `equal_authority_conflict` (Co-Lead A vs Co-Lead B tie) | 4 | ONLY `OPEN_QUESTION` (no `ASSERT`/`SUPERSEDE`) | 4/4 (100%) | 4/4 (100%) | 4/4 (100%) | **0/4 (0.0%)** | **0** | **4/4 (100.0%)** | 25.0 | 1.98s |
| `local_scope_leak_trap` (Local test timeout/port/seed) | 4 | `ops: []` (zero global writes) | 4/4 (100%) | 4/4 (100%) | 4/4 (100%) | **0/4 (0.0%)** | **0** | **4/4 (100.0%)** | 35.3 | 1.51s |
| `unauthorized_resurrection_trap` (Re-proposing tombstoned `OPT_A`) | 4 | `ops: []` (zero rollback writes) | 4/4 (100%) | 4/4 (100%) | 4/4 (100%) | **0/4 (0.0%)** | **0** | **4/4 (100.0%)** | 50.3 | 1.90s |
| **All Part A2 Traps** | **12** | **3 Categories × 4** | **12/12 (100%)** | **12/12 (100%)** | **12/12 (100%)** | **0/12 (0.0%)** | **0** | **12/12 (100.0%)** | **36.8** | **1.80s** |

#### Table 2.5.3: Part B — Cross-Worker Handoff & Tombstone Anti-Regression (6 Scenarios × 4 Arms = 24 Tasks)

| Arm ID | Contract | Handoff Context | JSON Valid | Active Option Exact (`OPT_C`) | Rejected Regression (`true`) | Tombstone Evidence Cited (`falsify_a`) | Open Blockers Exact (`[]`) | Full Pass | Mean CoT Tokens | Mean Latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `raw_noisy_C0` | `C0` | Verbatim Step 1–4 raw dialogue transcript (apple-to-apple) | 6/6 (100%) | **6/6 (100%)** | **6/6 (100%)** | **6/6 (100%)** | **6/6 (100%)** | **6/6 (100.0%)** | **252.7** | **3.18s** |
| `ledger_gold_C1` | `C1` | Gold Host-folded ledger (`active` + `tombstones` + `open_questions`) | 6/6 (100%) | **6/6 (100%)** | **6/6 (100%)** | **6/6 (100%)** | **6/6 (100%)** | **6/6 (100.0%)** | **104.8 (-58.5%)** | **2.18s** |
| `ledger_staged_C1` | `C1` | Actual Part A1 staged & Host-folded ledger (`active` + `tombstones` + `open_questions`) | 6/6 (100%) | **6/6 (100%)** | **6/6 (100%)** | **6/6 (100%)** | **6/6 (100%)** | **6/6 (100.0%)** | **105.0 (-58.4%)** | **2.16s** |
| `ledger_staged_no_tombstone_C1` | `C1` | Actual Part A1 staged ledger WITHOUT `tombstones` (`active` + `open_questions` only) | 6/6 (100%) | **6/6 (100%)** | **6/6 (100%)** | **0/6 (0.0%)** | **6/6 (100%)** | **0/6 (0.0%)** | 92.2 | 2.17s |

**Key Mechanism Takeaways from ST1**:
1. **Why Async Staging + Host Folding Succeeds Where `FM1` Failed**: In `FM1`, forcing the model to answer the user and rewrite a full state tree in the same generation caused 4/6 decision reversals and UUID drift. By extracting **delta operators asynchronously** (`ST1` Part A1/A2: **36/36 [100%]** accuracy, **0** false writes) and letting the deterministic Host reducer (`foldLedger`) allocate short handles (`D1/D2/D3`, `Q1`) and enforce transition invariants (**0** rejected ops), state maintenance becomes 100% deterministic.
2. **58.4% Reasoning Reduction over Raw Dialogue Re-Reading**: On a short 4-step transcript, `raw_noisy_C0` can still re-read the entire history at handoff time (**252.7** CoT tokens, `3.18s`), whereas `ledger_staged_C1` delivers identical **6/6 (100%)** accuracy at **105.0** CoT tokens (`2.16s`, **-58.4% reasoning cost**) with an $O(1)$ compact state snapshot.
3. **Causal Proof of `Tombstones`**: In `ledger_staged_no_tombstone_C1`, stripping `tombstones` while keeping `active` and `open_questions` preserved `active_option_exact` (**6/6**) and `open_blockers_exact` (**6/6**), but dropped `tombstone_evidence_cited` from **6/6 (100%) to 0/6 (0%)** (all 6 scenarios returned `"UNKNOWN"` for `rejection_evidence`). Once raw dialogue turns are compacted away, `tombstones` is the sole carrier of falsification provenance preventing re-proposed bad options from resurfacing.

---

## 3. Reproducibility & Forensic Custody Index (可复现性索引)

All four single-factor ablation suites (`TH1-B`, `TC5-B`, `TC3-B`, `ST1`) are committed in self-contained, zero-dependency directories under `experiments/` (using only Node.js built-in modules `node:fs`, `node:path`, `node:os`, `node:crypto`, `node:url`, `node:test`, `node:assert/strict`, and global `fetch`).

### 3.1 Anti-Self-Deception Engineering Discipline

Every experiment in `experiments/{th1-b,tc5-b,tc3-b,st1-staging}/` enforces four non-negotiable rules:
1. **Pre-Exposure SHA-256 Freeze**: All corpus scenarios, prompts, strippers, ledgers, and deterministic evaluators are hashed into `frozen-manifest.json` via `--dry-run` before the first live API request; `run.mjs` verifies every file digest before opening any network connection.
2. **Zero Semantic or Format Retries**: Only transport-layer errors (HTTP 408/429/5xx or socket disconnects) are retryable (`transport_retries` logged per call: `1` in `th1-b` `max`, `0` in `th1-b` `low`/`none`, `0` in `tc5-b`, `0` in `tc3-b`, `0` in `st1-staging`). Model outputs that fail JSON parsing or marker formatting are graded as failures as-is.
3. **Zero Output Repairers & Zero LLM Judges**: `TH1-B` and `ST1` grade strictly via `JSON.parse(rawContent.trim())` without stripping markdown code fences; `TC5-B` and `TC3-B` grade strictly via deterministic regex `parseOutput(rawContent)` and lexical `answerChecks`.
4. **Immediate Per-Call Raw Persistence**: Every single API completion immediately writes its full request body (with `Authorization: "Bearer [REDACTED]"`), response body, token usage, `reasoning_content`, `content`, timestamps, and latency via synchronous `writeFileSync` to `runs/<run-id>/raw/<ordinal>-<task-id>.json`.

### 3.2 Experiment Artifacts & Frozen Manifest Digests

| Suite | Directory & Unit Test | Frozen Manifest & Core Digests | Committed Live Run Directories (`runs/<run-id>/`) |
| --- | --- | --- | --- |
| **TH1-B** | [`experiments/th1-b/`](../../experiments/th1-b/REPORT.md)<br>`node --test experiments/th1-b/th1-b.node-test.mjs` | [`frozen-manifest.json`](../../experiments/th1-b/frozen-manifest.json)<br>`scenarios_sha256`: `2d606ba9...738b96`<br>`prompts_sha256`: `cc075c4a...4e7ed`<br>`task_matrix_sha256`: `aaf01431...48a35` | [`2026-11-21T13-33-35-351Z-max-all`](../../experiments/th1-b/runs/2026-11-21T13-33-35-351Z-max-all/REPORT.md) (88 calls)<br>[`2026-11-21T16-51-22-301Z-low-all`](../../experiments/th1-b/runs/2026-11-21T16-51-22-301Z-low-all/REPORT.md) (88 calls)<br>[`2026-11-21T16-57-06-935Z-none-all`](../../experiments/th1-b/runs/2026-11-21T16-57-06-935Z-none-all/REPORT.md) (88 calls) |
| **TC5-B** | [`experiments/tc5-b/`](../../experiments/tc5-b/REPORT.md)<br>`node --test experiments/tc5-b/tc5-b.node-test.mjs` | [`frozen-manifest.json`](../../experiments/tc5-b/frozen-manifest.json)<br>`probes_sha256`: `cc229e2e...5a120`<br>`stories_sha256`: `6ac18bc2...9960b`<br>`prompts_sha256`: `09fac134...717d5` | [`2026-11-21T17-34-29-621Z-max-all`](../../experiments/tc5-b/runs/2026-11-21T17-34-29-621Z-max-all/REPORT.md) (88 calls: 64 Exp A + 24 Exp B) |
| **TC3-B** | [`experiments/tc3-b/`](../../experiments/tc3-b/REPORT.md)<br>`node --test experiments/tc3-b/tc3-b.node-test.mjs` | [`frozen-manifest.json`](../../experiments/tc3-b/frozen-manifest.json)<br>`story.mjs`: `7dd55811...5884e08`<br>`stripper.mjs`: `f24c49fd...d47b3a8`<br>`evaluate.mjs`: `a9b49ef5...79e3056` | [`2026-11-21T17-59-15-189Z-max-all`](../../experiments/tc3-b/runs/2026-11-21T17-59-15-189Z-max-all/REPORT.md) (72 calls: 24 `S0` + 24 `S1` + 24 `S2`) |
| **ST1** | [`experiments/st1-staging/`](../../experiments/st1-staging/REPORT.md)<br>`node --test experiments/st1-staging/st1-staging.node-test.mjs` | [`frozen-manifest.json`](../../experiments/st1-staging/frozen-manifest.json)<br>`ledger.mjs`: `94d66ebf...2fa8ea4`<br>`scenarios.mjs`: `6f1383de...fd011d`<br>`prompts.mjs`: `e0144946...9ad8920`<br>`evaluate.mjs`: `e0fa3a2b...9b222c` | [`2026-11-22T04-16-54-059Z-max-all`](../../experiments/st1-staging/runs/2026-11-22T04-16-54-059Z-max-all/REPORT.md) (60 calls: 24 Part A1 + 12 Part A2 + 24 Part B) |
| **Phase 0.9.19 Raw Archive** | [`research/phase-0.9.19/RESEARCH-ARCHIVE.md`](../../research/phase-0.9.19/RESEARCH-ARCHIVE.md) | Heavy 573k-line raw evidence archive (`FM1`, `BS1`, `TC1–TC5`, `TH1`, `Gate 2` split ZIPs) | Retained on branch `origin/research/th1-handoff-20261120` under immutable tag [`archive/phase-0.9.19-raw-evidence`](https://github.com/Violet-2ai077/ACMI/tree/archive/phase-0.9.19-raw-evidence) (`25c25c6`) |

---

## 4. Five Validated Closed-Loop Architectural Primitives for Path 2 (面向第二条路线 MVP 的 5 条定型闭环原语)

With Path 1 mechanism validation closed across all 484 ablation calls, Path 2 (Lightweight Practical MVP Tooling, to be developed in a decoupled engineering repository) rests on five empirically verified primitives covering the full **Identity -> Staging -> Fold -> Compress -> Handoff** lifecycle:

### Primitive 1: Minimal Inline Identity Tail Marker + `SYSTEM_C1` Anti-Recency Contract + Host Light Catalog
- **Mechanism**: Every assistant response ends with a single lightweight token `<|task:N|>` (`N` in `1..999`) or `<|task:UNRESOLVED|>`, governed by the `SYSTEM_C1` Anti-Default Attribution Contract (forbidding Recency/Primacy guessing when a request matches shared features of multiple tasks).
- **Parser Refinement (from TC5-B Exp B `t3`)**: The host tail-marker parser permits `<|task:N|>` on its own trailing line immediately after a *closed* markdown code fence (```` ```...```\n<|task:N|> ````), rejecting only markers trapped *inside* an unclosed code fence.
- **Amortizing the Long-Gap Re-Scan Tax (from TC3-B `S2` & Phase 0.9.14 `WorkAnchor`)**: The host deterministically compiles a read-only, 1-line-per-task summary catalog from confirmed birth turns (and attaches a verified `WorkAnchor` when the operator explicitly selects a task), keeping long-gap reasoning cost flat (~150 tokens).

### Primitive 2: Independent Asynchronous Staging Restricted State Operator Extraction (`STAGING_EXTRACTOR_PROMPT`)
- **Mechanism**: Never ask the primary answering model to maintain or re-emit a nested JSON work-state tree in the same generation (`FM1` falsification). Instead, run an asynchronous out-of-band extractor on the latest step + read-only `HEAD` that emits only restricted delta operators: `ASSERT`, `SUPERSEDE` (requiring `target_id` and objective falsification `reason`), `OPEN_QUESTION`, `RESOLVE_QUESTION`, or `{"ops":[]}` (`NO_OP`).
- **Empirical Guarantee**: Validated in `ST1` at **36/36 (100%) accuracy** across 24 multi-hop steps (`Part A1`) and 12 authority/scope/resurrection boundary traps (`Part A2`), with **0% false writes** and **0 Host rejections**.

### Primitive 3: Host Deterministic `foldLedger` Workspace State Ledger (`Active HEAD` + `Tombstones` + `Open Questions`)
- **Mechanism**: A pure-function Host state machine (`foldLedger`) exclusively allocates short handles (`D1, D2...`, `Q1, Q2...`), rejects any model-invented IDs or illegal transitions (e.g., superseding an already tombstoned ID or non-global scope), and maintains three orthogonal collections:
  - `active`: currently effective workspace-global decisions;
  - `tombstones`: superseded historical options paired with their `superseded_by` handle and objective falsification `reason`;
  - `open_questions`: tracked architectural/boundary questions (`status: "open" | "resolved"`).
- **Empirical Guarantee**: Validated in `ST1` Part B (`ledger_staged_C1` **6/6 [100%]**, **-58.4% reasoning tokens** vs raw transcript; `ledger_staged_no_tombstone_C1` **0/6** on evidence citation when `tombstones` are removed).

### Primitive 4: Hard Global/Local Boundary Compressor (`COMPRESSOR_STRICT`)
- **Mechanism**: When compacting a task's historical transcript into a handoff summary (`task_note`), the compressor prompt enforces a strict schema boundary: summarize **only task-local state transitions and deliverables** (e.g., local code trails, local seals, file edits), and **strictly exclude** all workspace-global rules/footers.
- **Empirical Guarantee**: Validated at **24/24 (100%) zero global-rule leakage** and **100% local state retention** across `max`, `low`, and `none` reasoning tiers in `TH1-B`.

### Primitive 5: Authoritative Override Handoff Contract (`RECEIVER_C1`)
- **Mechanism**: Whenever a downstream session or handoff receiver is given task-scoped context (`task_records` or `task_note`) alongside the Host Workspace State Ledger (`memory` / `workspace_ledger`), the receiver system prompt enforces the explicit authority hierarchy (`RECEIVER_C1`):
  1. `active` / `memory` is the single authoritative source of truth for currently effective workspace-global keys; any conflicting value in task notes is a superseded remnant and must be ignored.
  2. `tombstones` is the authoritative forensic record of falsified historical options; proposals to revert to a tombstoned option without a new Owner override ruling must be rejected by citing its falsification `reason`.
  3. `open_questions` items with `status === "resolved"` are closed and must not be reported as active blockers.
- **Empirical Guarantee**: Validated at **120/120 (100%) pass rate, 0% stale resurrection, 0% local corruption** across `max`, `low`, and `none` tiers in `TH1-B` (**-90.5%** `max`-tier reasoning tokens on polluted histories) and **12/12 (100%)** across `ledger_gold_C1` and `ledger_staged_C1` in `ST1` Part B.
