# ACMI Phase 0.8.2 最终报告

## A. 执行摘要

在隔离的 Windows Host 和 stock dsh npm 0.2.2-rc.1 上完成默认关闭的
Snapshot 治理、自动摄取/恢复和 Subagent 耐久证据。没有真实 Provider、
自动 Binding、自动结果接受、原生 Compact 替换、已安装 dsh 修改、Push
或 Release。Phase 0.9 未启动。

## B. Snapshot 生命周期

- 停止未来贡献：**GO**。TTL、撤销授权、版本变化、注册释放和退休均让
  动态回调停止供应。
- 同 Session 的历史快照撤回/删除：**NO-GO**。既有未防护对照实际观察到
  旧 Snapshot 重发。Native Compact 可读取并复制历史信息，不是擦除工具。
- Host 挂载公开 `llm/stream`、在 adapter 前退休整个旧 Session：
  **CONDITIONAL GO**。Source/Built 普通与 Compact 路径实际测得旧哈希
  仍在候选消息，但无旧请求到达 adapter。进程退出后原始 Snapshot 仍可
  从 Journal 读出，新 Session 可按新授权恢复。
- 没有删除、改写 Journal 或召回已披露数据。Provider 保留情况未知；
  未受控请求/进程、在途请求和不带可识别标记的派生副本不受完整覆盖。
  生产持久注入：**NO-GO**。

## C. Ingestion Supervisor

**GO（隔离单 Host）**。公开 lifecycle 自动 attach 明确授权的 live Session。
有 debounce、max wait、单 lane 轮转、总/每 Session queue cap、批次与
截止时间、有限退避、周期性 cursor/head 检查、overflow 显式 gap 和有界
reconcile。SQLite transaction 原子提交事实/Graph 引用/cursor，不声称
通知 exactly-once。启动、reload、两个活跃 Session、授权撤销、可恢复
SQLite 限页和超时关停均走真实运行路径。无 gap 热路径不读历史 Journal。

## D. Subagent Durability

**GO（native evidence）/ NO-GO（Scheduler run replay）**。真实 Scheduler
的 catalog/descriptor 和 native turn 可按 exact parent/child incarnation
恢复。start/end、run id、结果 promise 属于进程内通知。非正常退出后即便
恢复了 child 成员关系和 open turn，也不能推出 Scheduler 已结算。未从
完成推断检查、消费、接受、等待/继续或 join。

## E. 端到端和性能

独立进程故障点包括 drain 前、native flush 后而 Graph commit 前，以及
Graph commit 后/外部 ACK 前；重启追平 native head，旧事实保持稳定，
没有重复。独立进程还验证 Snapshot 隔离和没有 terminal 的 child 恢复。
128 个 agent-generated 合成场景按 family 切分 96 development / 32 holdout。
基准结果 JSON 和各层 p50/p95 在 ZIP 内，UTF-8 上界估算不是目标模型 token。
没有生产流量、网络 Provider、跨机器压测或 SLA 结论。

## F. 回归与范围

交付内有完整 Source/Built、workspace、Contracts、typecheck、既有阶段
benchmark、Zstandard Quickstart、clean clone 和故障证据。未验证完整
多进程 Writer、真实电源中断、跨进程 Provider 撤回、外部 child 生命周期、
父进程死亡后自动恢复其 Scheduler；测试只证明 native 已 durable 的事实。

## G. Git / 交付

Phase 0.8.1 基线 `a0c1bc48efb534bebc67e7a008107ca3e48030da`。
只在本地分支 `acmi/phase-0.8.2` 提交。最终提交、工作树及 ZIP
SHA-256 验证收据附于外层报告。

## H. 后续建议（未执行）

如需生产使用，先取得不进入 native history 的 request-scoped contribution，
或平台级强制请求策略及明确保留/删除治理。若要恢复 Scheduler 运行状态，
需要上游持久 run identity/transition、授权及 mailbox/lease 协议。
