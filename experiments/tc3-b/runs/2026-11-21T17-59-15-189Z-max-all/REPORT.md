# TC3-B Report: De-Greenhouse 24-Turn Task Continuity Stress Test

- **Run ID**: `2026-11-21T17-59-15-189Z-max-all`
- **Protocol Version**: `TC3-B-de-greenhouse-strip-ablation-20261122`
- **System Prompt**: `SYSTEM_C0` (Verbatim original TC1-TC3 prompt; single factor varied = history stripping)
- **Model**: `deepseek-v4.1-flash` (`reasoning_effort=max`)
- **Started At**: `2026-11-21T17:59:15.189Z`
- **Completed At**: `2026-11-21T18:04:02.711Z`
- **Total API Calls**: `72` (3 conditions x 24 turns)
- **Transport Retries**: `0`

## 1. Overall Condition Comparison (24 Turns per Condition)

| Condition | History Retained | Strict Valid | Canonical Exact | Return Restoration (19 turns) | Answer Minimal | Full Pass | Closed-Fence Diagnostic | Mean Reasoning Tokens | Mean Latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `S0_baseline` | content + reasoning_content (Unstripped) | 24/24 (100.0%) | **24/24 (100.0%)** | 19/19 (100.0%) | 24/24 (100.0%) | **24/24 (100.0%)** | 0 | 182 | 3.66s |
| `S1_strip_cot` | content only (CoT stripped) | 24/24 (100.0%) | **24/24 (100.0%)** | 19/19 (100.0%) | 24/24 (100.0%) | **24/24 (100.0%)** | 0 | 232.1 | 4.25s |
| `S2_strip_cot_and_header` | content only + stripExplicitHeaders(content) | 24/24 (100.0%) | **24/24 (100.0%)** | 19/19 (100.0%) | 24/24 (100.0%) | **24/24 (100.0%)** | 0 | 232.5 | 4.06s |

## 2. Accuracy & Reasoning Effort Breakdown by Gap Span Bucket

- **`birth_or_continue`** (5 turns: `t1, t2, t4, t5, t7`, `gap_turns = 0`)
- **`short_return`** (16 turns: `t3, t6, t8, t10, t11, t13, t14, t15, t16, t17, t18, t19, t20, t21, t22, t23`, `gap_turns = 1..4`)
- **`long_return`** (3 turns: `t9` [`gap=5`], `t12` [`gap=5`], `t24` [`gap=14`])

| Condition | Gap Bucket | Turns | Canonical Exact | Answer Minimal | Full Pass | Closed-Fence Diagnostic | Mean Reasoning Tokens | Median Reasoning Tokens | Mean Latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `S0_baseline` | `birth_or_continue` | 5 | **5/5 (100.0%)** | 5/5 (100.0%) | **5/5 (100.0%)** | 0 | 195.4 | 161 | 4.16s |
| `S0_baseline` | `short_return` | 16 | **16/16 (100.0%)** | 16/16 (100.0%) | **16/16 (100.0%)** | 0 | 183.5 | 176.5 | 3.58s |
| `S0_baseline` | `long_return` | 3 | **3/3 (100.0%)** | 3/3 (100.0%) | **3/3 (100.0%)** | 0 | 151.7 | 153 | 3.28s |
| `S1_strip_cot` | `birth_or_continue` | 5 | **5/5 (100.0%)** | 5/5 (100.0%) | **5/5 (100.0%)** | 0 | 212 | 216 | 3.85s |
| `S1_strip_cot` | `short_return` | 16 | **16/16 (100.0%)** | 16/16 (100.0%) | **16/16 (100.0%)** | 0 | 226.6 | 208 | 4.15s |
| `S1_strip_cot` | `long_return` | 3 | **3/3 (100.0%)** | 3/3 (100.0%) | **3/3 (100.0%)** | 0 | 295.3 | 200 | 5.49s |
| `S2_strip_cot_and_header` | `birth_or_continue` | 5 | **5/5 (100.0%)** | 5/5 (100.0%) | **5/5 (100.0%)** | 0 | 248.6 | 216 | 4.10s |
| `S2_strip_cot_and_header` | `short_return` | 16 | **16/16 (100.0%)** | 16/16 (100.0%) | **16/16 (100.0%)** | 0 | 206.1 | 182 | 3.69s |
| `S2_strip_cot_and_header` | `long_return` | 3 | **3/3 (100.0%)** | 3/3 (100.0%) | **3/3 (100.0%)** | 0 | 346.7 | 295 | 5.98s |

## 3. Highlight: Turn 24 Extreme Long-Range Return (`south-confirmation`, `gap_turns = 14`, last visited at Turn 9)

| Condition | Expected Marker | Observed Marker | Strict Valid | Canonical Exact | Answer Minimal | Full Pass | Reasoning Tokens | Latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `S0_baseline` | `<|task:1|>` | `<|task:1|>` | PASS | **PASS** | PASS | **PASS** | 153 | 3.48s |
| `S1_strip_cot` | `<|task:1|>` | `<|task:1|>` | PASS | **PASS** | PASS | **PASS** | 200 | 5.95s |
| `S2_strip_cot_and_header` | `<|task:1|>` | `<|task:1|>` | PASS | **PASS** | PASS | **PASS** | 143 | 4.91s |

## 4. 24-Turn Trajectory Comparison Matrix (`S0` vs `S1` vs `S2`)

| Turn | Task Key | Kind | Gap | Bucket | Expected | S0 Observed (Full) | S1 Observed (Full) | S2 Observed (Full) | S0 CoT Tok | S1 CoT Tok | S2 CoT Tok |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| t1 | `south-confirmation` | `birth` | 0 | `birth_or_continue` | `1` | `1` (PASS) | `1` (PASS) | `1` (PASS) | 154 | 76 | 249 |
| t2 | `north-confirmation` | `birth` | 0 | `birth_or_continue` | `2` | `2` (PASS) | `2` (PASS) | `2` (PASS) | 161 | 367 | 216 |
| t3 | `south-confirmation` | `return` | 1 | `short_return` | `1` | `1` (PASS) | `1` (PASS) | `1` (PASS) | 120 | 222 | 338 |
| t4 | `paid-receipt` | `birth` | 0 | `birth_or_continue` | `3` | `3` (PASS) | `3` (PASS) | `3` (PASS) | 340 | 216 | 210 |
| t5 | `unpaid-reminder` | `birth` | 0 | `birth_or_continue` | `4` | `4` (PASS) | `4` (PASS) | `4` (PASS) | 185 | 93 | 393 |
| t6 | `north-confirmation` | `return` | 3 | `short_return` | `2` | `2` (PASS) | `2` (PASS) | `2` (PASS) | 202 | 194 | 169 |
| t7 | `pickup-notice` | `birth` | 0 | `birth_or_continue` | `5` | `5` (PASS) | `5` (PASS) | `5` (PASS) | 137 | 308 | 175 |
| t8 | `paid-receipt` | `return` | 3 | `short_return` | `3` | `3` (PASS) | `3` (PASS) | `3` (PASS) | 241 | 288 | 143 |
| t9 | `south-confirmation` | `return` | 5 | `long_return` | `1` | `1` (PASS) | `1` (PASS) | `1` (PASS) | 143 | 181 | 602 |
| t10 | `unpaid-reminder` | `return` | 4 | `short_return` | `4` | `4` (PASS) | `4` (PASS) | `4` (PASS) | 131 | 178 | 247 |
| t11 | `pickup-notice` | `return` | 3 | `short_return` | `5` | `5` (PASS) | `5` (PASS) | `5` (PASS) | 155 | 107 | 294 |
| t12 | `north-confirmation` | `return` | 5 | `long_return` | `2` | `2` (PASS) | `2` (PASS) | `2` (PASS) | 159 | 505 | 295 |
| t13 | `paid-receipt` | `return` | 4 | `short_return` | `3` | `3` (PASS) | `3` (PASS) | `3` (PASS) | 148 | 181 | 154 |
| t14 | `pickup-notice` | `return` | 2 | `short_return` | `5` | `5` (PASS) | `5` (PASS) | `5` (PASS) | 274 | 485 | 231 |
| t15 | `unpaid-reminder` | `return` | 4 | `short_return` | `4` | `4` (PASS) | `4` (PASS) | `4` (PASS) | 188 | 143 | 170 |
| t16 | `north-confirmation` | `return` | 3 | `short_return` | `2` | `2` (PASS) | `2` (PASS) | `2` (PASS) | 180 | 338 | 117 |
| t17 | `unpaid-reminder` | `return` | 1 | `short_return` | `4` | `4` (PASS) | `4` (PASS) | `4` (PASS) | 224 | 250 | 194 |
| t18 | `paid-receipt` | `return` | 4 | `short_return` | `3` | `3` (PASS) | `3` (PASS) | `3` (PASS) | 177 | 142 | 122 |
| t19 | `pickup-notice` | `return` | 4 | `short_return` | `5` | `5` (PASS) | `5` (PASS) | `5` (PASS) | 291 | 348 | 363 |
| t20 | `north-confirmation` | `return` | 3 | `short_return` | `2` | `2` (PASS) | `2` (PASS) | `2` (PASS) | 130 | 233 | 209 |
| t21 | `paid-receipt` | `return` | 2 | `short_return` | `3` | `3` (PASS) | `3` (PASS) | `3` (PASS) | 145 | 145 | 170 |
| t22 | `unpaid-reminder` | `return` | 4 | `short_return` | `4` | `4` (PASS) | `4` (PASS) | `4` (PASS) | 154 | 136 | 116 |
| t23 | `pickup-notice` | `return` | 3 | `short_return` | `5` | `5` (PASS) | `5` (PASS) | `5` (PASS) | 176 | 235 | 260 |
| t24 | `south-confirmation` | `return` | 14 | `long_return` | `1` | `1` (PASS) | `1` (PASS) | `1` (PASS) | 153 | 200 | 143 |

## 5. Failure & Anomaly Log

- **Zero failures across all executed turns** (`full_pass = 100%`).

