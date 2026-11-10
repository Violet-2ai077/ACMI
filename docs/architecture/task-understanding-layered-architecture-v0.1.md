# 分层增量 Task Understanding v0.1

**建议继续研究 Event-triggered Hybrid**：B 的分层语义、C 的有限状态、D 的可信事件调度。默认一次有界分析覆盖多个逻辑层，可选一次有界补检索/澄清，不将每个层变成串行模型请求。纯 Single-pass 保留为配对基线，纯 Hierarchical 保留为故障隔离对照。选型以边界和可诊断性为依据，不代表真实模型精度排序。

- **事实面**：Adapter、Event Store、既有 Binding 与 Graph 读视图由 Host 确立事实和 Scope。模型不能产生事实，事件本体不含模型发出的伪造 actor。
- **理解面**：只读观察 → trigger 和隔离的 ephemeral state → Understanding Context Package → 一个可替换离线分析接口 → intent、identity、work structure 的分层输出/弃权。模型回包是输入数据；与事实库完全分开。
- **验证面**：严格 schema、scope、证据 actor/因果/范围、closed/stale、依赖方向和循环、当前对象版本、revision fence。这个层可以拒绝，但不授权提交。
- **审核面**：只读 Shadow 只记录脱敏收据。非 Shadow 路径若将来经独立审核开放，才由现有 trusted Host Inbox/事务接收显式动作；replay、超时、skip 和 recommendation 均无副作用。

Core 只定义不依赖 Provider、dsh 或持久化的类型、校验和纯状态折叠；dsh Plugin 转换 cursor、Journal/Tool/Subagent 事件，持有 scope adapter 和有界重试。既有 Context Assembly 仅提供经 Host 授权的 active Task 读摘要，不接收分析草案作为执行上下文。未来 Global Memory 是独立的、需授权的检索来源；即使接入也只提供有来源/期限的候选提示，不能作为身份裁决、Runtime Fact、自动 Binding 或跨 Workspace 通道。

| 已有代码 | 保留的能力 | 不声称已有 |
| --- | --- | --- |
| `packages/core/src/task-candidate-retrieval.ts` | 有界候选排序、Scope 过滤 | 可靠多指称身份消歧、closed tombstone 界面 |
| `packages/core/src/incremental-understanding.ts` | 旧增量入口与预算 | 本文的跨层假说状态机或新的模型选择 |
| `integrations/dsh/src/qualification-evaluation.ts` | Phase 0.9.1 的离线 packet 和保护证据验证 | 端到端真实模型结果或新 Holdout 已签收 |
| `integrations/dsh/src/qualification-shadow.ts` | 既有只读观察模式 | 本阶段在线触发、运行时权威改造 |
| `integrations/dsh/src/graph-store.ts` | 显式 trusted lifecycle/review/apply、审计和 CAS | 模型 writer、自动 Binding/Result/Join/完成 |

预算提案（未获生产验证）：Host 组包+校验 p95 初始目标 ≤10 ms（固定本地冷/热数据量分别报告），最多 8 个 active 候选和 2 个授权内只读 closed hints，完整输入双上限 12 KiB/3,000 估算 tokens；最多 1+1 semantic calls，必须记录超时/重试与失败分母。系统只在证据和授权合格时继续，否则 abstain/clarify。真实模型 timing 和费用目前不适用。

图源：[组件与信任边界](phase-0.9.2/recommended-architecture.mmd) · [时序与并发拒绝](phase-0.9.2/sequence-flows.mmd) · [增量状态机](phase-0.9.2/understanding-state.mmd)。
