# ME-S 静态接口与等价性合同

状态：**SPECIFICATION_ONLY / NOT_IMPLEMENTED / G0_BLOCKED**，2026-11-15。
依据：[ME-1](../../../docs/superpowers/plans/2026-11-15-history-materialization-evidence-encoding-proposal.md)。
Owner 只批准静态证明和接口细化，G1 未批准；这些接口不是现有可调用 API。
不改变正式 ACMI Contracts、研究协议、冻结材料或历史评分。

## 1. 先区分三个有效域

- **D-WRITER：** 指定源版本/字段集合的 writer 实际能产生的紧凑事件序列，另带
  明确的输入/交付域前提。后文数值预算仅对这些前提成立，不代表当前 live 已具备它们。
- **D-READER：** 原 v4 能解析并通过状态重放的文件，包括它可能接受的非规范 JSON
  空白或重复 key。D-WRITER 的最大行长不自动覆盖 D-READER。
- **D-FAILURE：** 在发送/归档/恢复/导出时遇到的客户端、I/O、语法或资源失败。
  失败必须诚实保存和停止；不能以正常域预算保证任意无界错误文本完整可存。

新 reader 对 D-WRITER 的条件正确性与对 D-READER 的完整兼容性分别判定。当前尚未
选定能证明后者的有界解析器；不得偷偷缩小 D-READER、加行长拒绝或改 JSON.parse 语义。

## 2. 公开研究接口（拟议）

```text
withFullHistoryAudit(consume: (view: HistoryView) -> T): T
HistoryView.summary(): FrozenHistorySummary
HistoryView.readAttempt(id: AttemptId, selection: Selection): OwnedSelection
HistoryView.forEachAttempt(consumeOne: (attempt: OwnedAttempt) -> void): void
```

`withFullHistoryAudit` 完整扫描后才调用 consume；同步消费期间保持原证据锁和文件
身份约束，退出时检查 fingerprint/head 并关闭 lease。consume 不能返回 Promise，
不能重入 reserve/capture/settle，不能将可继续读取的 view 逃逸到锁外。
锁外仅可保留明确复制、已验证且计入资源的 OwnedSelection，不可保留有效读取凭证。
等待网络请求、stdout drain 或用户输入不能放在该锁内。

新增 wrapper 不得给原已持锁的 append 路径再次加锁。内部使用只接受本进程 lock
capability 的 `auditUnderHeldLock`；它不能绕过完整扫描或暴露给外部调用者。

每次原调用点都独立调用完整扫描；不得因为相邻 head 相同而复用前次扫描资格。
view 绑定 manifest/profile/source、打开的文件身份、seq/head、已知 checkpoint；
绑定对象不允许 JSON 导入或调用者构造。没有持久化索引，也没有信任任意 offsets。

### 2.1 FrozenHistorySummary

全局字段：`version, manifestHash, profileHash, seq, digest, halted, budget, attempts`。
`budget` 保留原 totals 的全部字段及 null/unknown 语义，attempts 按原 reserve 顺序。
原 WeakMap/Map 等内部状态不作为新的研究字段发布。

每个 attempt 摘要固定为：

| 字段 | 类型/必要性 |
| --- | --- |
| attempt_id、coordinate | SHA-256 与原六坐标；重复检测、顺序、选择与 D1 定位 |
| request_sha256、request_bytes、answer_sha256 | 原请求身份、长度和 D1 答案绑定；answer 可为 null |
| model_bytes/model_sha256、reasoning_bytes/reasoning_sha256 | 本次全扫描累计；不是信任终态自报 hash |
| channel_bytes | transport/wire/model/reasoning 四个累计量，缺项按原规则解释 |
| capture_count、last_elapsed_ms | 当前前缀计数/单调时间；不得新增时序舍入 |
| max_cost_micros、settlement | 原值、字段存在性、outcome 及未知费用保留 |
| range | start/end、first/last seq、previous/last digest 的本次扫描锚点 |

禁止放入：request_base64、chunks、usage、原文、任意错误消息、完整 terminal、逐 read
offset 列表。范围锚点只有每 attempt 一组；路径/文件身份只在全局 lease 中保存。
offset/seq 使用安全整数的条件必须由整个文件与事件总界保证，否则该配置不能认证。

该字段集合的保守 UTF-8 序列化目标为每项 4096 B，576 项为 2359296 B；这是字段
编码界，不是对象、Map、字符串和 GC 的 heap/RSS 界。详见静态核算证据。

### 2.2 Selection 与所有权

只允许三个显式选择：

- `complete_attempt`：原逻辑 attempt 的全部 reserve/captures/settlement。一次最多
  一个，用于当前 D2/恢复/完整导出，不能同时保留 576 个结果。
- `dialogue`：原 model/reasoning 字节及必要坐标/状态/身份；闭环最多 7 个先前 attempt。
  不返回这些历史 attempt 的全部 raw/transport chunks，不复用旧 binary caller 的
  “一次持有全部 selected attempts”对象图。
- `reservation_control`：当前 reservation 及完整 pre_send/request 控制数据，用于
  原发送前检查；不能用仅 hash 相等替代原先还检查的字段。

所有读取重新校验所读范围的链锚点/摘要与当前 lease，且保持原片段顺序。完整审计
已验证所有 payload，但这不允许随意信任修改后的范围内容；文件身份或锚点失配即
沿原完整性失败路径退出，不重审后静默继续同一个已不确定的操作。

`forEachAttempt` 是一次一项的完整逻辑视图。消费代码若把每项塞回全局数组，违反
本接口资源合同；不能以“reader 自己是流式”掩盖下游全批驻留。
旧 snapshot 保留原含义，不能被此 summary 冒充；新路径不得回退到旧全批 snapshot。

## 3. 当前 attempt 与 D2

扫描时保留一个当前完整 attempt。它未结算时不能释放 chunks；capture 仍检查
同一 attempt、channel/字节预算、时间与摘要。settle 必须先完成原全部验证。

如 outcome=diagnostic_censored，将当前完整对象交给原 `auditDiagnosticCensor`
等价规则：四类控制记录唯一、最后 terminal、冻结/坐标/请求绑定、原截止/清理字段、
无其他错误、raw/metadata 一一相邻、generation/cleanup 顺序、全 hash、decoder
content/reasoning/finish/done/usage 对照全部保留。之后才能压缩为摘要。

每次后续全审计都重新构建这个已结束 D2 attempt 并重验，不保存一个永久可信的
`d2_passed` 替代计算。普通 success 不因新物化方式新增 D2 检查；error/unknown 的
halted 规则不变。没有把“所有终态都合法”新增为原 writer 本来没有的状态约束。

D1 摘要的 model hash 来自本次扫描按顺序解码的完整 model 字节，与原 concat 后
hash 相同；marker reserve 的非空、成功、坐标及 answer_sha256 条件全部保持。
不以模型自报 token、UUID 或最终文本相似替代上述条件。

## 4. 前缀归纳关系

令 O(p) 为原 v4 对事件前缀 p 重放的逻辑状态；N(p) 为新摘要/当前对象/文件范围。
定义 V(N,p)：将每个摘要按其已绑定范围展开为原 attempt，去除内部 range 等字段，
按原顺序组成 attempts，并保留原 seq/digest/halted/budget。目标关系为 V(N,p)=O(p)。

| 步骤 | 保持关系的必要条件 |
| --- | --- |
| 空前缀 | 同一 manifest 初始 head、预算、空 attempts、未 halted |
| reserve | 原字段/坐标/唯一性/单 in-flight/预算/D1 全部验证；摘要不能丢未知费用语义 |
| capture | 当前对象保留完整记录及原时间；先验证再按原次序更新累计值；逻辑 head 完全相同 |
| settle | 原 outcome/cost/D2 检查；先取得原结果，再由完整对象导出摘要；不得提前授权下一请求 |
| 导出/上下文 | lease 与 range 展开获得原字节，再执行原构造规则；所有权不改变值或顺序 |
| 写失败/崩溃 | 原 append/flush 屏障不变；未知持久化、partial tail、不完整 reserve 不变成可重发 |

这是状态折叠算法在记录解码等价前提下的静态证明，不是未写实现的实测 PASS。
解析器、锁/身份 race、缓存释放/克隆、异常顺序仍须具体实现证明与以后另批验证。
真实时钟值可能因工程耗时不同而变化；差分字节证明使用同一事件/时钟输入，不
用字段忽略规则删除有研究意义的延迟差异。

## 5. 消费者及资源责任表

| 原调用点 | 拟议消费方式 | 不可遗漏的工作 |
| --- | --- | --- |
| open / resume | full audit，发布摘要 | manifest、全部 payload、已知 checkpoint、尾部完整性 |
| run.next | 单独 full audit 后取原 next | 不与 prepare 的审计合并 |
| prepare / eligible | 单独 full audit；dialogue 或 D1 选择 | 真实历史、source IDs、metadata_valid、C1 projection 与原编译顺序 |
| reserve append | 原锁内 full audit，再原 append | 预算预留和持久化确认不省略 |
| request callback | 单独 full audit；reservation_control | 冻结来源及原路由/请求/pre_send 对照 |
| capture cache | 当前 attempt + bounded summaries | 原 fingerprint/manifest/checkpoint 条件，失配不使用旧缓存 |
| censor review / settle | 当前完整 attempt；原规则；非 capture full audit | 不能用 cache 的 censor 标记免除之后重验 |
| settlement 后审计 | 独立 full audit | 原运行 disposition，不与 settle 合并 |
| 循环结束及 execution-end | 各自原 next/full audit | 不把尾部两次调用漏出计量 |
| import/report | 完整视图逐 attempt 消费 | 原 rows/分组/错误/usage 全保留，Evaluator 本身不改 |

最后一行不是简单替换函数名：原 importRun 返回全批对象，aggregate 接受 rows，
并保留 score.usage/identity_observations/errors 等。必须证明新的所有权/导出安排，
不能返回较小 summary 就宣称报告等价。数值聚合必须保持原过滤、遍历、加法顺序，
避免把浮点重排后的“数学等价”当作逐值相同。本轮不调用评分器或重评分。

## 6. 外部编码接口（拟议）

```text
encodeCompactResult(summary: ExistingResultShape): exact UTF-8 bytes + LF
writeCompleteDerivedDocument(source: OrderedExistingValues, sink): CompletionReceipt
```

有效对象域限定为既有 JSON 解析/结构化复制/固定字段构造出的纯数据，无 callable
toJSON、getter、循环引用或 replacer。保留原 JSON.stringify 对缺失字段、null、
负零和代理项的行为；不改变标准 token/未知 usage、字符串内部空白或语义字段。

分块导出必须与完整紧凑 JSON 的字节序列相同，含字段枚举顺序、数组顺序、scalar
格式和唯一尾 LF。不得用 NDJSON 或字段裁剪暗换文档。原权威日志不做此重编码。
CompletionReceipt 必须区分完整派生文件与部分输出，且其字段、持久化成本也要入账。
具体 receipt/失败辅助文件格式仍未定，因而不能把它们按 0 B 算入完整容量证书。

当前 live 的 stdout 写入没有等待 drain。不能宣称每次返回后该副本已释放或落盘；
若以后采用有界背压，需要显式批准调用者/时序契约，不能本轮暗加 timeout/停止规则。
本合同不允许按“stdout 是日志”把其队列与证据副本排除出资源预算。

## 7. 本轮判定

接口/字段/调用图已静态细化，状态归纳关系及编码值等价条件已明确；**尚没有实现
等价证书、全 D-READER 解析器或完整资源证书**。G1 未获批，继续 G0；固定逐记录
写路径不提供 >=30% 改善。不进入实现、性能系列、重新冻结或模型采集。
