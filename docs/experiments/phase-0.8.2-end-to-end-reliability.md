# Phase 0.8.2 端到端可靠性

独立 Node 进程使用 stock writer，三种边界直接退出，不运行 disposer：
通知尚未交给 drain、原生 flush 之后且 Store 未提交、SQLite 已提交一条
但外部未收到 supervisor ACK。重开持久状态，原生 resume 可能追加
native 事件；以 resume 后的 head 校验完全追平，并逐条检查稳定 id 和
原有事务记录不变。另测跨进程 Snapshot 和丢失 Scheduler 终止边。

128 个合成场景：8 个 family × 16；96 development、32 family holdout
（burst/snapshot）。不是现场流量/生产质量。sqlite/ordering/child family
直接使用事务层或合成元数据；rates/burst/reload/snapshot 使用 stock
runtime 和本地脚本 adapter。Graph restore 分开记录 open 和读切面。
测量为本地批次 settle 时间，并非逐事件采样。详细数值及限制随交付包提供。
