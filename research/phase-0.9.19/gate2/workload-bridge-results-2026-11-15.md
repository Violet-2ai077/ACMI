# 三层负载、原 v4 对照与测量桥接准备结果

Owner 本轮批准继续离线操作表、read 分母、原 v4 等价、资源证明及非计时故障验证。
日期：2026-11-15。对应 [测量与 supervisor 设计](measurement-supervisor-design.md)。

## 1. 当前判定

**不得进入性能系列。** P-G 在非计时完整回放中已经出现确定性的计数门槛失败：
原 v4 的 append/flush-request 各 620 次，v6 各 496 次，减少 20%，低于未改变的 30%。
这不是计时噪声，不靠增加重复数解决，不删除该层或只算有利 capture 子集。

R-C 通用容量仍未闭合。磁盘的固定输入/schema 预算可条件核对；完整 RSS、绝对耗时及
native supervisor 可行性仍未证明。本轮的出口为 `BLOCKED_BY_COUNT_GATE`，同时保留
资源证明缺项。未执行任何性能系列、研究重新冻结或模型调用。

这个结论只涉及当前存储候选在既定工程负载/门槛下的资格，**不是模型任务归属机制
的研究 NO-GO**。本轮没有产生新的模型能力证据，也未重评任何历史输出。

## 2. 操作表与 read 分母

| 层 | 原定负载 | 非空 read | 补充边界 |
| --- | --- | ---: | --- |
| P-L | 原最后请求、16,178 个逻辑事件 | 5,667 | 原失败状态保留；不补完整回答 |
| P-H | 原全部 35 尝试、99,985 个逻辑事件 | 35,308 | 每次 settle 后审计/选择物化，最后 reopen/full snapshot |
| P-G | 原 62 步 synthetic guarded 前缀 | 62 | read() 共 124 次，其中 EOF 62；step 21 后重开 |

P-G 含 12 个 D 步骤、57 个带 assistant 历史的步骤，未删恢复、第二次 prepare/compile、
credential、pre_send 验证、额外完整审计、结果持久化。机器表包含逐 read 大小/摘要、
原来源时间、输入摘要、raw-first/derived 分组、外层操作及内部 ledger 调用顺序。

## 3. 原 v4 等价与比较身份

- P-L：首先复制原性能第一对 v4 的 journal，只读校验其完整结果与一次新 v6 writer。
  随后完整 writer 验证以 `writer-verification/` 为准，旧 reader-pass 证书不覆盖。
- P-H：先在新目录逐个公布 35 个字节一致的已提交前缀，用原 v4 snapshot 与 v6
  审计/选择物化比较，并核对最终完整状态；随后增加从 reserve 开始的完整 writer 验证。
- P-G：原 v4 factory 源码/依赖不改，通过显式 adapter 拆分 batch；与 v6 比较全部
  prepared packet、请求字节、D answer hash、输出、处置、恢复后完整状态。固定相同
  fixture UTC，不掩盖真实 evidence。完整逻辑状态相等。

原 v4 SHA-256 为 `71bc059f4a7c33f14b8f07383391b225b09df018a6e446b6b31ab6e167c5dcdb`。
P-G 的 derived guarded composite 与原 v4 账本是两个身份：不声称它是未适配的历史
guarded runtime。未移除 source/freeze/pre-send 校验；composite 另列摘要和两项变换，
未来若获批计时，必须把 adapter 和完整调用记录成本算入。

## 4. 非计时计数结论

P-G 每请求 10 个原 v4 append 变成 8 个 v6 append：raw 的两条和 derived 的两条各
合成一次 batch，共减少两次。reserve、控制记录、terminal、settle 未删除，所以该固定
一片段负载的减少比例是 2/10=20%。两臂同步 flush-request 同样为 620 与 496。

P-G 完整审计次数为原 v4 **437**、v6 **519**；v6 为必要历史增加的扫描保留在账上。
扫描次数不能冒充耗时比，但不能从计时中排除这 82 次额外扫描。

三层完整 writer 与对照结果均一致；最终非计时计数如下（append 与 flush-request 数相同）：

| 层 | 原 v4 | v6 | 减少比例 | 原 30% 门槛 |
| --- | ---: | ---: | ---: | --- |
| P-L | 16,178 | 10,508 | 35.05% | PASS，仅计数项 |
| P-H | 99,985 | 64,638 | 35.35% | PASS，仅计数项 |
| P-G | 620 | 496 | 20.00% | **FAIL** |

逐操作完整扫描计数与 journal 字节也已核对，不以文件变小代替完整审计成本：

| 层 | 原 v4 扫描次数 / journal 字节 | v6 扫描次数 / journal 字节 |
| --- | ---: | ---: |
| P-L | 6 / 39,100,221 | 6 / 45,194,716 |
| P-H | 108 / 2,651,904,972 | 143 / 4,037,222,248 |
| P-G | 437 / 591,325,760 | 519 / 726,595,126 |

字节统计仅针对完整 journal 扫描，不含 manifest/freeze 文件验证、metadata syscall 和
解析/克隆 CPU；这些都必须计入未来完整 wall，不能从字节比推断耗时比。
原日志不变，详见 `full-audit-scan-work.json` 及逐边界条目。

三层最终计数表在 `writer-verification/summary.json`；计时、p99 和 RSS 比均为 NOT_RUN。
任何单层计数 FAIL 都不能由另一层平均改善覆盖。此前 R-O/R-S 时间门槛失败不改分。

## 5. 修订资源建议

总磁盘额度仍建议 **16 GiB**，内部改为：P-L/P-H **6 GiB**、P-G **2 GiB**、共享输入/
源码/报告 **2 GiB**、失败保留 **2 GiB**、余量 **4 GiB**。调整理由是纳入完整操作表、
调用计数报告和结果 schema 额度，而不是只统计 journal；没有增加 live 上限。

其余数字保留为未批准的行政提案：1 个串行测量子进程、30 个子进程、每子进程 8 GiB
RSS、宿主至少 12 GiB 可用内存；P-L/P-H/P-G 分别 10/60/30 分钟，全系列 18 小时。
新增离线 supervisor cleanup 提案为 30 秒；未实施，不影响 live 5 秒 cleanup。

`revised-resource-budget.json` 给出三层完整字节加总、分配核对和宿主瞬时余量。
在声明的固定输出/schema 额度下，总预算为 **9,440,863,476 B，约 8.79 GiB**，
包括三层 30 份输出及 2 GiB 共享输入、2 GiB 失败保留，算术上小于 16 GiB。
结果采用每子进程单 journal、单操作/调用报告及有界 metrics schema 的额度，不把无限
stdout/stderr 或任意错误对象增长称为有界。磁盘算术充分不意味着错误情况下空间必够。

原 v4 capture 同样使用缓存。本轮自查发现并纠正最初的“每 append 都扫描”的推断：
保留第一轮 cache-miss 上界，但不将 3 TB 级反事实上界称为 P-H 必需成本。最终表列出
正常 reserve/settle 扫描预算，完整 writer 计数验证 cache-hit 路径。

V8/GC/native 并存、父进程内存、OS 树控制与绝对完成时间尚无足够保证；本轮不填入
伪造的 heap/time proof，不将 budget_proven 改成 true。即使补齐资源，P-G 计数仍失败。
预算生成时宿主可用内存为 10,062,295,040 B，约 9.37 GiB，仍低于建议 12 GiB；
磁盘可用 328,204,476,416 B。该瞬时采样不是未来资源保证，也没有清理无关进程。

## 6. 故障验证范围

新增测试覆盖：输入表摘要不一致、错误 read 组、漏操作、漏扫描、缺耐久确认、
错误 batch 拆分及写入异常透传；模拟 ENOSPC、资源越限、子进程退出、结果 flush
失败、cleanup 未确认、封存后再次启动均不能变成成功或获得 retry。

实际文件故障工具只修改新目录的副本，对原 v4 JSONL 和 v6 binary 分别截断尾部或
破坏 payload；保留损坏文件、摘要和拒绝原因。不会触碰旧 journal。
四个实际副本故障均被拒绝，原副本来源摘要均未改变；另有五类 supervisor 故障模拟
结果保存在 `fault-validation/results.json`，定向单元测试 7/7 通过。

这些是实际文件故障与纯 supervisor 模拟；没有测试真实磁盘耗尽、Windows Job Object
或真实子进程树强制停止。它们仍是明确未验证项，不能由模拟通过代替。

最终研究回归 **233/233** 通过，固定 4 workers；99 个模块语法检查通过；`pnpm lint`
检查 799 个文件通过；`git diff --check` 通过。测试耗时不作为性能测量数据。
本轮未改共享产品代码，未重跑产品构建/Vitest；未启动独立评审代理。

## 7. 证据与下一步审核

新证据根：
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-workload-bridge-prep-20261115/`。

- `verification/`：第一轮三层操作表、原 v4 前缀 reader 证书、62 步 guarded composite。
- `source-reader-pass/`：该轮工具源码；后续修正不覆盖它。
- `writer-verification/`：完整 writer 结果、最终操作表、逐操作计数及门槛判定。
- `fault-validation/`：派生损坏文件、错误与模拟监督结果。
- `revised-resource-budget.json`：修订额度及仍未知项。
- RED/GREEN 日志、最终回归、摘要核对和最终源码快照均单独保存。

摘要核对全部一致：456 个保护历史文件、前次交付 264 个索引证据及 146 个源码文件、
7 个冻结研究输入、原 R-E/R-A/R-C 的 4 个结果及 123 个源码快照、17 个原同步/失败
日志、本次复用 synthetic freeze 的 53 个文件、144 个未改的已有研究文件，以及第一轮
reader-pass 的 96 个模块。main 干净且仍为
`eb5d2c711b461da06245737b225deb14a3ba33c3`。没有 commit、merge、push。
完整核对及验证入口为新证据根的 `custody-checks.json` / `final-verification.json`。

建议 Owner 审核并保留 P-G 确定性失败，不批准当前候选进入计时系列。若仍需推进
存储候选，应另案论证在不删除原屏障/证据、不改变负载和门槛的前提下能否降低固定
操作成本；本轮不擅自改架构。模型研究继续保持停止，不从工程失败推导模型结论。
