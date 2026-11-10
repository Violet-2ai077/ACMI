# ACMI Phase 0.9 工程报告

## A. Stage 1

原始 Phase 0.8 / 0.8.1 / 0.8.2 ZIP、内部 30 / 33 / 36 个 SHA-256、变更清单、提交及完整补丁均核对。三份历史补丁与相应 Git diff 字节一致。依次普通 Push 三个历史分支后，`git ls-remote` 与 GitHub API 返回完全一致的预期 SHA。公开 `main` 和 Alpha tag 未变。具体门禁、扫描范围和时间见交付包的 Push 报告。

## B. Phase 0.9

在 Phase 0.8.2 最终提交上新增默认关闭的增量理解。实现五类任务意图、显式拆解/并行分支、节点细化、依赖/后继、全 required 策略的 Join 提案、决策/约束/结果和下一步提案。任务切换和新建只形成建议。提案不是事实，执行结束不是逻辑工作完成，消费结果不是接受或汇合。

## C. 数据流与审查

真实 stock dsh 在隔离实验中运行：持久化通知 -> SQLite Runtime Facts -> 有界 delta/cut -> 规则或离线脚本 -> 结构化提案 -> Host Review -> append-only Graph Events -> Context Assembly。候选集合、证据、版本、重复、权限、环、主线基数和状态转换均验证。变更、审查收据和已接受来源索引在同一事务。审查支持全接受、全拒绝和暂缓，不实现部分确认。选择性建 Task/绑定、执行重关联、确认接受结果、满足 Join 和关闭 Task 不在语义 Apply 权限内。

## D. 基准

350 个合成样本，development 140 / validation 80 / holdout 130，35 个互斥模板。标签不是人工标注，结构化 mock 是已知输入的脚本，不代表真实模型效果。四基线的五类意图分数相同；0 错误合并、0 错误拆分，90 次 abstention。结构化 mock 270 个正确变更、0 假阳性；规则为 120 个。真实 SQLite 70 例、50 接受 / 10 stale / 10 cycle，70 幂等。精确性能和分组指标以 ZIP 内机器可读结果为准。

## E. 安全和限制

真实 Provider 请求为 0；不部署至已安装 dsh，不改原始 Journal，不向模型提供写能力、不自动绑定或接受结果，不自动满足 Join 或关闭 Task。Scope 限制本地单 Workspace/可信 Host，不承诺多租户隔离、生产数据或跨进程多 Writer。Subagent catalog/descriptor/native turn 能力保留；Scheduler 重放仍 NO-GO。Phase 0.8.2 旧快照守卫仍仅限受控 Host，生产持久注入与历史删除仍 NO-GO。后台仅处理明确配置 Task 的已分配事实；无归属用户证据由 Host 显式提交。全新空 Workspace 需 Host 先建流，未实现自动 Task bootstrap。

## F. 回归和交付

交付包包含命令和退出码、Source/Built、历史基准、Zstandard、Contracts、build/typecheck/lint、独立干净克隆、报告和完整 Git patch。外层报告记录最终本地 Commit、ZIP 路径、字节数与独立解压核验。Phase 0.9 不 Push、不发 Release。

## G. 后续建议

先以非模板盲留出集和人工仲裁验证意图判断，再考虑真实模型评估和更细粒度批准权限。继续保持自动 Binding、生产快照持久注入与模型图写入关闭。本阶段不启动 Phase 1.0。
