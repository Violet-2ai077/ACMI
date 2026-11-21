# TH1-B: Stale-Rule Resurrection Single-Factor Ablation Report

- **Total Graded Tasks**: 88
- **Transport Retries**: 1 (semantic/format retries strictly 0)

## Experiment A: 2×2×2 Receiver Ablation Matrix (R × P × C)

| Condition | Repr (R) | Pollution (P) | Contract (C) | Pass Rate | Stale Resurrection Rate | Local Corruption Rate | JSON Valid Rate |
|---|---|---|---|---|---|---|---|
| `filtered_P0_C0` | `filtered` | `P0` | `C0` | 50.0% (4/8) | 12.5% (1/8) | 0.0% (0/8) | 62.5% (5/8) |
| `filtered_P0_C1` | `filtered` | `P0` | `C1` | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |
| `filtered_P1_C0` | `filtered` | `P1` | `C0` | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |
| `filtered_P1_C1` | `filtered` | `P1` | `C1` | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |
| `compact_P0_C0` | `compact` | `P0` | `C0` | 0.0% (0/8) | 100.0% (8/8) | 0.0% (0/8) | 100.0% (8/8) |
| `compact_P0_C1` | `compact` | `P0` | `C1` | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |
| `compact_P1_C0` | `compact` | `P1` | `C0` | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |
| `compact_P1_C1` | `compact` | `P1` | `C1` | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |

### Experiment A: Main-Effect Marginals

| Factor Level | Pass Rate | Stale Resurrection Rate | Local Corruption Rate | JSON Valid Rate |
|---|---|---|---|---|
| **P0** (Polluted w/ stale footer) | 62.5% (20/32) | 28.1% (9/32) | 0.0% (0/32) | 90.6% (29/32) |
| **P1** (Purged of stale footer) | 100.0% (32/32) | 0.0% (0/32) | 0.0% (0/32) | 100.0% (32/32) |
| **C0** (TH1 Baseline Receiver) | 62.5% (20/32) | 28.1% (9/32) | 0.0% (0/32) | 90.6% (29/32) |
| **C1** (Authority Contract) | 100.0% (32/32) | 0.0% (0/32) | 0.0% (0/32) | 100.0% (32/32) |
| **filtered** (Raw Local Transcript) | 87.5% (28/32) | 3.1% (1/32) | 0.0% (0/32) | 90.6% (29/32) |
| **compact** (Compacted Note) | 75.0% (24/32) | 25.0% (8/32) | 0.0% (0/32) | 100.0% (32/32) |

## Experiment B: Strict Compressor Boundary + Downstream Receiver Handoff

### B.1 Compressor Strict Boundary Check

| Condition | Pass Rate | Stale Footer Leak Rate (`compressor_leak_rate`) | Any Footer Leak Rate | Local Trail & Seal Preserved |
|---|---|---|---|---|
| `compress_strict` | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |

### B.2 Downstream Receiver Delivery on `COMPRESSOR_STRICT` Note

| Condition | Contract (C) | Pass Rate | Stale Resurrection Rate | Local Corruption Rate | JSON Valid Rate |
|---|---|---|---|---|---|
| `compact_strict_C0` | `C0` | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |
| `compact_strict_C1` | `C1` | 100.0% (8/8) | 0.0% (0/8) | 0.0% (0/8) | 100.0% (8/8) |
