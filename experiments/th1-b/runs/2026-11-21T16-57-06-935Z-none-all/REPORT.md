# TH1-B: Stale-Rule Resurrection Single-Factor Ablation Report

- **Total Graded Tasks**: 88
- **Transport Retries**: 0 (semantic/format retries strictly 0)

## Experiment A: 2×2×2 Receiver Ablation Matrix (R × P × C)

| Condition | Repr (R) | Pollution (P) | Contract (C) | Pass Rate | Stale Resurrection Rate | Local Corruption Rate | JSON Valid Rate |
|---|---|---|---|---|---|---|---|
| `filtered_P0_C0` | `filtered` | `P0` | `C0` | 37.5% (3/8) | 62.5% (5/8) | 0.0% (0/8) | 100.0% (8/8) |
| `filtered_P0_C1` | `filtered` | `P0` | `C1` | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |
| `filtered_P1_C0` | `filtered` | `P1` | `C0` | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |
| `filtered_P1_C1` | `filtered` | `P1` | `C1` | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |
| `compact_P0_C0` | `compact` | `P0` | `C0` | 0.0% (0/8) | 100.0% (8/8) | 0.0% (0/8) | 100.0% (8/8) |
| `compact_P0_C1` | `compact` | `P0` | `C1` | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |
| `compact_P1_C0` | `compact` | `P1` | `C0` | 62.5% (5/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |
| `compact_P1_C1` | `compact` | `P1` | `C1` | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |

### Experiment A: Main-Effect Marginals

| Factor Level | Pass Rate | Stale Resurrection Rate | Local Corruption Rate | JSON Valid Rate |
|---|---|---|---|---|
| **P0** (Polluted w/ stale footer) | 59.4% (19/32) | 40.6% (13/32) | 0.0% (0/32) | 100.0% (32/32) |
| **P1** (Purged of stale footer) | 90.6% (29/32) | 0.0% (0/32) | 0.0% (0/32) | 100.0% (32/32) |
| **C0** (TH1 Baseline Receiver) | 50.0% (16/32) | 40.6% (13/32) | 0.0% (0/32) | 100.0% (32/32) |
| **C1** (Authority Contract) | 100.0% (32/32) | 0.0% (0/32) | 0.0% (0/32) | 100.0% (32/32) |
| **filtered** (Raw Local Transcript) | 84.4% (27/32) | 15.6% (5/32) | 0.0% (0/32) | 100.0% (32/32) |
| **compact** (Compacted Note) | 65.6% (21/32) | 25.0% (8/32) | 0.0% (0/32) | 100.0% (32/32) |

## Experiment B: Strict Compressor Boundary + Downstream Receiver Handoff

### B.1 Compressor Strict Boundary Check

| Condition | Pass Rate | Stale Footer Leak Rate (`compressor_leak_rate`) | Any Footer Leak Rate | Local Trail & Seal Preserved |
|---|---|---|---|---|
| `compress_strict` | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |

### B.2 Downstream Receiver Delivery on `COMPRESSOR_STRICT` Note

| Condition | Contract (C) | Pass Rate | Stale Resurrection Rate | Local Corruption Rate | JSON Valid Rate |
|---|---|---|---|---|---|
| `compact_strict_C0` | `C0` | 87.5% (7/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |
| `compact_strict_C1` | `C1` | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |
