# Gate 2 离线准备

**2026-11-16当前工作约束：** [机制验证优先](../RESEARCH-PRIORITY.md)，工程只做到
支撑可信实验所必需。下列MC/SC等结果保留为历史工程证据，不自动续做其闭合链。
新工程任务必须对应具体机制实验及可信度阻塞；原P-G FAIL/G1/live限制不因此解除。

SC-S/F/N/M有限静态细化完成：[结果与未闭合项](sc-static-results-2026-11-16.md)。
已补齐显式同步来源链、分层存储合同和配对格式条件编码；native全域、部署持久化、
完整profile/原pretty输出容量与硬RSS仍未闭合。候选契约不生效，G1未批准；
P-G FAIL、live 1 MiB、原分数和门槛不变，不改实现或启动任何研究运行阶段。

MC结果已获认可；提交[SC-1实际同步与存储资格最小修订方案](../../../docs/superpowers/plans/2026-11-15-sync-storage-qualification-proposal.md)
供审核。分别审议同句柄显式同步、分层故障保证及剩余native/RSS证明范围，不把
较弱子证书当作原门槛通过。候选契约未生效，G1未批准，P-G FAIL/live 1 MiB及
全部历史与门槛不变；不改实现、不重评分或进入实验/性能/冻结阶段。

MC-N/R/S/M静态资格与合同细化已提交：[结果及未闭合项](mc-static-qualification-results-2026-11-15.md)。
当前native来源和错误子域可追溯；v4失败覆盖顺序、本地完成合同与576槽资源台账
已细化。发现当前字符串写入flush选项不能证明实际fsync的新资格缺口；不推断
历史丢失、不重评分。总容量/native/存储/RSS仍未闭合，候选契约未生效，G1未批准；
原P-G FAIL、live 1 MiB和全部门槛保持，不改实现或进入任何运行阶段。

S2结果已获Owner认可；新增
[MC-1最小闭合方案](../../../docs/superpowers/plans/2026-11-15-minimal-closure-contract-proposal.md)
仅供审核。聚焦native来源资格、未来reader失败措辞等价边界、受控本地stdout捕获
及RSS条件证书；不改冻结parser/评分，不启用候选契约，G1/P-G FAIL/live 1 MiB与
原门槛不变。本轮不修改实现或启动任何研究运行阶段。

S2-R/E/P/O/M 静态细化已完成：[结果总览](s2-static-proof-results-2026-11-15.md)、
[完整资源台账](joint-resource-proof.md)。已给出全报告条件编码界与 reader 成本关系；
全域失败接口、native错误及真实RSS仍未闭合。候选契约未生效，G1未批准，原分数、
冻结、证据、门槛和live 1 MiB不变；不自动进入实现或运行阶段。

Owner 已认可 ME-S 条件证明与未闭合结论。新增
[ME-S2 静态闭合方案](../../../docs/superpowers/plans/2026-11-15-me-s2-static-closure-proposal.md)
仅供审核：分别定义完整 reader 接受域、错误/报告编码、stdout 背压与 RSS 的证明
任务及需另批的契约变化。G1 仍未批准，G0/P-G FAIL/live 1 MiB 不变；本轮不改实现、
不重评分、不执行性能系列、重新冻结或启动模型批次。

ME-S 静态细化已提交：[证明与资源台账](me-s-static-proof-results-2026-11-15.md)、
[接口及等价性合同](me-s-interface-contract-2026-11-15.md)。G1 明确未获批准，继续 G0。
已推导条件编码界、576 槽位核心子项和前缀状态关系；非规范 reader 接受域、完整
错误/报告/队列成本与 RSS 仍未闭合，不能据子项预算批准采集。本轮未改实现或
运行研究测试/性能/模型，冻结材料、原分数、历史证据、P-G FAIL/live 1 MiB 不变。

Owner 已认可 J1；仅提交新的
[全历史物化与外部证据编码联合方案](../../../docs/superpowers/plans/2026-11-15-history-materialization-evidence-encoding-proposal.md)。
ME-1 保留逐记录提交及每次全审计，申请改变驻留方式和新派生 JSON 的空白编码。
它不是原 v4：若原 >=30% 计数改善仍适用则继续阻塞；任何窄范围的前瞻准入契约
必须由 Owner 明确批准，不能改写 P-G FAIL。本轮不改实现、不执行测试系列/重评分、
不重冻结或运行模型；live 1 MiB、冻结材料及历史证据保持不变。

Owner 仅授权的 J1 静态细化已完成：[交付、编码与 576 槽位证明](j1-static-proof-results-2026-11-15.md)。
新增两个静态阻塞：原 v4 全 journal 单字符串物化无法覆盖 576 槽位支持域；完整
pretty-result 的 usage 扩展可超出候选 X=16 MiB。客户端 Q/F 与控制记录界仍未闭合。
DC-EC-1 不进入 J2；候选数字未启用，P-G FAIL/live 1 MiB/冻结材料及历史证据不变。
本轮只有静态读取、微型算术及文档/完整性检查，没有实现、回放、重评分或模型批次。

Owner 已认可 S2 的范围及当前不准入结论；新提交
[交付契约与证据容量联合修订方案](../../../docs/superpowers/plans/2026-11-15-joint-delivery-evidence-capacity-proposal.md)。
候选明确列出新增交付域限制/截尾与证据预算，只有条件字节核算，尚无客户端及
完整资源可行性证明。本轮不改实现、不启用上限、不重冻结或启动模型；P-G FAIL 保留。

S2 审议已提交：[原门槛适用范围及采集路径](s2-acquisition-admission-review-2026-11-15.md)。
结论：当前没有合规可启用采集路径。候选相对性能门槛不要求 v4 比自身改善，但
原路径容量仍不闭合、旧批授权已结束；v6 的 P-G FAIL 不豁免、不重启计数优化。
本轮只有只读审议及文档更新，等待 Owner 审核；未改实现、重评分、重冻结或运行模型。

S1 已完成：[中期研究结论](../execution/s1-interim-research-conclusions-2026-11-15.md)。
已只读核对原分数、r4 实际输入/输出与闭环传递，分开解释字面表示差异和具体状态
问题；C2/C3 的 A/B 闭环仍未观察。未重评分、改实现、重冻结或启动模型批次。
S1 中期结论已获 Owner 认可，后续 S2 只读审议见上；P-G FAIL 和 live 1 MiB 保持不变。

最新 Owner 决议：接受 P-G 条件不可行结论，保留 FAIL，停止为计数门槛继续优化。
下一阶段仅提交 [核心归属研究路径](../../../docs/superpowers/plans/2026-11-15-core-attribution-research-next-stage.md)
供审核：建议先只读综合已有研究证据，再单独审议新增采集准入，不重做 Gate 1。
本轮不改实现、旧分数、冻结材料或门槛，不执行性能系列、重新冻结或模型批次。
以下工程验收与授权均保留为历史记录，不构成当前执行许可。

最新审议：[P-G 结构性屏障与条件不可行依据](../../../docs/superpowers/plans/2026-11-15-pg-structural-barrier-review.md)。
保留现行八个独立耐久确认点时，下界 496 高于门槛允许的 434；屏障内成本优化不解此题。
仅提交方案审核，未修改实现或运行新回放。下方保留原验证结果。

最新后续结果：[完整三层负载与测量桥接](workload-bridge-results-2026-11-15.md)。
P-G 非计时 append/flush-request 从 620 到 496，仅减少 20%，未达原 30% 门槛。
保持 BLOCKED；时间/RSS 验收、native supervisor 与 live 恢复均未获通过。
见 [测量及 supervisor 设计](measurement-supervisor-design.md)。下方为前序记录。

2026-11-15 最新检查点：Owner 已批准 Task 1/2 离线细化和工具验证。
交付 [容量契约](capacity-contract-proposal.md) 与
[性能验收器准备结果及资源建议](performance-preparation-results-2026-11-15.md)。
R-C 仍未闭合，性能准备 BLOCKED；未执行性能系列、重新冻结或新模型批次。
下面的合并/推送及 live 授权属于历史时点，不是本次执行许可。

当前状态以 [全阶段检查点](../STATUS.md) 和
[R-E/R-A/R-C 检查报告](transaction-audit-correctness-2026-11-15.md) 为准：
离线正确性已检查，容量不闭合，性能验收未执行。Owner 本次另行授权源码和文档
同步、合并 main 与推送；不因此获得新批次、重新冻结或正式 Host/Graph 集成授权。
下方记录保留各历史时点的权限与结论。

最新执行状态：Owner 另行批准重新冻结与有限开发新批次。r4 已按新协议运行，
35 次请求中 34 次传输完成，第 35 次因 `response_byte_limit` 全局停止；无重试、
补发或活动批次。见 `../execution/results-r4-2026-11-15.md`。下方离线禁用说明
保留为前次验收时点记录；本次 live 授权仅绑定 r4，不是后续批次的通用许可。

2026-11-15 协议修订：Owner 已授权 R-D/R-B 的离线实现与验收，见
`revision-implementation.md` / `revision-acceptance.md`。新增
`inline-profile.mjs`、`deadline-transport.mjs`、`revision-policy.mjs`，通过冻结
runtime 的 `protocol_revision` 显式选择。未配置时保留旧协议；未知配置拒绝。
v4 账本的合格 D2 截尾不算成功，但可继续下一原定坐标。当前新协议在 guarded
live 入口明确禁用，尚未获得重新冻结开发研究包或模型运行授权。
测试创建的 `synthetic-test` 包不属于正式研究冻结，不产生模型成绩。

2026-11-15 更新：已完成账本 capture 缓存修复和真实片段离线压力回放，见 `sink-repair.md`；新批次使用 development-r3 冻结包。历史集成报告中的“零真实调用”仅描述当时交付，不代表后续批次状态。真实执行证据与离线回放严格分开。

本目录是隔离的有限开发研究模块。完整 oracle、实际 prompt 冻结和发送前持久化账本已接通，并以合成响应验证；**没有执行真实模型实验或正式 ACMI 集成**。当前交付与复现入口见 `integration-report.md`。下方早期组件说明应结合该报告的最新边界阅读。

## 已实现

| 文件 | 职责 |
| --- | --- |
| plan.mjs | 校验 R2 第 5.5 节建议矩阵，生成稳定、带 seed 的独立会话 block 顺序 |
| request.mjs | 从内部 InputPacket 编译 provider-neutral 消息载荷，移除评分元数据 |
| readiness.mjs | 检查运行配置声明、预算声明和冻结/人工审定记录字段是否齐全 |
| config.template.json | 空值配置模板，不含实际模型、端点、价格或密钥 |
| cli.mjs | 只读 JSON、输出计划/配置预检/冻结材料报告；没有 live 子命令 |
| run-ledger.mjs | Gate 2 独立证据账本，全局调用/费用预留、原始字节追加、结算与恢复；当前证据明确标为 offline-ledger-test |
| freeze.mjs | 校验外部钉住的 manifest、实际文件字节与审定记录绑定；提供只返回已校验公有输入的接口 |
| corpus.mjs | 检查逐条件语料结构、状态/身份声明一致性和 SM 支持数；不替代语义审定 |
| development-corpus.mjs | 从固定叙事生成 144 份条件-轮次完整 oracle、出生映射、参考历史和负例 |
| development-evaluator.mjs | 不修改 Gate 1 的扩展确定性评分；有限词法答案检查与状态评分分离 |
| prompts.mjs / freeze-development.mjs | 实际 A/B/C0/D prompt、完整审定绑定、运行参数与源文件封存 |
| send-boundary.mjs | 精确计划成员校验、发送前预留、原始历史恢复、D1/D2 绑定和单次发送 |
| offline-verification.mjs | 明确标记为合成数据的端到端检查；禁止作为模型成绩或 live runner |

不修改 Gate 1 的 fake-only runner、证据根、原始归档或验收报告。新增测试仍位于研究模块的 tests 目录。账本只写 Gate 2 证据根，详细 API 与限制见 ledger.md。

## 使用

在当前 worktree 根目录运行：

```powershell
node research/phase-0.9.19/gate2/cli.mjs check research/phase-0.9.19/gate2/config.template.json
node --test research/phase-0.9.19/tests/gate2-plan.node-test.mjs research/phase-0.9.19/tests/gate2-request.node-test.mjs research/phase-0.9.19/tests/gate2-readiness.node-test.mjs
```

空配置预检返回 exit 2，并输出 missing 字段。参数错误返回 exit 1。配置声明齐全时返回 exit 0，**只代表字段及声明内部一致，不代表允许启动模型**；live_execution_ready 在此准备版本始终为 false。

计划命令：`node research/phase-0.9.19/gate2/cli.mjs plan <人工编制的开发清单.json>`。

冻结材料命令：`node research/phase-0.9.19/gate2/cli.mjs verify-freeze <manifest.json> <事前封存的SHA-256>`。格式、分区、大小限制和报告边界见 freeze.md；该命令只校验开发包，不解封验证集。

语料预检命令：`node research/phase-0.9.19/gate2/cli.mjs verify-corpus <manifest.json> <事前封存的SHA-256>`。在同一批已校验字节上继续检查 public/oracle 包装、条件、轮次、证据、状态和 SM 支持数；不足返回 exit 2，详见 corpus.md。exit 0 也不代表语义真值或 live 资格通过。

清单格式：

```json
{
  "split": "dev",
  "seed": "predeclared-seed",
  "families": [
    {
      "id": "human-authored-family-id",
      "category": "continuity",
      "recovery": "none",
      "turns": [{ "id": "t1", "difficulty": "simple" }],
      "probes": ["t2", "t8"]
    }
  ]
}
```

以上只是字段示意，故意不满足完整矩阵，不是数据集。有效清单要求六个不同 family，category 依次覆盖 continuity/switching/parallel/creation/branch-merge/ambiguity；每个八轮，简单/中等/困难数量为 2/2/4；两枚不同 probe 必须来自这些轮次。recovery 的 none/same-session/handoff 各两个 family。清单本身不证明恢复点或 SM 事件真实存在；完整语料检查另行实现。

每条件 192 次，三个条件共 576 次：432 closed-loop、72 A/B replay、72 D stage 调用。共 162 个独立 block；只随机排列整个 block，不打乱闭环轮次或 D 的 answer/marker 顺序。D 使用独立第一阶段答案，不能复用 C0/A/B。计划不创建会话、不执行调用、不追加 smoke 或失败补跑。

此版本只表示原 R2 固定建议批次。576 是计划数量，不是批准预算。若 Owner 选择更小试运行，应先定义其覆盖、probe 和调用配额，而不是运行时截取完整批次后声称完成矩阵。

## 请求边界

compileRequest 返回 body、serialized、request_hash、prompt_hash 和可选 answer_hash。body 是中间格式，不是任何厂商 HTTP request；未来 adapter 必须另行归档最终发送的完整 wire request。

- messages 保留原 role/source_id/content 和顺序，校验 sourceMap 一致性；不摘要、不修复历史标记。
- 不发送 family、category、difficulty、themes、identity_visibility、oracle 等内部评分字段。
- C1 允许目录目标/验收、活动集合和原始 model_proposed 投影；目录的任意 note 不自动发送。投影必须来自已通过 Gate 1 schema 验证的提案，不得从 oracle 构造。
- C2/C3 不发送目录、活动集合或额外投影；保留其原始历史内已有的身份标记。
- A/B 传递非语义 turn/base IDs 和四个空 UUID 槽位。C0/D1 只用正常回答提示，不提供标记槽位。
- D2 接收本对 D1 的原始答案字符串和摘要，不替换或重新生成答案。
- 底层 compiler 仍接收调用者 prompt；新发送边界仅接受完整冻结包内的四份实际 prompt。TEST 字符串仅用于原有组件测试。

## 预算和冻结声明

readiness 配置只接受凭据引用名，不读取变量值。端点声明限制为无用户信息、无查询参数、无 fragment 的 HTTPS URL；实际服务可达性和协议未验证。DSH 独立只读检查器可以检查指定 managed ref 的存在性，且不返回密钥，见 dsh.md。

声明的最坏成本为 calls × (max_input_tokens × input_price + max_output_tokens × output_price) / 1,000,000，向上取到百万分之一货币单位。只有声明所有计费 token 均受限时才计算；真实 reasoning、缓存、工具或额外计费项不能被忽略。此计算不是实时价格查询，也不是预算执行器；实际价格证据和 provider 限额仍需核验。

check 命令对 hash 字段仅检查格式，artifact_hashes_verified 始终为 false。verify-freeze 是独立的实际文件校验入口，成功后可证明材料字节及审定记录绑定一致，但仍不能验证人类身份、签名或审定质量。两个命令都不能靠填摘要或人名获得研究资格，也不会启用 live 执行。

## R-O / R-S offline storage revision (2026-11-15)

R-E/R-A correctness candidate: explicit offline `gate2-transaction-binary-v1`
selects v6, with a 112-byte binary header, complete logical JSON array and 32-byte
physical digest. `transaction-frame.mjs` and `stream-audit.mjs` retain full-history
validation; `ledger-state.mjs` shares the existing logical rules with legacy readers.
`auditSummary()` drops settled bodies only after validation. `readAuditedAttempt()`
binds a private audit token and performs another full audit for selected originals;
it never trusts a caller-modified summary or a stale head. Full `snapshot()` remains.

Correctness scripts: `execution/verify-transaction-audit.mjs` and
`execution/check-capacity-proof.mjs`. `capacity-proof.mjs` describes existing limits;
it does not configure runtime. Capacity is NOT CLOSED. No performance acceptance,
new response stop conditions, development refreeze or model batch is authorized.

Owner authorized offline implementation/acceptance only. `run-ledger.mjs` supports
explicit `storageProtocol: 'raw-first-transaction-v1'` only with
`evidenceKind: 'offline-boundary-test'`. The default and guarded live path remain
v4 with the existing 1 MiB response cap; no new freeze or live authorization exists.
`deadline-transport.mjs` optionally accepts synchronous `recordBatch` and
`accounting: true`. Raw metadata/bytes commit before decoding, and only deltas from
that read share the following derived transaction. No cross-read batching.
The existing guarded harness accepts `offlineStorageProtocol` only in offline mode
and retains frozen-input/request/reservation checks before its synthetic send.
It reports prepare, reserve, credential resolution, pre-send validation, terminal
audit, settlement, final audit and attempt-wall intervals. Result-file completion
remains unknown inside the boundary; it is not invented before the caller writes it.

`wire-accounting.mjs` is observational, not a marker evaluator. Capacity overflow
marks unknown bytes rather than changing decoder acceptance. Offline scripts are
`execution/accept-wire-evidence.mjs` and `execution/probe-wire-capacity.mjs`.
They refuse network fetch and use exclusive new artifact paths; an existing result
is not overwritten. Original histories are never migrated or rescored.
See wire-evidence-implementation.md and the acceptance report for measured gates,
limitations and capacity recommendations. These are not model research scores.

## 下一步所需输入

1. 已从本机 DSH web patch 定位模型别名、路由和有效凭据引用；不可变模型版本、完整有效 profile 和服务可达性尚未核实。
2. Owner 已明确不设置调用/费用上限；不再要求补充上限。实际币种/计费证据仍需核实，未知费用必须报告为未知而不是零。
3. Owner 已委托当前 assistant 承担场景与 Ground Truth 审定，并以审定结果为本阶段权威真值。不再等待额外人工审定者；需实际完成审定记录并冻结材料。现有工程 fixtures 不得直接升格为研究语料。

上述 oracle、委托审定、prompt、传输和发送前账本集成现已完成；详见 integration-report.md。实际服务兼容性、模型版本来源和计费仍未获得真实调用证据。旧配置预检不等同于新发送边界，也没有因工程测试通过而产生正式模型能力、Token 或延迟结果。

## 显式无上限策略

readiness 新增可选 `spending_policy`：

```json
{"mode":"uncapped","authorization_ref":"owner-2026-11-14","scheduled_calls":576}
```

只有该策略有效且 `limits.max_calls`、`limits.max_cost` 都显式为 null 时，才表示无额外调用/费用上限。缺失策略的 null 仍是缺配置。`scheduled_calls` 是固定实验样本量，不是费用授权；本版 planner/readiness 仍仅支持原 576 次建议矩阵。

无上限模式可令 `pricing:null`，此时不产生成本估算，也不声称费用为零。Token 窗口、输出长度和 timeout 仍是需要冻结的实验/传输参数。即使配置完整，`live_execution_ready` 仍为 false。

ledger 的显式 v2 策略和未知费用语义见 dsh.md。旧 v1 限额和历史证据不迁移、不改写。

## Owner 委托的模型审定

最新授权和研究边界见 owner-amendments.md。`gate2-freeze-v2` 要求一份独立分区的 authorization 记录，`gate2-review-binding-v2` 以路径和 SHA-256 绑定它；审定类型必须是 `owner-delegated-model-review`，评分方式必须是 `deterministic-only`。该模式允许作者与审定者为同一 assistant，不虚构第二个身份。

readiness 的 `freeze.review` 可增加 `mode:"owner-delegated-model-review"` 和 `authorization_sha256`。冻结校验实际验证授权记录字节及其 scope/reviewer/authority 绑定，而不是只认摘要格式。授权记录不进入模型可见 public inputs。

所有正式输出依然由确定性 Evaluator 评分；assistant 审定的是实验前的真值，不是实验后的模型答案。报告必须披露模型审定来源及非独立性。旧 v1 保持原审定规则，不改写历史；完整性报告也不会因此声称人工真实性、语义正确性或 live 就绪。

## 流式传输与开发场景进展

transport.mjs 已实现最终请求序列化、严格 SSE 解码及单次注入式发送组件；不默认联网，不读取凭据，不运行 Host。send-boundary.mjs 现已将其接入冻结计划和持久化账本。真实网络只在显式 live 模式使用原生 Fetch；本批未调用该模式。凭据回调仅在预留完成后执行，密钥不写入证据。

development-scenarios.md 提供六个不同故事、48 个轮次 / 49 个用户单元的原始消息。现已生成并封存 144 份条件-轮次 oracle，完整保留状态、出生关系、证据及负例；标签经 Owner 委托的当前 assistant 自审，而非独立人工审定。预检和黄金向量通过均不是模型成绩。
