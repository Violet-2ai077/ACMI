# TC5-B: Implicit Ambiguity Recency/Primacy Counterbalance & Anti-Default Attribution Report

- **Total Graded Tasks**: 88
- **Transport Retries**: 0 (semantic/format retries strictly 0)

## Experiment A: 32 Frozen Prefix Probes × {C0, C1} (64 Tasks)

### A.1 Overall C0 vs C1 Comparison

| Contract | Ambiguity Clarify Rate | Over-Abstention Rate | Unambiguous Return Rate | Marker Valid Rate | Answer Minimal Rate | Avg Reasoning Tokens | Avg Latency (s) |
|---|---|---|---|---|---|---|---|
| **C0** (TC5 Baseline) | 75.0% (12/16) | 0.0% (0/16) | 87.5% (14/16) | 93.8% (30/32) | 81.3% (26/32) | 236.8 | 4.48s |
| **C1** (Anti-Default Contract) | 100.0% (16/16) | 0.0% (0/16) | 100.0% (16/16) | 100.0% (32/32) | 100.0% (32/32) | 222.7 | 4.26s |

### A.2 Bias Decoupling Table (Ambiguous Probes Only: Recency vs Primacy)

| Contract | Prefix Recency (`recent_relevant`) | `UNRESOLVED` Marker Rate | Clarify Full Pass Rate | `guessed_recent` Rate | `guessed_older` Rate | `guessed_id1` (Primacy) Rate | `guessed_id2` Rate |
|---|---|---|---|---|---|---|---|
| **C0** | `recent_relevant="1"` (Recency=1, Primacy=1) | 75.0% (6/8) | 75.0% (6/8) | 25.0% (2/8) | 0.0% (0/8) | 25.0% (2/8) | 0.0% (0/8) |
| **C0** | `recent_relevant="2"` (Recency=2, Primacy=1) | 75.0% (6/8) | 75.0% (6/8) | 25.0% (2/8) | 0.0% (0/8) | 0.0% (0/8) | 25.0% (2/8) |
| **C0** | **All Ambiguous** | 75.0% (12/16) | 75.0% (12/16) | 25.0% (4/16) | 0.0% (0/16) | 12.5% (2/16) | 12.5% (2/16) |
| **C1** | `recent_relevant="1"` (Recency=1, Primacy=1) | 100.0% (8/8) | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 0.0% (0/8) | 0.0% (0/8) |
| **C1** | `recent_relevant="2"` (Recency=2, Primacy=1) | 100.0% (8/8) | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 0.0% (0/8) | 0.0% (0/8) |
| **C1** | **All Ambiguous** | 100.0% (16/16) | 100.0% (16/16) | 0.0% (0/16) | 0.0% (0/16) | 0.0% (0/16) | 0.0% (0/16) |

### A.3 Anti-Over-Abstention Breakdown (Unambiguous Return Control Probes Only)

| Contract | Return Target vs Recency | Return Marker Exact Rate | Full Pass Rate (`marker + lexical`) | Over-Abstention (`UNRESOLVED`) Rate | Wrong Candidate Rate |
|---|---|---|---|---|---|
| **C0** | `expected === recent_relevant` (Return to Recent Candidate) | 75.0% (6/8) | 75.0% (6/8) | 0.0% (0/8) | 0.0% (0/8) |
| **C0** | `expected !== recent_relevant` (Return to Older Candidate) | 100.0% (8/8) | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) |
| **C0** | **All Unambiguous** | 87.5% (14/16) | 87.5% (14/16) | 0.0% (0/16) | 0.0% (0/16) |
| **C1** | `expected === recent_relevant` (Return to Recent Candidate) | 100.0% (8/8) | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) |
| **C1** | `expected !== recent_relevant` (Return to Older Candidate) | 100.0% (8/8) | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) |
| **C1** | **All Unambiguous** | 100.0% (16/16) | 100.0% (16/16) | 0.0% (0/16) | 0.0% (0/16) |

## Experiment B: Original TC5 24-Turn Closed-Loop Regression under `SYSTEM_C1`

- **Protocol Valid**: 95.8% (23/24)
- **Canonical Marker Exact**: 95.8% (23/24)
- **Answer Minimal Lexical Pass**: 95.8% (23/24)
- **Full Turn Pass (`canonical + lexical`)**: 95.8% (23/24)
- **Implicit Ambiguity Clarified (`t6`, `t10`)**: 100.0% (4/4)
- **Unnecessary Abstentions**: 0
- **Strict Local Criterion Met**: `false`

### B.1 Key TC5 Failure Checkpoints (`t6`, `t7`, `t10`) Status under `SYSTEM_C1`

| Story | Turn | Kind | Expected Marker | Observed Marker | Marker Exact | Lexical Pass | Full Pass | Answer Preview |
|---|---|---|---|---|---|---|---|---|
| `pottery-notices` | `t6` | `ambiguous` | `UNRESOLVED` | `UNRESOLVED` | `true` | `true` | `true` | 请确认要压缩哪一场：成人陶艺课（周六10:00，南楼A室），还是亲子陶艺课（周六15:00，北楼B室）？两场均符合“周六陶艺课报名确认短信”。 |
| `pottery-notices` | `t7` | `return` | `2` | `2` | `true` | `true` | `true` | 【亲子陶艺课】报名已确认：周六15:00在北楼B室上课，请带围裙和湿巾。 |
| `pottery-notices` | `t10` | `ambiguous` | `UNRESOLVED` | `UNRESOLVED` | `true` | `true` | `true` | 请确认要调整哪一条报名确认：成人陶艺课（周六10:00，南楼A室），还是亲子陶艺课（周六15:00，北楼B室）？这两项活动都需带围裙和湿巾。 |
| `warehouse-queries` | `t6` | `ambiguous` | `UNRESOLVED` | `UNRESOLVED` | `true` | `true` | `true` | “库存去重查询”可能指两个独立查询：冷库 `cold_stock`（任务1）或常温仓 `ambient_stock`（任务2）。请确认要列出哪一个的排序与分组字段。 |
| `warehouse-queries` | `t7` | `return` | `2` | `2` | `true` | `true` | `true` | 对应常温仓 `ambient_stock` 的去重查询，分组与排序部分为： ```sql PARTITION BY sku ORDER BY updated_at DESC ``` 也就是按 `sku` 分组，保留 `updated_at` |
| `warehouse-queries` | `t10` | `ambiguous` | `UNRESOLVED` | `UNRESOLVED` | `true` | `true` | `true` | “按 `sku` 保留最新记录”的查询，可能指两种：冷库 `cold_stock` 查询，或常温仓 `ambient_stock` 查询。请确认是哪一个，我再写一句说明。 |

### B.2 Full 24-Turn Closed-Loop Trajectory Summary

| Story | Turn | Kind | Expected | Observed | Marker Exact | Lexical Pass | Full Pass |
|---|---|---|---|---|---|---|---|
| `pottery-notices` | `t1` | `birth` | `1` | `1` | `true` | `true` | `true` |
| `pottery-notices` | `t2` | `birth` | `2` | `2` | `true` | `true` | `true` |
| `pottery-notices` | `t3` | `return` | `1` | `1` | `true` | `true` | `true` |
| `pottery-notices` | `t4` | `birth` | `3` | `3` | `true` | `true` | `true` |
| `pottery-notices` | `t5` | `continue` | `3` | `3` | `true` | `true` | `true` |
| `pottery-notices` | `t6` | `ambiguous` | `UNRESOLVED` | `UNRESOLVED` | `true` | `true` | `true` |
| `pottery-notices` | `t7` | `return` | `2` | `2` | `true` | `true` | `true` |
| `pottery-notices` | `t8` | `return` | `1` | `1` | `true` | `true` | `true` |
| `pottery-notices` | `t9` | `return` | `3` | `3` | `true` | `true` | `true` |
| `pottery-notices` | `t10` | `ambiguous` | `UNRESOLVED` | `UNRESOLVED` | `true` | `true` | `true` |
| `pottery-notices` | `t11` | `return` | `1` | `1` | `true` | `true` | `true` |
| `pottery-notices` | `t12` | `return` | `2` | `2` | `true` | `true` | `true` |
| `warehouse-queries` | `t1` | `birth` | `1` | `1` | `true` | `true` | `true` |
| `warehouse-queries` | `t2` | `birth` | `2` | `2` | `true` | `true` | `true` |
| `warehouse-queries` | `t3` | `return` | `1` | `null` | `false` | `false` | `false` |
| `warehouse-queries` | `t4` | `birth` | `3` | `3` | `true` | `true` | `true` |
| `warehouse-queries` | `t5` | `continue` | `3` | `3` | `true` | `true` | `true` |
| `warehouse-queries` | `t6` | `ambiguous` | `UNRESOLVED` | `UNRESOLVED` | `true` | `true` | `true` |
| `warehouse-queries` | `t7` | `return` | `2` | `2` | `true` | `true` | `true` |
| `warehouse-queries` | `t8` | `return` | `1` | `1` | `true` | `true` | `true` |
| `warehouse-queries` | `t9` | `return` | `3` | `3` | `true` | `true` | `true` |
| `warehouse-queries` | `t10` | `ambiguous` | `UNRESOLVED` | `UNRESOLVED` | `true` | `true` | `true` |
| `warehouse-queries` | `t11` | `return` | `1` | `1` | `true` | `true` | `true` |
| `warehouse-queries` | `t12` | `return` | `2` | `2` | `true` | `true` | `true` |
