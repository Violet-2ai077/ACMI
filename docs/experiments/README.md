# Experiment log / 实验时间线

This is the research record, not the release changelog. `main` preserves
the ACMI experiment commits in order; the published Alpha tag is unchanged.
Each row describes what was actually tested and what was not established.

这里区分三类证据：离线合成数据和脚本、隔离的 dsh 原生运行验证、真实模型推理与单因素消融。通过其中一项，不等于通过端到端生产验收。下表链接到原始阶段报告与第一条研究路线（机制验证）终结汇总，保留历史时点的结论与停止原因。

| Phase | What was tested / 验证问题 | Observed outcome / 实测结论 |
| --- | --- | --- |
| [0.6–0.6.1](../source-provenance.md) | Pre-extraction read-only dsh journal pilot, scoped storage, and offline attribution | Conditional local read-only use; real models blocked, automatic Binding NO-GO. The legacy dsh fork and its Git history are not part of standalone ACMI. |
| [0.7 / Alpha](../releases/v0.1.0-alpha.1.md) | Standalone Core, explicit Binding, SDK, and a stock dsh adapter | Published Alpha with fixture-based validation; no claim about open task recognition. |
| [0.8](phase-0.8-final-report.md) | Task Graph, budgeted Context Packages, cross-session recovery | 120 offline cases; isolated synthetic dynamic context only. No native Compact replacement or model calls. |
| [0.8.1](phase-0.8.1-final-report.md) | Native event ingestion, SQLite persistence, causal results, and fresh-session recovery | Verified with an explicit Host Task/WorkNode selection; no automatic graph inference or real Provider calls. |
| [0.8.2](phase-0.8.2-final-report.md) | Snapshot lifecycle, bounded reconciliation, and native Subagent evidence | Opt-in isolated dsh checks passed in scope; stopping future snapshot contributions does not erase history or authorize accepting results. |
| [0.9](phase-0.9-final-report.md) | Incremental intent and graph proposals with transactional Host review | 350 synthetic cases and scripted predictors; proposals do not authorize Binding or lifecycle actions. |
| [0.9.1](phase-0.9.1-final-report.md) | Provisional multilingual qualification, bounded retrieval, and evidence gates | Offline and read-only Shadow; provisional labels were not human-reviewed. |
| [0.9.2](phase-0.9.2-final-report.md) | Forensics on 522 archived records and offline prototype comparison | Excessive abstention and missed graph proposals exposed; the consumed set was not rerun or used for tuning. |
| [0.9.3](phase-0.9.3-final-report.md) | Layered understanding, four arms and seven ablations, read-only dsh Shadow | Engineering checks passed; semantic qualification did not. |
| [0.9.4](phase-0.9.4-final-report.md) | Open synthetic corpus and blinded annotation workflow | No formal human double annotation, independent custody, or real-model evaluation; production NO-GO. |
| [0.9.5](phase-0.9.5-final-report.md) | Read-only identity advice using explicit trusted evidence | The bounded contract passed; not deployed in dsh, not automatic routing. |
| [0.9.6](phase-0.9.6-final-report.md) | One authorized antecedent with fixed candidates and resolver | Improvement in the controlled synthetic comparison; no production qualification. |
| [0.9.7](phase-0.9.7-final-report.md) | Frozen model/rule comparison and offline scoring/replay | Replay readiness passed; no real inference in this phase. |
| [0.9.8](phase-0.9.8-final-report.md) | Qwen3-8B local inference on the frozen 0.9.7 synthetic cases | 56 generations; tested response contract and semantic gates failed. |
| [0.9.9](phase-0.9.9-final-report.md) | Pinned Qwen3-14B via a stock isolated dsh Agent Loop | 16 native completions; read-only connection passed, cross-session semantics failed. |
| [0.9.10](phase-0.9.10-final-report.md) | Same-generation answer plus attribution envelope | Both fields in 24/24 raw completions, but 0/24 usable native answers. Pilot stopped before the main A/B, permutations, or post-hoc control. |
| [0.9.11](phase-0.9.11-assignment-pilot-report.md) | Scoped assignment refs and separate answer validation | Native answers and tool causality passed in isolation; the semantic gate did not. |
| [0.9.12](phase-0.9.12-role-paired-report.md) | Role-aware paired output | Intent and related-task observability improved; primary attribution missed its gate. Windows Session ID failure stopped the variant run; no inference retry. |
| [0.9.13](phase-0.9.13-evidence-triples-report.md) | Literal evidence and removal of the Binding hint | User and Assistant exact accuracy both stayed 4/8 in every arm. |
| [0.9.14](phase-0.9.14-work-anchor-report.md) | Trusted request-scoped WorkAnchor | Explicit continuation rose 0/4 → 4/4; User and Assistant each reached 8/12 with anchors, below the 9/12 model gate. |
| [0.9.15](phase-0.9.15-relative-proposals-report.md) | Relative proposals with identical anchors in both arms | User 8/12 → 10/12; Assistant 7/12 → 9/12. Both explicitly new-goal cases improved; ambiguous identity did not qualify. |
| [0.9.16](phase-0.9.16-unresolved-link-report.md) | Optional Assistant reference to the current unresolved User subject | New option selected 0 times; Assistant stayed 7/12 and User fell 11/12 → 9/12. In both arms, User identity was correctly unresolved in all 5 clarification cases, but Assistant was wrong in all 5. |
| [0.9.19 (`FM1`, `BS1`, `TC1–TC5`, `TH1`)](../../research/phase-0.9.19/STATUS.md) | Heavy state JSON (`FM1`) vs inline tail markers (`BS1`, `TC1–TC5`) and task compaction handoff (`TH1`) | `FM1` falsified heavy same-generation state JSON (4/6 decision reversals, UUID drift). `TC1–TC4` passed 86/86 inline marker turns. `TC5` exposed 3/4 implicit-ambiguity default guesses; `TH1` exposed 0/2 compact handoff stale-footer resurrection. |
| [Path 1 `TH1-B`](../../experiments/th1-b/REPORT.md) | Stale-rule resurrection single-factor ablation across 8 scenarios × `{max, low, none}` (264 calls) | Uncontracted `compact_P0_C0` resurrected stale footers 8/8 (100%) in all tiers. `RECEIVER_C1` achieved **120/120 (100%) pass, 0% resurrection, 0% local corruption**, cutting `max` `P0` reasoning tokens by **90.5% (`1708.6 -> 162.9`)**. `COMPRESSOR_STRICT` achieved **24/24 (100%) pass, 0% leak**. |
| [Path 1 `TC5-B`](../../experiments/tc5-b/REPORT.md) | Implicit ambiguity Recency vs Primacy counterbalance (64 probe calls) + 24-turn closed-loop regression (88 calls) | Exp A `C0` proved **100% Recency bias** (`4/4` default guesses on `recent_relevant`, `0/16` older). `SYSTEM_C1` achieved **16/16 (100%) ambiguity clarify, 0/16 over-abstention, 16/16 unambiguous return** in Exp A, and **4/4 (100%) implicit ambiguity clarify** + `t7` cross-task fix in Exp B. |
| [Path 1 `TC3-B`](../../experiments/tc3-b/REPORT.md) | De-greenhouse 24-turn continuity stress test stripping historical CoT (`S1`) and client headers/proper nouns (`S2`) (72 calls) | `S0`, `S1`, and `S2` all achieved **24/24 (100%) full pass** (including `t24` at `gap=14`), falsifying the CoT/header greenhouse hypothesis. Long-gap (`gap=5..14`) mean CoT tokens rose **151.7 (`S0`) → 295.3 (`S1`) → 346.7 (`S2`)**. |
| [Path 1 `ST1`](../../experiments/st1-staging/REPORT.md) | Asynchronous staging state operator extraction (24 multi-hop steps + 12 boundary traps) + Host `foldLedger` + 4-Arm cross-worker tombstone handoff (60 calls) | Part A1 **24/24 (100%)** exact ops & `target_id` (zero handle leaks in dialogue), **0/24** false writes, **0** Host rejections. Part A2 **12/12 (100%)** trap immunity, **0/12** false writes. Part B `ledger_staged_C1` & `ledger_gold_C1` **6/6 (100%)** (**-58.4%** CoT tokens vs `raw_noisy_C0`); stripping `tombstones` dropped evidence citation to **0/6 (0%)**. |
| [Path 1 Synthesis](../research/path1-mechanism-validation-synthesis-20261121.md) | Full Path 1 Mechanism Validation synthesis (484 controlled ablation calls) and 5 closed-loop architectural primitives | Permanently retires model-maintained structured state JSON; freezes 5 validated closed-loop primitives for Path 2 MVP tooling and seals Path 1 in this repository. |

## How to audit or replay / 如何核查与复放

### Path 1 synthesis and Phase 0.9.19 checkpoint

- **[Path 1 Mechanism Validation Synthesis](../research/path1-mechanism-validation-synthesis-20261121.md)** consolidates all historical baselines (`FM1`, `BS1`, `TC1–TC5`, `TH1`, `Phase 0.9.14 WorkAnchor`) and the 484 controlled single-factor ablation calls in [`experiments/th1-b/`](../../experiments/th1-b/REPORT.md), [`experiments/tc5-b/`](../../experiments/tc5-b/REPORT.md), [`experiments/tc3-b/`](../../experiments/tc3-b/REPORT.md), and [`experiments/st1-staging/`](../../experiments/st1-staging/REPORT.md). Each ablation directory includes its pre-frozen `frozen-manifest.json`, unit tests (`node --test`), `summary.json`, and complete per-call `runs/<run-id>/raw/*.json` files.
- **[Phase 0.9.19](../../research/phase-0.9.19/STATUS.md)** records the earlier same-generation attribution harness, J1/S1/S2 reviews, and the links to `FM1`, `BS1`, `TC1–TC5`, and `TH1`. The 573k-line raw Phase 0.9.19 evidence archive is preserved on `origin/research/th1-handoff-20261120` under the immutable tag [`archive/phase-0.9.19-raw-evidence`](https://github.com/Violet-2ai077/ACMI/tree/archive/phase-0.9.19-raw-evidence) (`25c25c6`).

- Each phase report records its evidence type and limits; recent phases link
  frozen preregistrations and identify the source commit. The paired studies
  use synthetic ground truth and deterministic scorers, not another model
  judge. Do not pool their different datasets or compare them as one leaderboard.
- [Replay evidence](evidence/README.md) preserves the inputs and outputs needed
  to recompute the nine earlier local-model reports (Phases 0.9.8–0.9.16). Replaying a score does not rerun a
  model or independently re-observe the original inference.
- Earlier offline work is documented in the tracked scripts, fixtures, and
  phase-specific reports. The replay archive does not import private holdouts,
  original session journals, installed profiles, weights, or runtime binaries.
- The [first main-branch CI run](https://github.com/Violet-2ai077/ACMI/actions/runs/43249177088)
  exposed a fixture assumption: POSIX dsh keeps an empty `session.lock`
  beside the journal, while Windows uses a semaphore. The follow-up fixes
  journal selection in the test fixtures only; it does not edit prior scores
  or change runtime storage behavior.
- The [next CI run](https://github.com/Violet-2ai077/ACMI/actions/runs/43250159658)
  passed on Ubuntu and exposed slow-runner assumptions in Windows persistence
  fixtures. Follow-up checks wait for the durable state, keep the debounce
  test ahead of its first fallback poll, and stage one complete turn before
  reviewing its proposal. These are fixture changes, not model reruns.
- A [Windows retry](https://github.com/Violet-2ai077/ACMI/actions/runs/43251415026/attempts/2)
  still exposed two failures. The proposal fixture now completes Graph
  reconciliation before analysis, not just the Journal flush. The shutdown
  fixture flushes after checking the seal and replays with a larger, still
  bounded recovery batch. The seal and authorization assertions remain in place.

## Current decision / 当前判断

Path 1 (Mechanism Validation) is closed and sealed across all 484 controlled ablation calls:
1. **Permanently retire** same-generation heavy structured work-state JSON maintenance (`FM1` / `0.9.10`).
2. **Adopt the five validated closed-loop primitives** for decoupled Path 2 MVP tooling:
   - Minimal inline tail marker (`<|task:N|>` / `<|task:UNRESOLVED|>`) + Anti-Recency Attribution Contract (`SYSTEM_C1`) + host-compiled read-only light task catalog / `WorkAnchor` fallback;
   - Independent asynchronous staging restricted state operator extraction (`STAGING_EXTRACTOR_PROMPT` -> `ASSERT` / `SUPERSEDE` / `OPEN_QUESTION` / `RESOLVE_QUESTION` / `NO_OP`);
   - Host deterministic `foldLedger` Workspace State Ledger (`Active HEAD` + `Tombstones` + `Open Questions`, Host-allocated handles `D1../Q1..`);
   - Hard global/local boundary compressor (`COMPRESSOR_STRICT`);
   - Authoritative override handoff contract (`RECEIVER_C1`).
3. Keep explicit Host validation and causal Tool Result attribution. Model markers and staged operators remain proposals validated by the Host; neither an anchor nor a parsed marker grants autonomous tool execution permission.
