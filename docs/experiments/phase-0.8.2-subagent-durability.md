# Phase 0.8.2 Subagent 证据

真实 stock `dsh-subagent` 与 spawn-in-process 通过公开
`startActivation({ provider, label, request, signal, delivery })` 调度。
已发布 `dsh-subagent/lib/index.js:198-201` 发 live 通知，
`:817-834` 写 catalog，`:1806` 写 descriptor。分别观察到同一 run id
的 start/end；未将其落盘为原生事实。关停 child 后可恢复 catalog/descriptor
和本地 turn 完成坐标，无自动等待、结果接受或汇合。

第二组子进程在实际 child 请求挂起且 native parent/child Journal 均 flush
之后退出。新进程只使用显式 parent/child 引用，无需启动 Agent 即恢复
父子成员关系及未结束的 turn，Scheduler 状态保持 unknown。错误 incarnation
拒绝，重复 reconcile 提交零条。父进程中断后的继续执行、跨进程 mailbox
和旧 run id 恢复未验证，也不受支持。
