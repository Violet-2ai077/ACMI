# ACMI R-C Capacity and R-E/R-A Performance Implementation Plan

> **For agentic workers:** 获得相应阶段授权后使用 superpowers:executing-plans 逐项执行。
> 本文件只供 Owner 审核，不是执行授权；不启动独立评审代理。

**Goal:** 从当前实际检查点推进容量决策与完整成本验收，不重复 Gate 1，不把有限负载速度改善当作容量闭合或模型 GO。

**Architecture:** 容量证明、固定负载性能和 live 资格分开决策。首先细化容量契约及预算，并准备一个固定候选的离线验收器；每一步都有独立退出条件，不自动接入 live。

**Tech Stack:** 现有 Node 24.16.0、内置文件/进程工具、确定性 Node 测试；仓库 Vitest 标准入口保持四 workers，性能进程另行串行执行。

**Spec:** [R2 研究设计](../../../research/phase-0.9.19/design/model-native-task-attribution-research-design.md)、[R-E/R-A/R-C 原提案](../../../research/phase-0.9.19/gate2/transaction-audit-capacity-proposal-2026-11-15.md)、[正确性与容量结果](../../../research/phase-0.9.19/gate2/transaction-audit-correctness-2026-11-15.md)。后者是当前结果；原提案中的待实现条目不重置已完成工作。

状态：**OWNER_REVIEW_ONLY**。日期：2026-11-15，Asia/Shanghai。
基线：`eb5d2c711b461da06245737b225deb14a3ba33c3`，已合并并推送 main。
本轮只新增方案及状态入口，不改代码、运行配置、旧报告或 main，不启动性能系列或模型。

## 1. 当前实际进度

| 事项 | 已有结果 | 本方案如何处理 |
| --- | --- | --- |
| R2 / Gate 1 | 设计已认可；离线 Harness/Evaluator 已完成 | 不重新实施，不把阶段回退至设计起点 |
| r1-r4 开发批次 | 原结果、失败和停止状态已归档；r4 35 次尝试后停止 | 不续跑、不补样、不改分 |
| R-O/R-S | 原五组性能验收失败，审计比为 1.3001–1.4863 | 保留失败，不以较慢 v5 替换原 v4 基线 |
| R-E/R-A | v6 binary 封套、全历史流式审计及选择性物化已离线实现 | 正确性已检查，不等于性能已通过 |
| 真实前缀差分 | 35 个尝试、35,308 个 read、99,985 条逻辑记录一致 | 可作为固定负载来源；不是模型新运行 |
| 研究回归 | 最近 main 上 208/208；82 模块语法检查 | 仅在相关实现变化时做针对性回归；不重复开发 Gate 1 |
| 仓库验证 | 固定四 workers 后 276/276、续接离线 30/30、构建及演示通过 | 这是测试调度修复，不是 R-E/R-A 性能验收 |
| R-C | CAPACITY_NOT_CLOSED | 存在实际反例，不只是缺少一次压力测试 |
| R-E/R-A 性能 | NOT_RUN | 需满足本方案前置条件并取得单独批准 |

## 2. Global Constraints

- 研究问题、C1/C2/C3、A/B、D 仅诊断、两轨分离、prompt、oracle、plan 不变。
- 576 个原计划槽位、36 对 D1/D2、seed、顺序不变；没有失败补齐或新模型额度。
- live admission 为 1,048,576 B；16384 output-token、131072 input-byte 参数不变。
- generation deadline 180000 ms、cleanup 5000 ms 不变；不扣除审计耗时延长生成。
- 现行每 capture/channel 4 MiB 是证据限制，不是获准提高到 4 MiB 的 live 响应上限。
- raw-first、read 边界、同步耐久确认、逻辑链与物理链、所有关键完整审计边界不减少。
- 选择性历史物化新增的完整审计必须计入成本；不得把 summary 当作完整 snapshot。
- 不自动增加 read-size/read-count、cleanup、帧大小、磁盘或审计超时停止规则。
- 不删除、迁移或覆盖旧证据，不更改旧分数；不重建 development 冻结包。
- 任何新存储预算、交付约束、布局或停止行为均另案审批；本轮不实施。

## 3. R-C 未闭合清单

| 缺口 | 当前证据 | 不能采用的推论 | 闭合所需条件 |
| --- | --- | --- | --- |
| RC-1 交付 read 字节 | 1 MiB 前缀后交付 3,145,729 B，总计 4,194,305 B，超过既有 wire channel；实测 evidence_write_failed、证据不完整并 halt | admission=1 MiB，因此完整归档只需 1 MiB；收到后切片等于约束底层分配 | 可信客户端交付上界 Q、内部缓冲边界，以及包含触发停止片段的归档预算 |
| RC-2 碎片化 metadata | 明确合成格式下，1 MiB 的逐字节 read metadata 精确为 180,292,538 B，超过 transport channel 4 MiB | 平均 read 大、真实样本没超过，所以可忽略；用合并/删 metadata 制造预算通过 | 覆盖允许碎片化的联合预算，或另批可证明等义的存储布局/新的交付约束 |
| RC-3 控制记录及派生输出 | pre_send、请求、响应、terminal 共享资源；terminal 可复制输出并 JSON 转义 | input-byte 参数就是整个 transport channel 上界 | 分别推导原字段最大编码及联合驻留/保存成本，计入独立 Base64 padding |
| RC-4 写入与审计内存 | 当前宽松帧 payload 上界 17,263,755,266 B；writer 仍物化整帧，当前 attempt/D2 审计仍保留 chunks | 64 KiB 文件读取块意味着常数或 64 KiB RSS；17 GB 格式可表示就可分配 | 单事务及所有并存对象的可用资源证明；如改流式写入/外存审计，另批架构及故障语义 |
| RC-5 整批及完整审计 | 0/35/576 仅稀疏恢复；binary 35 尝试文件 71,856,567 B 是一个观测 | 35 次通过可线性外推 576 次饱和可用；文件变小等于更快 | 576 原槽位物理证据、失败余量、RSS、所有完整审计及历史物化的联合预算 |

RC-1/RC-2 已足以否定“现行限制覆盖所有允许交付方式并完整归档”。再次运行相同反例
不会把它变成通过。遇到无法归档输入时如实失败并停止，是正确的失败处理，不是容量闭合。

### 3.1 已证明与未证明分开

- 已证明：最多一个 owned read 在途；cleanup 不发起新 read，最多取得一个非空交付。
- 已证明：generation 非空 read 的宽松上界为 W+1，W=1,048,576；包含可能触发越限的一次。
- 未证明：每次交付字节 Q、Fetch/解压/内部队列内存、空 read 处理成本。
- 不能把“cleanup 最多一次”写成“cleanup 字节有界”，也不能以历史最大 read 充当 Q。
- `W + Q + C` 暂作保守字节公式；只有逐路径证明 overshoot 与 cleanup 互斥后才能收紧。
- 新的原始字节切片若发生在大 Buffer 已分配之后，不能证明接收端内存有界；如隐藏原
  delivery 边界，还会改变证据语义。该方案不能作为本轮的无行为变化优化。

### 3.2 容量决策分叉

避免与研究条件 C1/C2/C3 重名，使用以下审批名称：

| 路径 | 作用与限制 | 推荐处理 |
| --- | --- | --- |
| CAP-KEEP | 所有现行约束保持原样 | 可继续固定历史负载的离线研究；容量仍未闭合，不能据此恢复 live |
| CAP-DELIVERY | 明确并证明受支持的客户端交付/缓冲契约；若新增拒绝规则，说明其统计影响 | 先做契约设计，不根据历史样本任选 Q/N；无可信上界则明确失败 |
| CAP-STORAGE | 改变证据 channel/总空间预算或布局，在 W 不变时保留全部原始交付语义 | 与 CAP-DELIVERY 分开批准；单纯增大预算不能解决无界 Q |
| CAP-MATERIALIZE | 改写整帧物化、当前 attempt/必要历史的内存路径 | 若所需资源超出现有实现能力，再提具体架构；不得自动引入 sidecar/index 或多次 write |

**推荐方向：先形成 CAP-DELIVERY + CAP-STORAGE 的联合设计，不先增加 read-count 停止条件。**
保留现有非空 read 个数的推导，证明实际交付字节契约，并如实预算所有碎片化证据。
这意味着现行 4 MiB transport 预算无法被悄悄保留为“充分”：180,292,538 B 仅是
一个已知反例的 metadata 数，不是新的推荐配置，且尚未加入控制记录等成本。
如所有约束都不允许改变，则接受 CAP-KEEP 的不闭合结论，不进行盲目上限搜索。

## 4. R-E/R-A 性能验收的两层前置条件

### 4.1 固定负载离线性能可以单独审批，但不是 live 资格

R-C 未闭合不禁止对一个确切有限负载进行测量；但必须先证明**该测量负载**的资源
可行性，并把结论限定为 `FIXED_WORKLOAD_PERFORMANCE_PASS/FAIL`。
不得写成“所有允许输入容量通过”或“可以开新批次”。也不得用较小负载取代原必测负载。

| 前置条件 | 当前状态 | 下一步必须交付 |
| --- | --- | --- |
| 当前候选的正确性 | 已有 208 项回归及完整差分；v6 离线限定 | 钉住当前源码及依赖摘要；如改代码，重新做受影响的正确性验证 |
| 原 v4 比较基线 | 历史基线可定位 | 核对原测量源码与 v4 选择方式，不将新 v4-like 实现冒称原基线 |
| 负载与计数一致 | 原最后请求及全 35 尝试有证据；guarded 62 步有正确性 fixture | 固定全部负载、操作顺序、read 分组、输入/输出 hash 和比较接口 |
| 成本范围完整 | 现有正确性工具不是完整性能验收器 | 纳入原屏障、额外全审计、选择性物化、请求编译和结果耐久保存；明确嵌套计时 |
| 有限负载资源可行 | 文件体积可观察，完整执行预算未提交 | 计算该固定系列的磁盘/进程/RSS/时间安排和故障余量，取得具体资源额度批准 |
| 验收器可信 | 待实现离线准备 | 用 fake clock/故障注入验证边界与判定，不用真实计时搜索参数 |
| 执行许可 | 未批准新性能系列 | 源码、矩阵、预算齐备后，另请 Owner 批准一次固定系列 |

选择性物化现在会再做一次全历史审计。不能只测 `auditSummary()` 就声称完整审计
成本降低；不能把完整 snapshot 的等价需求换成一个更小 summary 再直接比较。

### 4.2 live 恢复的额外硬条件

固定负载性能通过之后仍须依次具备：获批的受支持交付域与闭合容量预算；对应最终实现
的完整性/恢复验证；最终版本的性能证据；再单独批准 development 重新冻结和有限批次。
容量设计若改变 writer、decoder、审计或传输行为，旧性能结果不能自动继承到新实现。
本方案不授权这些动作，也不把下一计划坐标视为允许续跑已 halted 的旧批次。

## 5. 拟议性能矩阵与不变门槛

### 5.1 固定一个候选，不进行调参竞赛

建议分三个测量层，均为同一 v6 候选，每层五组配对、交替先后顺序、每臂新进程：

| 层 | 固定负载 | 目的及比较限制 |
| --- | --- | --- |
| P-L legacy 可比层 | 原最后一个请求：5,667 read、16,178 逻辑事件，原分组及原来源时间 | 保留原 v4 分母及旧计时定义，直接比较原门槛，不重新评分该失败输出 |
| P-H 历史审计层 | 原 35 尝试/99,985 事件；操作表含重开、完整 snapshot 及指定历史读取 | 分开计量初始归档与同等结果物化；候选不能仅返回 summary；保留完整审计次数 |
| P-G guarded 端到端层 | 既有 62 步 synthetic 请求/恢复/D 流程，固定输出、数据和顺序 | 比较同等请求与处置的总成本，明确含额外审计/物化；不是模型性能 |

这是 **3 层 × 5 对 × 2 臂 = 30 个测量子进程**的审批建议，不是本轮执行安排。
零模型调用；不以 30 个进程冒充独立研究故事。非计时正确性准备不计作性能重复。
稀疏 576 结果沿用其正确性标签；饱和 576 验收只能在容量设计闭合后另批，当前不安排。

P-L 的原测量源码为本地 `offline-ro-rs-20261115/benchmark-run-ledger-reconstructed.mjs`，
SHA-256 `71bc059f4a7c33f14b8f07383391b225b09df018a6e446b6b31ab6e167c5dcdb`，
使用其原 v4 模式；保留 reconstructed 标签。历史 v5 失败值仅展示，不作为分母。
P-H/P-G 若必须加接口适配器，要单独钉住与自测，将适配成本纳入范围，明确这是新的
同等工作量对照而非重现旧读数。若原 v4 无法支持同等流程，准备阶段就报告阻塞，
提交矩阵修订审核；不得删掉 D/恢复/物化步骤或悄悄换基线后开始计时。

### 5.2 门槛不变

- append/flush-request 次数减少至少 30%；分别列出两项，真实 write/flush 另如实计数。
- capture 配对耗时比中位数 <=0.80。
- 按 delivered read 的 p99 耗时比每组 <=1.25，不改成按 transaction 计。
- 同等有效工作量的完整关键边界审计耗时比、peak RSS 比每组 <=1.25。
- 任一正确性、完整性或恢复失败否决性能通过；不删慢值，不追加直到通过。

P-L 应用全部适用原门槛；P-H 应用完整审计/RSS门槛，capture 指标若无对应操作则
明确 N/A，不判通过；P-G 包含 capture 时继续应用适用门槛，完整审计/物化全计入。
guarded 总 wall、磁盘、绝对 RSS 和审计耗时必须报告，但不临时发明一个更宽的
端到端阈值。全系列必须全部适用项通过才给固定负载通过；缺测不能由其他层覆盖。

### 5.3 测量纪律和资源保护

- 固定主机、Node、文件系统、版本；性能子进程严格串行。Vitest 四 workers 不用于性能编排。
- 不与回归、构建、其他性能实验并行；记录无法排除的外部负载，不强杀无关进程。
- 保留原 cache 口径，不为某一臂清 OS cache；顺序及任何 warmup 必须在运行前固定。
- 标出 inclusive/exclusive timers；嵌套时间不可相加。来源 elapsedMs 不替换为回放耗时。
- 同时保留 legacy 可比 RSS（含同等 fixture）和进程各阶段成本；不扣掉候选独有物化。
- 预先提供每层输入副本、输出 journal、对照对象、失败文件和日志的总磁盘预算，
  测量整个子进程 RSS；报告每边界审计扫描字节、次数及累计耗时，不只测末次 reopen。
- 需要的离线 supervisor 时间/内存/磁盘保护属于**验收环境预算**，必须在执行清单中
  给出具体值并批准，不进入 live 配置或篡改原门槛。触发时记录资源失败/未完成，
  保留已有测量，不静默重跑；不能将提前终止样本记为低耗时。
- 遇到正确性/证据/存储故障或实现必须改动，终止该系列并保留版本；重新计时须另批。
  仅数值门槛失败而无安全/完整性故障时，完成已批准固定系列，不挑选停止点掩盖慢值。

## 6. 下一步实施任务，仅在批准后执行

以下路径均相对于仓库根。旧证据脚本的硬编码归档根保持不动；新工具使用新的独立根。
不把每次提交或计划中的测试命令当作本轮已获执行许可。

### Task 1：容量契约与联合预算设计包

**Files:** 新增 `research/phase-0.9.19/gate2/capacity-contract.mjs`、
`tests/gate2-capacity-contract.node-test.mjs`（位于同一 research 阶段目录下）、
`gate2/capacity-contract-proposal.md`。只读现有 `capacity-proof.mjs` 和传输实现；不修改它们。

**Interfaces:** `assessCapacityContract({limits, deliveryProof, recordBounds, resourceBudget})`
返回 `{status, assumptions, requiredBounds, counterexamples, budgets}`。
任何未证明项保留为 unknown；status 只能是 `INCOMPLETE`、`INFEASIBLE` 或证明条件均满足的
`CLOSED_WITHIN_DECLARED_DOMAIN`。预算生成器不能导出运行配置或修改既有停止规则。

- [ ] 先写反例：没有 Q 却声明闭合、以 observed max 代替保证、只写 W 忽略 overshoot、
  小记录按总量乘 4/3、忽略 metadata/terminal/失败余量、稀疏 576 冒充饱和，均不得通过。
- [ ] RED 后实现纯预算计算；来源分为原约束推导、实现契约、精确编码、观测，不混用。
- [ ] 证明 cleanup/overshoot 控制流，枚举所有同时驻留对象；无法证明的 Fetch/解压边界
  明确列出，不通过安装新上限或真实网络探测来填补。
- [ ] 提交 CAP-DELIVERY/CAP-STORAGE 的具体候选及数值依据、兼容性、证据与失败分类影响。
  若不能给可信 Q 或可用资源预算，返回不闭合的具体阻塞，不强行提交“可运行配置”。
- [ ] 运行定向 Node 测试及相关回归，留存新证据；不分配 17 GB 来展示测试规模。

**退出：** 一个可审核的容量设计包或明确不可行证明；不是容量实现批准。

### Task 2：性能验收器的离线准备

**Files:** 新增 `research/phase-0.9.19/execution/prepare-transaction-performance.mjs`、
`execution/measure-transaction-performance.mjs`、`tests/gate2-performance-contract.node-test.mjs`。
不改原 `accept-wire-evidence.mjs`、原账本、prompt/oracle/plan 或旧性能 JSON。

**Interfaces:** `preparePerformanceManifest({candidate, baseline, workloads, environment, budget})`
返回固定摘要清单及阻塞项；`evaluatePerformance(records, manifest)` 确定性判定原门槛。
测量入口默认拒绝执行；只有与清单摘要绑定的独立 Owner 性能执行授权才可启动真实计时系列。

- [ ] 用 fake clock/count/RSS 写 RED 测试：错误 read 分母、缺一个配对、遗漏物化成本、
  v5 代替 v4、候选变化、选最好重复、平均 audit 掩盖单组超标、负载不等价均失败。
- [ ] 实现输入与版本清单、计时边界、完整操作计数及判定；零网络，禁止导入 live runner。
- [ ] 用小型合成 trace 非计时验证 P-L/P-H/P-G 的接口与同等结果；不能为了兼容删除屏障。
- [ ] 只读计算真实固定负载的大小及历史操作工作量，提交磁盘、RSS、时间保护值及依据。
  不能用未获批的试跑来调 chunk 大小、改变帧格式或寻优。
- [ ] 输出带明确数值的执行清单、基线/候选/负载摘要、五组顺序和预算。任何资源参数
  仍未知时，不具备提交性能执行批准的条件。

**退出：** `PERFORMANCE_READY_FOR_OWNER_REVIEW`，或列出阻塞；没有性能成绩。

### Task 3：Owner 再批准后的一次固定性能系列

- [ ] 核对批准的清单、资源、版本、负载及历史证据摘要，先完成受影响的正确性回归。
- [ ] 按批准矩阵串行运行；逐进程保留完整输入、输出、失败、计数、环境和摘要。
- [ ] 自动判定并分层报告，不使用 LLM Judge，不重新评研究语义分数。
- [ ] 结论最多为固定负载性能通过/失败；R-C 状态单独列出，停止等待下一次 Owner 决策。

**退出：** 新性能报告；不自动改架构、重新冻结、增加停止条件或启动模型批次。

## 7. Review Focus 与判定联锁

1. **大 read 已分配再检查：** Task 1 必须将客户端分配与应用层接收检查分开，不伪造 Q 保证。
2. **metadata 与控制记录竞争：** Task 1 必须联合预算，不允许两个各自“没超限”的部分相加后失效。
3. **少返回结果伪装快审计：** Task 2 必须验证等价完整结果并将额外选择性全审计纳入时钟。
4. **原 v4 不支持 guarded 接口：** Task 2 必须在准备阶段拒绝不等价矩阵，不能运行后补解释。
5. **磁盘不足/worker 退出形成快值：** Task 2/3 必须将未完整执行项记为失败/缺测，保留尾部，不重试。

| 容量 | 固定负载性能 | 允许的结论 |
| --- | --- | --- |
| 未闭合 | 未执行 | 当前状态，只能继续获批的离线准备 |
| 未闭合 | 通过 | 仅该固定负载的性能通过；仍不能恢复 live |
| 已在获批域内闭合 | 失败/未执行 | 仍不能恢复 live |
| 已在获批域内闭合 | 最终版本通过 | 可以提交重新冻结/有限批次申请，不是自动执行许可 |

## 8. Owner 本次需要决定的事项

**推荐批准范围：仅 Task 1 + Task 2 的离线设计细化、工具实现及非计时正确性验证。**

- [ ] 不重复已完成 Gate 1；以当前已推送版本及原始历史失败为起点。
- [ ] 同意 CAP-DELIVERY + CAP-STORAGE 联合设计方向，但不先批准任何新数值、布局或停止条件。
- [ ] 同意准备一个候选、原 v4 分母及三层性能矩阵；兼容性/预算不足时回审，不擅自缩减。
- [ ] Task 1/2 交付后再审批 Task 3；不在本次批准 30 个计时子进程或饱和容量实跑。
- [ ] live W 保持 1 MiB；新模型批次、重新冻结、正式集成和 main 合并/推送均不随方案自动授权。

如 Owner 希望下一步直接执行性能系列，仍须先收到 Task 2 的完整清单和可行资源预算，
不能用此前笼统的离线实现授权代替这次执行审批。

## 9. 证据入口与本轮核验

- [当前研究状态](../../../research/phase-0.9.19/STATUS.md)。
- [原 v5 性能失败报告](../../../research/phase-0.9.19/gate2/wire-evidence-acceptance-2026-11-15.md)。
- [现行容量证明](../../../research/phase-0.9.19/evidence-index/capacity-proof.json)。
- [原始反例副本](../../../research/phase-0.9.19/evidence-index/overshoot-transport.json.raw)。
- [真实前缀差分](../../../research/phase-0.9.19/evidence-index/all35-correctness.json)。
- 原验收根：`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-ro-rs-20261115/`。
- 当前正确性根：`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-re-ra-rc-20261115/`。
- 推送/标准测试证据：`E:/codex-prj/ACMI/verification/phase-0.9.19/main-sync-workers4-20261115/`。

本轮只做文档自查、引用与摘要核对，不重放历史流、不运行模型、不做性能测量。
历史完成数和结果引用既有证据，不冒充本轮新执行。等待 Owner 审核后再实施。
