# R-E / R-A 正确性与 R-C 容量可行性结果

日期：2026-11-15。授权范围：离线实现、正确性及容量证明。

## 1. 结论

**R-E/R-A 在本轮覆盖的正确性验证中通过；R-C 的结论为容量不闭合。**
没有执行性能验收，不能据此宣称解决了上轮审计性能失败，也不能重新冻结或启动模型批次。

| 项目 | 结果 |
| --- | --- |
| 二进制事务封套及完整逻辑证据 | 已离线实现，帧/摘要/故障验证通过 |
| 流式全历史审计、按需历史物化 | 已离线接通；关键边界未减少，选择性物化另做完整审计 |
| 最终离线回归 | **208/208 通过，0 失败、0 跳过** |
| 真实前缀正确性对照 | **35 个尝试、35,308 个原始 read、99,985 条逻辑记录一致** |
| 稀疏历史恢复 | 0 / 35 / 576 槽位旧/新路径状态及预算一致 |
| 容量闭合 | **否**，已复现现行预算下的反例 |
| 性能验收 | **未执行，等待另行审批** |
| live admission | 保持 **1,048,576 B** |

研究问题、prompt、oracle、原计划与七项研究材料不变。没有新 read-size/read-count/
cleanup 限制，没有提高 channel 上限，也没有改变 180000/5000 ms 的停止规则。

## 2. 实现和隔离边界

### R-E：新格式仅供显式离线选择

`gate2-transaction-binary-v1` 对应 v6 manifest / `transactions.bin`：

- 112 B 固定头，含版本、物理序号、前序摘要、payload 长度、逻辑事件数量/范围及 attempt。
- 完整的原逻辑事件 JSON 数组，保留 Base64、原字节 hash、来源时间及逻辑链。
- 32 B trailer，SHA-256 覆盖独立 domain、实际 header 与 payload 字节。
- payload 为物理帧只序列化一次；逻辑摘要仍单独重算，不以物理 hash 代替。
- raw-first 两阶段、同一 read 内合并、同步 flush、写失败 poison 和关键屏障不变。

不支持旧账本迁移或原地转码。默认路径不启用 v6；live 模式传入新存储选项即拒绝。
旧 v1-v5 reader/writer 行为及完整 snapshot 接口继续保留。

### R-A：流式读取不等于少验证

- 文件读取块为 64 KiB；按物理帧及逻辑记录验证，不再一次读入/split 整份 binary journal。
- `ledger-state.mjs` 提供新旧路径共同使用的状态规则；流式状态额外使用内部 Map 定位。
- 当前 attempt 仍保留 chunks，以复用原 D2 资格审计，不以较弱的新判定替换它。
- settlement 验证成功后，summary 释放已结算 chunks/request body，保留由本次
  已验证 model 字节得到的 D1 answer hash、字节数和必要状态。
- `snapshot()` 仍可完整物化所有旧字段。它不是恒定内存 API，不将 summary 冒充完整快照。
- guarded 离线路径使用 `auditSummary()`；需要历史时，`readAuditedAttempt()`
  绑定私有 token 的允许 ID、文件 fingerprint 和双 head，再做一次完整流式审计，
  只保留被选择的原始历史。没有持久化索引或 checkpoint 权威。

本实现选择了较保守的“再次全审计”，而不是直接跳转 offsets。它增加了审计工作，
但避免引入未证明的索引信任边界；本轮不声称它更快。原 pre-send、reserve、
settle、snapshot/reopen 等审计边界没有合并或移除。

## 3. 正确性证据

### 3.1 真实 r4 前缀

`verify-transaction-audit.mjs` 只读验证原 journal 链，再在独立离线目录重新保存
全部逻辑事件。没有执行真实模型、真实输出 Evaluator、续写或评分修正。

逐项核验：

- 99,985 条 kind/value、原始载荷/Base64/hash、来源 elapsedMs 和顺序一致。
- 35,308 个 read 边界及 metadata/raw 对应关系保留。
- 每个已结算 attempt 的选择性读取与原始 attempt 完整相等。
- 新进程式重新打开后，完整 attempts 与原始状态相等，最终 `halted=true`。
- 最后一个 byte-limit 失败仍是失败；不补造尾部、不变成 complete 或可续跑状态。

新 binary 文件为 **71,856,567 B**。这是归档体积，不是性能验收成绩。
新 manifest 和物理格式有新链根；不能要求新旧 journal head 相同，原来源 head
作为 provenance 单独记录。

### 3.2 上下文与请求等价

在标明 synthetic-test 的工程输入上，对 v5 与 v6 guarded 路径执行 **62 个步骤**：

- next coordinate、prepare packet 和最终 request bytes 逐步相等。
- 包含有 assistant 历史的连续工作及 D 阶段，不只检查空历史第一轮。
- 中途重新打开两条路径，后续历史与请求仍一致。
- 逐步 settlement outcome 和 run disposition 一致。

这不是 62 次模型调用，不是研究分数。模板输出由离线 fake transport 给出；研究
冻结包没有重建。既有回归测试仅在各自临时目录生成 synthetic-test 包。

### 3.3 故障、恢复和不可变审计

本轮新增/扩展覆盖包括：

- header/version/flags、长度/count/range 溢出、跨 attempt、错误物理前序、部分头/
  payload/trailer、尾部多余字节、UTF-8/JSON 跨 64 KiB 读取边界。
- 物理 seal 被重新计算但逻辑摘要错误，仍必须拒绝。
- 保持逻辑链相同、重封装成较少物理帧，仍拒绝 physical-head rollback。
- 无写入/部分写入/写全后 flush 异常，poison writer，保留原始失败尾部。
- 实际子进程在 append 中退出，保留遗留锁及 partial tail；只在测试中显式移除
  锁检查第二层错误，不自动清理、修复或重发。
- 另一个进程追加后，旧 audit token 不能继续物化历史。
- 审计过程中发生有效的外部追加，即使旧前缀仍有效，也在发布结果前被 fingerprint
  检查拒绝；随后重新完整审计才能看到新状态。
- D1 原始 answer 绑定、D2 合格截止截尾以及所有非 D2 / 字节 / 存储 / cleanup 否决。

自查曾复现：调用方修改返回 summary 的 attempts 后，可请求不存在的选择项而未被
立即拒绝。已通过 RED/GREEN 修正，把允许 ID 集合固定在私有 WeakMap token 中，
不再相信调用方可修改的 summary。此为自查，不是独立评审。

最终完整回归 **208/208**；中间 206/207 项日志也保留。**82 个 `.mjs`** 语法检查
通过，`git diff --check` 通过。没有把这些工程检查当成模型机制 GO。

## 4. R-C：证明结果与反例

### 4.1 已证明的结构约束不是实际内存保证

沿用现有“四个 channel，各 4 MiB；capture 必须非空”的规则，得到宽松结构上界：

| 结构量 | 上界/结果 |
| --- | ---: |
| 单 attempt capture 数 | 16,777,216 |
| 单逻辑记录编码上界 | 5,593,432 B |
| 单帧 payload 宽松上界 | 17,263,755,266 B |
| 原 576 槽位逻辑事件总宽松上界 | 9,663,677,568 |

这些来自原约束及 JSON/Base64 封套，不是新增模型限制。1024 B 的逻辑封套 allowance
覆盖固定字段、受限 ASCII ID/hash、序号及数值表示；最大字段形状的构造样例为 812 B。
新物理格式要求 writer 的唯一 JSON 编码，不能用重复键或任意空白绕过长度假设。

**17 GB 级的格式上界显然不是可用的 writer 资源预算。** 写端仍物化整帧 payload；
JS 字符串/Buffer、当前 attempt、上下文和 Fetch 缓冲的并存容量没有闭合。
本轮没有暗加一个较小帧上限去掩盖该缺口，也没有宣称所有语义有效极端输入都可完成。
读端 64 KiB 块也不代表进程仅使用 64 KiB：逻辑记录、当前 attempt 与必要历史仍占内存。

### 4.2 交付个数与交付字节必须区分

对现有传输控制流可确认：只有一个 owned read 在途；cleanup 不发起新的 read，
只等待/取消已有 read。因此 cleanup 最多交付一个这样的非空 item，generation
非空 read 的宽松上界为 `W+1`（W=1 MiB，含可能触发上限的那次 read）。

这不能界定一个 item 的字节数、空 read 的 CPU 消耗或 Fetch 内部缓冲。
在最大 read 字节 Q 没有可信界的情况下，`W+Q+C` 仍不能转换成一个已证可用的
完整原始证据预算。不能用历史最大 read 或平均值代替 Q。

### 4.3 现行 1 MiB 下的端到端失败反例

合成离线传输先交付 1,048,576 B，再交付 3,145,729 B；总计 4,194,305 B。
第二个 read 自身不超过旧单 capture 上限，但累计超过既有 wire channel 4 MiB。

实测判定：

```text
error_code = evidence_write_failed
wire_bytes = 4194305
raw_bytes_committed = 1048576
evidence_complete = false
termination.prefix_integrity = false
ledger halted = true
```

旧前缀保留，不把未能归档的第二片段称为完整证据；无重试或下一次生成。
这不是伪造真实模型继续输出，而是明确标记的 synthetic 资源反例。

另外，明确格式下的逐字节 read metadata 精确总和仍为 **180,292,538 B**，
超过既有 transport channel 4 MiB。独立 Base64 padding 也不能忽略：两个 1 B
记录需要 8 B Base64，而合并为一个 2 B 记录只需 4 B；不能只按总量乘 4/3。
这项是精确算术，不是假称完成了百万次磁盘事务。

### 4.4 容量判定

**CAPACITY_NOT_CLOSED**。以下仍未证明：

- 最大交付 read 字节和 Fetch 内部缓冲。
- pre_send/request/response/terminal 的联合 channel 预算。
- 单事务序列化及当前 attempt 的实际可用内存上界。
- 576 个近上限响应的完整磁盘、RSS 与绝对审计成本。

0/35/576 槽位的稀疏恢复检查已通过，但每槽仅很少的小记录，不能替代饱和证明。
在静态上界已经暴露不可行性时，没有为了展示测试规模而分配 17 GB 帧或耗尽磁盘。

## 5. 本轮没有做的事项

- 没有执行五组配对性能系列，没有计算新 capture/audit/RSS 性能比，没有给新版本
  判定性能通过。普通测试日志中的耗时不是性能验收。
- 没有变更原 >=30%、<=0.80、<=1.25 门槛，原 v5 审计失败全部保留。
- 没有新增 read-size、read-count、cleanup、channel、磁盘或审计超时停止策略。
- 没有提高 1 MiB live 上限，也没有把旧 4 MiB 离线候选升级为运行配置。
- 没有模型调用、补样、续跑、真实输出重评分、development 研究重新冻结或正式集成。

建议 Owner 将“是否批准性能验收”和“如何处理容量缺口”分开决定。
即使未来性能门槛通过，也不能据此覆盖当前容量失败；下一步若改变交付约束或
存储预算，仍需单独明确审批，不由本轮实现自动带入。

## 6. 证据位置与保留

新离线证据根：
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-re-ra-rc-20261115/`

- `all35-correctness.json`、对应 `.log`、`all35-binary-correctness/transactions.bin`：真实前缀差分。
- `capacity-proof.json`、`overshoot-transport.json`：结构推导、未证明项及端到端反例。
- `history-*-legacy/`、`history-*-binary/`：0/35/576 稀疏状态恢复副本。
- `tests-final.log`、`tests-final-capacity.log`、`tests-final-integrity.log`：206、207、208 项回归。
- `historical-baseline.json`、`final-verification.json`：旧证据逐文件检查及最终核验索引。
- `source-final/`：本轮源码/测试/说明副本；不是新的研究冻结包。

r1-r4 及上轮 R-O/R-S 共 **456 个历史文件**必须逐文件保持摘要一致，包含原分数、
失败、源码快照和七项研究材料。正式 main 保持原 HEAD、无本轮修改。
本轮只提交正确性与容量结果，等待 Owner 对后续性能验收的独立决定。
