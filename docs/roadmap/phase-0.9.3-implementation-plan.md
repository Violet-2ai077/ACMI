# Phase 0.9.3 实施计划（未开始）

**目的**：验证分层理解与有界增量状态能否在未消费的新自然语料上减少错误和不必要弃权。交付是明确边界的 default-off Shadow/离线工程，不是自动任务管理。依赖 Phase 0.9.2 局部研究结论、现有受信 Host 事务和安全测试。以本阶段最终 SHA 为新分支基点，0.9.3 必须另获用户指令。

| 工作包 | 内容与预计触点（不是现行 API） | 前置和验证 |
| --- | --- | --- |
| W0 隔离与预注册 | 新 worktree；冻结基线、配置、分母、seed、split clusters 和现有只读 scope；发布不含样本的预注册和 Holdout 消费条件 | 无；旧 0.9.1 Holdout 只保留取证收据，不做重跑 |
| W1 契约与包 | 在 `packages/contracts/src/` 定义 Understanding Context v0.1 的输入/输出、reason codes、ref 与预算；在 `packages/core/src/` 添加可插拔纯函数组包，不重写现有执行包 | W0；不合法 schema、未发行 handle、UTF-8 span、撤权、输入上限和截断否定先写失败测试 |
| W2 候选与身份 | 在现有有界 candidate index 外加保护型 active/closed 双视图；每个指称输出带证据/版本的身份结果；同名 hard negative、反例、跨域/closed 读权限测试 | W1；固定 authorized k，oracle vs real 分开；外域提示和无法定位都无副作用 |
| W3 证据与结构 | 用 Host 已有证据 API 验证 typed Decision/Result/Dependency/WorkNode、方向、无环、actor、因果、引用/否定/条件；生成 draft/clarify/abstain | W1/W2；Assistant 建议不被接受，tool/subagent 完成不得转成 Result/Join/Task 完成；property-based 合同测试 |
| W4 增量/Trigger | ephemeral scoped state、idempotent cursor、有限重放、授权/版本 fence、skip receipt、shadow sampling；仅观测已授权 dsh | W1/W2；乱序、重复、崩溃、A/B/A、撤权并发、超过 TTL、重启、压力数据；无副作用路径并行安全验证 |
| W5 新基准与双标 | 审计 800 场景计划（400/200/200），扩展成独立有引用的自然叙事；交付去标签盲包、schema、校准、独立 A/B、仲裁、custodian；样本、标注、协议各自哈希 | W0 后可并行；人工人员和保管方是外部前提，不得用 agent 模拟；按簇防泄漏 |
| W6 离线与受控 Shadow | 四架构配对评估，消融与故障矩阵；在隔离目录跑 stock dsh fixture 的只读 Shadow，核查目录、Journal 前后哈希、零网络/零 writes；不改安装副本 | W2/W3/W4；`pnpm check`、离线干净克隆、触发率与包大小/内存/延时报告 |
| W7 真模型评测（条件性） | 审批 provider/模型/地区/日志/数据去敏/费用上限后仅在离线数据中评测；锁 model snapshot/config；先 development/validation，再独立 custodial one-shot Holdout | W5/W6 且真实授权；不得用 scripted mock 代替；任一前提缺失就保留待完成 |
| W8 交付 | 安全审查、明确部署建议/回滚、中文报告、测试矩阵、打包清单与独立解压；0.9.3 也不默认允许上线 | W6；W7 可标为未执行，不作为已资格认证发布 |

依赖顺序：`W0 -> W1 -> W2 -> W3`；`W2 -> W4`；`W0 -> W5` 并行；`W3+W4 -> W6 -> W8`；`W5+W6+明确授权 -> W7`。每个工作包先用场景写最小失败测试，再做变更；前序接口冻结后跑变异/负面测试。验证命令从 `pnpm install --offline --frozen-lockfile`、`pnpm check`、`git diff --check`、Phase 0.9.2 的 Node 自测开始；新增模块自带独立 node/vitest CLI 和非旧 Holdout 的验证输入，待实现后登记实际命令。

## 拟议决策门槛，不能读成 0.9.2 实测

- 零跨 Workspace 泄漏、未确认写入、自动 Binding/接受 Result/满足 Join/关闭 Task；零旧 Holdout 消费。任何一次均阻止扩大 Shadow 或继续发请求。保护对象级未授权，即使均值上升也不允许用统计收益折抵。
- 离线报告结构化输出率、意图 macro-F1、身份/图断言错误、错误弃权、precision/coverage、Recall@k 与 oracle 候选差；按场景簇 bootstrap CI。归因时冻结相同输入和 fence。初始建议：可回答且有授权证据切片的 protected-claim precision 下界 ≥95%、intent/identity 覆盖分别 ≥65%；不足则保留只读，不能从小切片宣称通过。正式阈值、切片最低样本数和跨标签约束必须在 Holdout 解封前独立复核并预注册。
- 起始资源门槛：mandatory 完整；绝不超过 8 active + 2 可见 closed hints、12 KiB 或 3,000 估算输入 token、1+1 分析请求；本地 packet+validator p95 ≤10ms 为候选指标。计入冷/热和超时；若过载，明确退出而不是丢事实继续。
- 触发 safety 以新、带人工证据的相关事件覆盖衡量，不仅测调用节约：强制路径不可漏。所有合法 baseline 场景需通过，故障注入不得改变 protected state，单独报告确认拒绝/重启/空上下文。

回滚：禁用观察 feature flag、取消在途请求、提升 policy epoch 作废缓存/草案、只保留必要脱敏收据；用现有可信 reducer 和旧读路径。无 schema migration 或历史篡改是首选；若以后确需 migration，另行审批、备份和恢复验证。现有明确用户控制不依赖新 analyzer。
