# Phase 0.8.2 Snapshot revocation

启动时先装 guard，失败则不要启用恢复。旧 Session 仍有可能留存内容：
撤销 read grant 并调用 `retire(sessionId)`；即使后者写失败，当前进程也
先停止贡献和转发。保持 guard 挂载直至整个 Host 停止处理模型请求。

不要用原 Session id 重开或 fork 作为“干净会话”，不要修改原 Journal。
使用新 id、无继承历史和新授权恢复选定任务。保持原始历史保存策略独立，
按上游/组织流程分别处理备份和 Provider 保留；ACMI 不报告已删除。
