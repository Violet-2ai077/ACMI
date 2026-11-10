# Incremental Understanding State v0.1

状态是可丢弃的解释缓存与审阅收据引用，不是第二 Graph Store。以 `workspace / session / incarnation / policy epoch` 隔离；不跨 Workspace、不开启持久 Binding。事实来自现有只读接口，模型输出只进入解释或 proposal 路径。

| 状态 | 事件 / 条件 | 转移 |
| --- | --- | --- |
| cold | 可验证 checkpoint，且 scope、versions 相等 | 以 checkpoint 恢复到 observing；否则空状态并以可信事件重放 |
| observing | 重复 event/cursor/digest | 幂等 no-op |
| observing | 无语义影响且有 Host 类型证明（如单纯心跳） | skip + reason receipt；抽样 Shadow 审计 |
| observing | 用户正文、权威焦点变动、相关因果证据、纠正或撤权 | 捕获当前授权快照，build；撤权先失效 |
| building | mandatory 段失败、权限错误、事件缺口 | 记诊断；等待重放/补取，不提交空意图 |
| analyzing | timeout/error/schema invalid | 记录失败，可在同快照预算内重试一次；新事件到达则取消/重建 |
| analyzing | 合法输出 | `validated draft`、`clarify` 或 `abstained`；不得直接 apply |
| draft | 过期、授权/Graph/Binding/候选 revision 改变 | 过期或显式 rebase 后重新验证；旧确认不转移 |
| draft | 可信 Host 收到显式确认 | 走既有事务 CAS、policy、证据复核、审计；被拒不改变事实 |

并发设计：接受快照前与返回后都做 fence；不靠按完成时间“最后写赢”。乱序/缺口按 Adapter 合同有界缓冲，超过就重取并明确 stale；与已处理 cursor 同位不同 digest 是冲突，不自动覆盖。持久观察收据用 `scope+incarnation+eventId+policyDigest` 幂等；同一 input digest 才能复用结果。若以后启用 checkpoint，cursor 与 state/draft ref 同事务进度（或可重放的幂等 outbox）；崩溃在分析前/后均不产生未经审阅的二次 apply。明确表明 checkpoint/重放不重发 Host command。

收缩设计：有界 retained slots、TTL、版本验证、冷热独立；TTL 不得把事实移除误解为事实否定。Session close 先清内存、取消未完成分析，授权撤销立即废弃封套和草案。指标为 trigger/skip 率、missed-trigger 审计、缓存命中与陈旧拒绝率、处理重复/乱序/恢复、序列长度切片、输入大小和延迟；生产阈值待新数据验证。
