# Phase 0.8.2 Ingestion 验证

实际 Agent 的启动 attach 与后续创建、持续通知 max-wait、两个 Session 的
轮转、限制/overflow、自动 reconcile、reload 中断、静默时零历史读取、
权限移除、关停期限和重开后追平均有用例。挂载新 Supervisor 不扫描未授权
Session 或历史目录。SQLite 限页返回 `limit`；已提交坐标不回退，也不假称
失败坐标已提交。放宽限额后从同一原始 Journal 恢复。

传输通知的背压不会暂停 stock Agent 写入；持续故障会降级或拒绝 attach。
Graph Store 锁冲突由真实第二连接验证；同进程 guarded reader 争用触发
自动 busy/backoff 并在释放后追平。多 Writer SQLite 争用不作为
支持拓扑。公开 flush 不接受取消参数；截止时间后不再确认事实，Native I/O
本身可能晚结束。
