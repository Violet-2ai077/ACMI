# Experiment log / 实验时间线

This is the research record, not the release changelog. `main` preserves
the ACMI experiment commits in order; the published Alpha tag is unchanged.
Each row describes what was actually tested and what was not established.

这里区分三类证据：离线合成数据和脚本、隔离的 dsh 原生运行验证、真实本地模型推理。通过其中一项，不等于通过端到端语义资格或生产验收。下表链接到原始阶段报告，保留历史时点的结论与停止原因。

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

## How to audit or replay / 如何核查与复放

- Each phase report records its evidence type and limits; recent phases link
  frozen preregistrations and identify the source commit. The paired studies
  use synthetic ground truth and deterministic scorers, not another model
  judge. Do not pool their different datasets or compare them as one leaderboard.
- [Replay evidence](evidence/README.md) preserves the inputs and outputs needed
  to recompute the nine real-model reports. Replaying a score does not rerun a
  model or independently re-observe the original inference.
- Earlier offline work is documented in the tracked scripts, fixtures, and
  phase-specific reports. The replay archive does not import private holdouts,
  original session journals, installed profiles, weights, or runtime binaries.

## Current decision / 当前判断

Keep explicit Host-validated continuation and causal Tool Result attribution.
Treat model metadata as a proposal, not authority; neither an anchor nor a
parsed envelope grants execution permission. For ambiguous work identity,
prefer explicit user confirmation. No production automatic routing, Binding,
Graph mutation, child-result acceptance, or Join follows from these experiments.
