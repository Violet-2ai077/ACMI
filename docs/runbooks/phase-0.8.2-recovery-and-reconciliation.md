# Phase 0.8.2 Recovery and reconciliation

确认运行进程/Store 的排他所有权与挂载 marker；使用已授权 live Session
重新启动 Supervisor。针对离线子 Agent 由 Host 提供 exact reference，使用
`reconcileKnownDshSession`，不要启动 Agent 来伪造缺失的结束事件。

遇到超限、冲突、损坏或截断，保存脱敏错误码和 cursor。不要覆写 Journal、
跳过 anchor 或推进缺失位置；先从可信备份审计，再显式安排 repair。
恢复 Scope 或存储容量后调用 `requestReconcile` 或重启 Supervisor。
已提交但 ACK 丢失属于可幂等恢复；未落 native Journal 的通知无法恢复。
