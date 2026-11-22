# ST1 Report: Asynchronous Staging State Operator Extraction, Host Deterministic Folding & Cross-Worker Tombstone Anti-Regression

- **Run ID**: `2026-11-22T04-16-54-059Z-max-all`
- **Protocol Version**: `ST1-async-staging-host-fold-tombstone-20261122`
- **Model**: `deepseek-v4.1-flash` (`reasoning_effort=max`)
- **Started At**: `2026-11-22T04:16:54.059Z`
- **Completed At**: `2026-11-22T04:19:21.215Z`
- **Total Graded Tasks**: `60` (A1: 24 steps, A2: 12 traps, Part B: 24 handoffs)
- **Transport Retries**: `0` (Semantic/format retries: strictly 0)

## 1. Part A1: 6-Scenario × 4-Step Multi-Hop Engineering Evolution Staging (24 Steps)

| Step Kind | Steps | JSON Valid | Op Types Exact | Target ID Exact | Option/Key Exact | Falsification Evidence Cited | False Write Rate | Host Rejected Ops | Full Pass | Mean CoT Tokens | Mean Latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `birth` | 6 | 6/6 (100.0%) | 6/6 (100.0%) | 6/6 (100.0%) | 6/6 (100.0%) | 6/6 (100.0%) | 0/6 (0.0%) | 0 | **6/6 (100.0%)** | 56.2 | 1.99s |
| `falsify_and_supersede` | 6 | 6/6 (100.0%) | 6/6 (100.0%) | 6/6 (100.0%) | 6/6 (100.0%) | 6/6 (100.0%) | 0/6 (0.0%) | 0 | **6/6 (100.0%)** | 264.2 | 3.63s |
| `authority_trap_noop` | 6 | 6/6 (100.0%) | 6/6 (100.0%) | 6/6 (100.0%) | 6/6 (100.0%) | 6/6 (100.0%) | 0/6 (0.0%) | 0 | **6/6 (100.0%)** | 50 | 1.87s |
| `multi_hop_ruling` | 6 | 6/6 (100.0%) | 6/6 (100.0%) | 6/6 (100.0%) | 6/6 (100.0%) | 6/6 (100.0%) | 0/6 (0.0%) | 0 | **6/6 (100.0%)** | 277.8 | 3.74s |
| **All A1 Steps** | **24** | **24/24 (100.0%)** | **24/24 (100.0%)** | **24/24 (100.0%)** | **24/24 (100.0%)** | **24/24 (100.0%)** | **0/24 (0.0%)** | **0** | **24/24 (100.0%)** | **162** | **2.81s** |

## 2. Part A2: 12 Frozen Boundary Trap Probes (Authority Conflict, Local Leak & Unauthorized Resurrection)

| Trap Category | Probes | Expected Behavior | JSON Valid | Op Types Exact | Key/No-Op Exact | False Write Rate | Host Rejected Ops | Full Pass | Mean CoT Tokens | Mean Latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `equal_authority_conflict` | 4 | ONLY `OPEN_QUESTION` (no `ASSERT`/`SUPERSEDE`) | 4/4 (100.0%) | 4/4 (100.0%) | 4/4 (100.0%) | **0/4 (0.0%)** | 0 | **4/4 (100.0%)** | 25 | 1.98s |
| `local_scope_leak_trap` | 4 | `ops: []` (no global write for local params) | 4/4 (100.0%) | 4/4 (100.0%) | 4/4 (100.0%) | **0/4 (0.0%)** | 0 | **4/4 (100.0%)** | 35.3 | 1.51s |
| `unauthorized_resurrection_trap` | 4 | `ops: []` (no rollback to tombstoned `OPT_A`) | 4/4 (100.0%) | 4/4 (100.0%) | 4/4 (100.0%) | **0/4 (0.0%)** | 0 | **4/4 (100.0%)** | 50.3 | 1.90s |
| **All A2 Traps** | **12** | **3 Categories × 4** | **12/12 (100.0%)** | **12/12 (100.0%)** | **12/12 (100.0%)** | **0/12 (0.0%)** | **0** | **12/12 (100.0%)** | **36.8** | **1.80s** |

## 3. Part B: Cross-Worker Handoff & Tombstone Anti-Regression (6 Scenarios × 4 Arms = 24 Tasks)

| Arm ID | Contract | Handoff Context | JSON Valid | Active Option Exact (`OPT_C`) | Rejected Regression (`true`) | Tombstone Evidence Cited (`falsify_a`) | Open Blockers Exact (`[]`) | Full Pass | Mean CoT Tokens | Mean Latency (s) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `raw_noisy_C0` | `C0` | Verbatim Step 1-4 raw dialogue transcript (apple-to-apple) | 6/6 (100.0%) | **6/6 (100.0%)** | **6/6 (100.0%)** | **6/6 (100.0%)** | **6/6 (100.0%)** | **6/6 (100.0%)** | 252.7 | 3.18s |
| `ledger_gold_C1` | `C1` | Gold Host-folded ledger (`active` + `tombstones` + `open_questions`) | 6/6 (100.0%) | **6/6 (100.0%)** | **6/6 (100.0%)** | **6/6 (100.0%)** | **6/6 (100.0%)** | **6/6 (100.0%)** | 104.8 | 2.18s |
| `ledger_staged_C1` | `C1` | Actual Part A1 staged & Host-folded ledger (`active` + `tombstones` + `open_questions`) | 6/6 (100.0%) | **6/6 (100.0%)** | **6/6 (100.0%)** | **6/6 (100.0%)** | **6/6 (100.0%)** | **6/6 (100.0%)** | 105 | 2.16s |
| `ledger_staged_no_tombstone_C1` | `C1` | Actual Part A1 staged ledger WITHOUT `tombstones` (`active` + `open_questions` only) | 6/6 (100.0%) | **6/6 (100.0%)** | **6/6 (100.0%)** | **0/6 (0.0%)** | **6/6 (100.0%)** | **0/6 (0.0%)** | 92.2 | 2.17s |

## 4. Per-Scenario Part B Matrix (6 Scenarios × 4 Arms)

| Scenario | Expected Active / Falsify A | `raw_noisy_C0` | `ledger_gold_C1` | `ledger_staged_C1` | `ledger_staged_no_tombstone_C1` |
| --- | --- | --- | --- | --- | --- |
| `S1_cache_eviction` | `versioned_etag` / `stale_read_14pct` | **PASS** (act=versioned_etag, rej=true, evid=true, blk=true) | **PASS** (act=versioned_etag, rej=true, evid=true, blk=true) | **PASS** (act=versioned_etag, rej=true, evid=true, blk=true) | FAIL (act=versioned_etag, rej=true, evid=false, blk=true) |
| `S2_concurrency_lock` | `fencing_token_cas` / `deadlock_tx_38` | **PASS** (act=fencing_token_cas, rej=true, evid=true, blk=true) | **PASS** (act=fencing_token_cas, rej=true, evid=true, blk=true) | **PASS** (act=fencing_token_cas, rej=true, evid=true, blk=true) | FAIL (act=fencing_token_cas, rej=true, evid=false, blk=true) |
| `S3_async_retry` | `durable_outbox_jitter` / `worker_pool_exhaust_503` | **PASS** (act=durable_outbox_jitter, rej=true, evid=true, blk=true) | **PASS** (act=durable_outbox_jitter, rej=true, evid=true, blk=true) | **PASS** (act=durable_outbox_jitter, rej=true, evid=true, blk=true) | FAIL (act=durable_outbox_jitter, rej=true, evid=false, blk=true) |
| `S4_frontend_hydration` | `streaming_suspense_shell` / `lcp_4600ms` | **PASS** (act=streaming_suspense_shell, rej=true, evid=true, blk=true) | **PASS** (act=streaming_suspense_shell, rej=true, evid=true, blk=true) | **PASS** (act=streaming_suspense_shell, rej=true, evid=true, blk=true) | FAIL (act=streaming_suspense_shell, rej=true, evid=false, blk=true) |
| `S5_api_pagination` | `composite_ulid_cursor` / `deep_page_timeout_12s` | **PASS** (act=composite_ulid_cursor, rej=true, evid=true, blk=true) | **PASS** (act=composite_ulid_cursor, rej=true, evid=true, blk=true) | **PASS** (act=composite_ulid_cursor, rej=true, evid=true, blk=true) | FAIL (act=composite_ulid_cursor, rej=true, evid=false, blk=true) |
| `S6_build_cache` | `cas_chunked_zstd` / `tar_corrupt_race_11` | **PASS** (act=cas_chunked_zstd, rej=true, evid=true, blk=true) | **PASS** (act=cas_chunked_zstd, rej=true, evid=true, blk=true) | **PASS** (act=cas_chunked_zstd, rej=true, evid=true, blk=true) | FAIL (act=cas_chunked_zstd, rej=true, evid=false, blk=true) |

