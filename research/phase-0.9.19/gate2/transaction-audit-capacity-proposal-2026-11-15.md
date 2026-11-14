# ACMI 0.9.19：事务封套、完整审计与闭合容量预算独立修订提案

状态：**DRAFT / OWNER REVIEW ONLY**。日期：2026-11-15。

本轮仅审议和文档交付，没有实现、测试、回放、性能重测、重新评分、重新冻结或模型调用。
沿用研究目录的方案记录惯例。本文件是审批设计，不是可直接执行的实施授权。

## 1. 推荐决议

将后续工作拆成三个可分别批准、但不能互相替代的事项：

| 事项 | 推荐方向 | 不代表 |
| --- | --- | --- |
| R-E：事务封套 | 一个新格式候选：紧凑固定头 + 原逻辑 JSON payload + 原始帧摘要 | 不删逻辑证据、不取消物理摘要、不压缩原始 wire |
| R-A：完整审计 | 保持所有关键边界全历史校验，流式读取和折叠状态，减少重复物化 | 不用 checkpoint/cache 取代完整审计，不合并审计边界 |
| R-C：容量证明 | 固定 live admission 为 1 MiB，建立按 read、delta、控制记录和整批累积的预算向量 | 不把 4 MiB 当默认候选运行配置，不暗加新的停止条件 |

推荐先批准这些设计原则；如另行批准离线实施，先完成 R-E/R-A 的正确性及 R-C
静态可行性检查，再决定是否执行一次预先登记的完整性能验收。任何一步失败均保留。
不启动架构竞赛，不以多个格式、块大小或上限搜索“能过”的组合。

本方案不建议立即采用 sidecar/blob 去重、分段索引或持久化状态快照作为权威。
它们会引入跨文件一致性及不同的信任边界，若本方案失败再独立审议。

## 2. 不变项和授权边界

- 研究问题、公有语料、oracle、plan、四份 prompt 共七项冻结研究材料不变。
- 原 576 槽位、36 对 D1/D2、seed、顺序、条件、难度及 FROZEN-REPLAY/CLOSED-LOOP 不变。
- A/B 同次生成、D 仅诊断、无第二 LLM Judge、无 JSON 修复、无生成重试/补发不变。
- 当前 live `max_response_bytes = 1,048,576`，不因事务格式或审计实现变化而提高。
- 16384 output-token 参数、131072 input-byte 参数、180000 ms deadline、5000 ms cleanup 不变。
- 不扣除审计/写盘耗时为模型续时；不暂停截止计时，不改变错误优先级或 B 空白语法。
- D2 只允许符合既有全部证据条件的 deadline censor；容量、存储、完整性错误仍全局停止。
- reserve、pre-send、terminal、settlement、显式 snapshot/reopen 的既有关键屏障不削减。
- raw-first：原始片段及 delivery metadata 耐久确认后才解码；不跨 read 合并事务。
- r1-r4 和 R-O/R-S 全部验收结果、失败、源码版本、账本、分数不覆盖、不迁移、不重评分。
- 不修改正式 Host/Graph/main；不将未尝试项改作可补样槽位。
- 本轮没有新的离线实现、研究冻结或模型批次授权；设计获批也不自动授权 live。

新增保护限制会改变哪些响应能被完整观察，因此必须单独审批和版本化。
不能用“工程参数”掩盖新的 read-count、单 read、cleanup 或审计超时截断。

## 3. 已知证据与尚未证明的归因

既有 R-O/R-S 固定五组配对结果保持失败：

| 既有测量 | 结果 |
| --- | ---: |
| append / flush 请求减少 | 35.05% |
| capture 耗时比中位数 v5/v4 | 0.6721 |
| 完整审计耗时比范围 | 1.3001-1.4863，五组均超过 1.25 |
| 单请求重放 journal | 9,775,134 -> 13,091,155 B |
| 全 35 尝试 v5 副本 | 83,013,509 B；99,985 条逻辑记录 |

当前源码可确认的成本路径：

1. v5 保留每个逻辑事件完整封套，再用 JSON 对象封套包装事务；重复存放可推导元数据。
2. 逻辑事件按 body 序列化后 hash；物理帧再对包含全部事件的 body 序列化/hash，
   最后又序列化完整帧写入。审计也重建含 payload 的物理 JSON 对象以验 hash。
3. replay 一次读入整个 journal，再 split、逐帧 JSON.parse、重建所有 attempts/chunks；
   snapshot 还 structuredClone 全状态。调用方通常只需少量任务历史或当前请求状态。
4. 历史尝试通过线性 find/some 定位，D 绑定和审计有进一步遍历；完整审计在多个
   关键边界重复发生，累计历史越长，重复处理的总字节越多。

这些是源码路径，不是 profiler 的独立因果结论。现有 audit_ms 包含特定边界工作，
峰值 RSS 还包含验收脚本保留的源数据和比较对象；不能把全部增量归给 SHA、JSON
或磁盘中的某一项，也不能把 1,126,004 KiB worker 峰值直接当作 live 内存需求。

没有证据证明以下候选一定达到原门槛。本方案不预填速度提升或新的容量可用结论。

## 4. R-E：单一紧凑事务格式候选

### 4.1 格式选择

建议新格式候选名 `gate2-transaction-binary-v1`，未来对应独立的 run manifest
版本；旧 `events.jsonl` 不转码，候选使用新运行目录的 `transactions.bin`。
物理容器改变，**payload 仍保存完整、有序、原义的逻辑事件 JSON 数组**。
不移除 bytes_base64、原始字节摘要、elapsedMs、logical seq/previous/digest。

固定头设计候选如下，整数均采用明确的大端序；这不是已启用格式：

| 字段 | 字节 |
| --- | ---: |
| magic `ACMITX6` + NUL | 8 |
| format version / reserved flags | 2 / 2 |
| physical sequence | 8 |
| previous physical digest，原始 SHA-256 bytes | 32 |
| payload byte length | 8 |
| logical event count | 4 |
| first / last logical sequence | 8 / 8 |
| attempt digest，原始 32 bytes | 32 |
| **固定头合计** | **112** |
| payload：UTF-8 logical-event JSON array | 可变 |
| trailer：本事务物理 SHA-256 | 32 |

固定部分为 144 B；它不是整个事务大小，也不是实测节省量。控制记录仍各自成事务。
计数及长度必须验证范围、安全整数转换、count/range 一致性；reserved flags 只能为零。
同一事务只能属于一个 attempt；多事件事务只允许 capture。拒绝零事件、负数、
溢出、未知版本、截短及多余尾部，不能按声称的长度先分配任意大内存。

### 4.2 摘要与提交

物理摘要定义为 `SHA256(domain || header_bytes || payload_bytes)`，domain 使用
独立固定字节串 `ACMI-G2-TX-BINARY-V1` + NUL。prev physical digest 从 manifest
绑定的链根开始。逻辑摘要仍按已有 `hash(body)` 规则独立重算；不把 JSON.stringify
误称为任意键序无关的 canonical JSON，也不改变旧逻辑 hash 的定义。

写端只构建一次 payload 字节，用这些确切字节计算物理 hash 并写入；不再为了
物理摘要重建一次含整份 payload 的外层 JSON。读端对实际读到的 header/payload
字节累计物理 hash，再校验全部逻辑事件、字节摘要和状态转移。

**不能只检查存储的 logical digest 列表来跳过 payload 校验。** 也不删除物理链，
避免之前出现的“逻辑链一样但物理帧被重封装”回滚缺口。

沿用单个同步提交及 flush 请求的窄实现；header/payload/trailer 必须在同一个锁
和耐久确认边界内。完整帧确认前不推进可观察的 cursor/state。短写、写后 flush
失败、未知持久化结果均 poison writer，保留尾部并停止；绝不把普通文件 append
视作掉电原子事务。未来若改为多次 write 或 writev，需如实计数系统调用，不能靠
重命名 commit 降低 append/flush 指标的分母。

二进制格式可提供只读 JSON 导出用于人工检查，但导出是派生产物，不替代权威文件。
新旧运行根、manifest、logical head、physical head 和源码摘要必须分别记录。

### 4.3 本项不做

不做 payload 压缩、跨 read 合并、terminal 去重、Base64 移除、跨文件 blob 引用，
不改模型输出或 SSE 协议。这些可能降低字节，但会同时改变更多变量。

## 5. R-A：保留完整审计，降低物化成本

### 5.1 完整性的定义不变

每一次既有关键边界审计，仍从可信 manifest 起点遍历到当前 head：

- 读取全部已提交物理字节，校验格式、范围、物理链、逻辑链和全部载荷摘要。
- 重放 reserve/capture/settle 的预算、顺序、唯一性、单 in-flight 和 halted 规则。
- 重验 D1 answer 绑定和每次 diagnostic_censored 的证据资格。
- 检查同一审计前后 fingerprint、路径/链接、锁、已知 logical/physical head。
- 部分尾部、原地篡改、恢复中的替换和未知状态一律失败，不降级到 cache 继续。

不减少这些边界次数；不把相邻两次全审计自动合成一次。不采用“只 hash 文件，不做
状态重放”，也不把缓存摘要、曾经通过的检查或持久化索引当作当前完整性证明。

### 5.2 推荐数据流

`有界文件读取 -> 帧边界验证/物理 hash -> 全逻辑事件校验 -> 状态折叠 -> 完整审计结果`

1. 避免整个 journal 的 readFileSync + split。读取块建议固定为 **64 KiB**，
   只是文件 I/O 缓冲参数，不是 Fetch read、SSE event 或模型内容的新上限。
2. 暂存只限当前物理帧及确实需要的当前尝试；帧最大尺寸必须来自 R-C 的证明，
   不能用未经校验的长度字段决定分配。必要时逐事件解析，但不得发布半帧通过结果。
3. 用 Map/有序摘要表替代尝试定位的重复 find/some，保留重复检测、顺序和原规则。
4. 累计每 channel 字节、hash、时间单调性、预算和 settlement；对已结束尝试保留
   必要摘要而非全部 chunks 对象。所有原字节仍已完整读取和校验，未从证据中删除。
5. D1 的原 answer 摘要只能由本次审计读取的原 model 字节累计得到，不能信任旧摘要。
   D2 审计的 raw/delivery/derived/terminal 对照须与当前规则逐条等价；不能只比最终文本。
   在等价性未证明前可继续使用原有 D2 全量物化逻辑，不以提速为由弱化它。
6. 对 CLOSED-LOOP 的实际上下文按需读取：仅在当前完整审计成功后，从其绑定的
   offsets/head 物化相关 family/condition/arm 历史。保持相同文件版本与锁/fingerprint
   保证；失去绑定则重新完整审计或失败，不能由未校验 index 直接供给 prompt。

旧 `snapshot()` 的输出兼容性保留；候选离线 guarded 路径可以使用新内部
`auditSummary()` / `readAuditedAttempt()`，但不能让返回较少字段冒充同一测试工作量。
新旧路径必须产出相同 request bytes、D 绑定及可观察状态；正式 ACMI Contracts 不改。

### 5.3 无法消除的复杂度和风险

全历史检查仍至少与已提交字节数成正比。若第 k 个边界有 B_k 字节，总扫描成本
至少涉及 `sum(B_k)`；流式实现降低峰值物化和常数，**不消除累积重复扫描**。
如果 576 槽位的闭合负载仍不可承受，应报告失败并另案审议，不能悄悄换增量审计。

按需上下文和 D2 流式对照是最高风险部分：必须增加差分与故障测试。只有核验值
完全等价才可进入性能验收；拿减少校验、遗漏历史或不再 materialize 必要输出换速度无效。

## 6. R-C：闭合预算的证明义务

### 6.1 “闭合”指什么

必须区分：

1. **被明确约束的工作负载内**：完整保存全部已交付原始片段及派生证据，并证明
   内存、单帧、channel、磁盘、审计和控制路径都有预算。
2. **工作负载约束外或存储故障**：明确 evidence incomplete/unknown、全局停止、
   不发送后续请求。不能声称任意外部输入都可在有限内存/磁盘内完整保留。

只证明“遇到大输入会报错”不是第一项；只证明成功样本落在预算内也不充分。
read 大小检查发生在接收后，不能倒推客户端尚未为该 read 分配内存。

### 6.2 必须提交的一组变量与约束

live admission 固定 `W = 1,048,576`。其余尚无证明的变量不得冒充有效配置。

| 变量 | 定义与来源要求 |
| --- | --- |
| Q | 最大原始交付 read；必须有实际客户端边界保证，不能用均值/历史最大值代替 |
| K、C、N_c | cleanup 原始交付片段数、总字节及其中非空 read 数；结合 owned-read 生命周期证明 |
| N_g | generation 非空 read 数；若新增 read-count stop，属于单独待审的实验条件 |
| D、L_d | 派生 content+reasoning 总 UTF-8 字节及非空 delta 数；由实际 decoder 规则证明 |
| M_d | 一条 delivery metadata 序列化最大字节；含 index、elapsed、phase、hash，不取平均 |
| M_pre、M_req、M_resp、M_term | 各控制记录最大序列化字节；terminal 含重复内容及转义 |
| T_max | 单物理事务的最大实际编码长度，包括逻辑封套、Base64、头和 trailer |
| J_attempt、J_run | 每尝试/整批物理证据预算，包括控制记录、失败记录及外部结果文件 |
| RSS_max、A_run | 全部并存对象/客户端缓冲预算，以及完整关键边界审计的可承受成本 |

保守原始归档预算必须至少覆盖 `B_raw <= W + Q + C` 的约束内上界，而不是只等于 W。
如能证明 overshoot 与某些 cleanup 交付互斥，可收紧，但不能未经证明先减去。
当前只有一个 owned read 的实现可作为 K 的证明线索，不等于本轮已经证明 K=1，
更不界定客户端内部缓冲或一个 read 的尺寸。cleanup 不得主动增加拉取次数。

典型的必要不等式：

```text
N_raw = N_g + N_c
transport_payload_budget >= N_raw * M_d + M_pre + M_req + M_resp + M_term
logical_events <= 6 + 2 * N_raw + L_d
physical_transactions <= 6 + N_raw + N_reads_with_derived

base64_bytes = sum_i(4 * ceil(payload_i_bytes / 3))
J_attempt >= base64_bytes + all_logical_envelopes + all_physical_frames
             + separate_request/result/audit_artifacts + failure_reserve
J_run >= sum_scheduled_attempts(J_attempt_bound) + manifests + exports + reserve
```

`6` 对应现行 reserve/settle 与四个控制记录；如将来增加 receipt，必须另计。
Base64 不能粗略只乘总 payload 的 4/3：每条小记录都有独立 padding。
terminal 内的 JSON 转义和已重复存储的 content/reasoning 也不能漏算。
D1/D2 是两个原计划槽位，整批按原 576 次计算，不额外乘一次 D，也不删减其预算。

`RSS_max` 必须计入原始 Buffer、Base64/JSON 字符串、当前帧、parser 累积内容、
transport 的 raw 数组、审计状态、上下文副本与 Node/Fetch 缓冲；不能只报文件读取
块大小。磁盘预检查不等于空间预留，也不能保证其他进程不占空间；磁盘不足仍失败关闭。

### 6.3 当前数值为何不闭合

- admission 为 1 MiB，但每 capture/channel 上限为 4 MiB，不能由此推出任意 read
  或 cleanup 都有空间；Q 与 C 没有已证有限界。
- 已有合成格式的逐字节 metadata，在 1 MiB body 时为 180,292,538 B，超过当前
  transport channel 4 MiB。原始 read 不可丢，不能用“通常约 185 B/read”消除反例。
- 单条 pre_send 可包含输入包和元数据；131072 input-byte 参数约束的是序列化请求，
  不是所有控制记录之和。必须分别计量并证明，不能直接复用该数。
- terminal 可能复制完整输出并再次转义。事务封套变短不会消除逻辑 channel 本身的容量问题。
- 稀疏 576 槽位恢复测试不构成上述 J_run/RSS_max/A_run 的饱和证明。

因此：**本提案不提供一个声称已经闭合的数值配置。** 用臆测 Q/N/C 或任意倍数
补齐表格会掩盖核心缺口；R-E/R-A 通过也不能据此宣称容量通过。

### 6.4 建议的后续容量决策分叉

| 分叉 | 需明确审批 | 本次建议 |
| --- | --- | --- |
| C0：维持全部现行限制 | 无新停止条件，证明能覆盖的范围并保留反例 | 首先完成；允许结论为不闭合 |
| C1：明确受支持的交付范围 | Q/N/cleanup/单事务约束、超出范围的停止位置及统计分类 | 必须另案给具体值、依据与成本后批准，不能自动启用 |
| C2：改变证据存储预算/布局 | channel、总磁盘、原始溢出保存、terminal 表示或跨文件一致性 | 与 C1 分离审议，不因 live W 不变就视为无实验影响 |

不建议现在选定 8192/16384 个 read 或某个 read 大小来贴合已见样本。
4 MiB 仍只保留为旧离线失败候选，不进入本轮默认容量配置，也不启动上限搜索。
即便 C1/C2 将来通过，也须另行批准研究冻结和有限批次；更快的 sink 仍可能改变
固定 deadline 内可观察的输出量，必须标注实验条件版本。

## 7. 后续离线验收设计（待授权，本轮不执行）

### 7.1 正确性先行

- 对 35 个既有前缀执行逐事件差分，保持来源时间/原始字节/hash；不调用真实输出评分器。
- 比较旧审计和候选审计的预算、halt、D1/D2、原 request bytes、CLOSED-LOOP 上下文。
  UUID 正确或最终文本相同不能替代逐事件相等。
- header/length/count 溢出、跨 attempt、截短 trailer、帧中断、篡改、双链回滚及
  有效重新封装；修复过的 physical-head rollback 向量必须保留。
- 流式审计前后文件替换、链接、同长篡改、锁竞争；验证按需历史绑定不发生 TOCTOU。
- D2 原始/cleanup 边界、早期 decoder 错误、末尾未完成事件、伪造 terminal、
  未结算恢复、未知费用及存储错误均执行原否决规则。
- 逐字节、多 delta/read、极大 read、转义密集 terminal、预发送记录接近限制、
  最大帧声明及磁盘不足；不能删掉导致失败的向量。
- 0/35/576 历史规模分为稀疏正确性与按 R-C 证明向量构造的饱和容量；标签分开。
  静态证明已发现不可行时记录失败，不为展示“大规模测试”耗尽机器资源。

### 7.2 性能门槛全部保留

未来若批准性能验收，只安排**一个源码固定的完整候选**与 v4 原基线的五组配对，
交替顺序、新进程、相同主机/Node/文件系统/原逻辑负载。不改用更慢的失败 v5 作分母。
既有 v5 十次结果只作为历史证据，不能替换或重算。

门槛原样保留：

- append/flush-request 调用减少至少 30%。
- capture 配对耗时比中位数 <=0.80。
- 按 delivered read 的 p99 耗时比每组 <=1.25，不改成按 transaction 计。
- 相同有效工作量下完整关键边界审计耗时比、peak RSS 比每组 <=1.25。
- 任意正确性/完整性/恢复失败否决性能通过；不删慢值、不重复到通过。

新的结果必须包括 binary 读取、完整 hash/状态审计以及为相同请求物化必要历史的
成本，不能把 materialization 挪出测量区间以换通过。保留原 legacy workload 的
可比读数，同时报告 guarded 端到端阶段成本；不宣称 capture 比就是总体加速。
0/35/576 饱和容量和绝对审计/内存/磁盘预算另列，不用单请求相对指标代替。

测试期间如果必须修正正确性缺陷，保留此前测量的版本和失败；不能将其速度成绩
归给修正后的代码。新的正式性能系列必须重新提交执行安排，不能自动重测。

## 8. 若获批准后的分步实施边界

所有路径相对于现有 `research/phase-0.9.19/`；本轮这些文件均不修改。

| 阶段 | 候选文件职责 | 退出条件 |
| --- | --- | --- |
| P1 R-E | 新 `gate2/transaction-frame.mjs`、格式测试；run-ledger 仅新增 offline 格式选择 | 帧边界、双链、崩溃/篡改差分通过，旧格式保持 |
| P2 R-A | 新 `gate2/stream-audit.mjs`、折叠状态与有界选择性读取；离线 send-boundary 适配 | 与原全审计/上下文/请求逐项等价，边界次数不减 |
| P3 R-C | 独立预算证明与合成向量工具，输出假设、公式、数值来源及反例 | 完整向量闭合，或明确失败；不猜参数补成通过 |
| P4 验收 | 独立新证据目录、固定配对脚本与报告 | 满足全部原门槛并保留失败；仍不自动授权 live |

每阶段先写失败向量再实现，并保存源码摘要与可复现步骤。源码固定用于离线证据，
不等同于重新冻结 development 研究包。按 AGENTS.md 本轮仅自审，不启动独立评审代理。
未获得下一阶段授权时停在方案；不得因文档列出文件名就开始改架构。

## 9. Owner 审核项

- [ ] 接受 R-E 的单一 binary-container 候选，完整逻辑 JSON 及双链校验保留。
- [ ] 接受 R-A 的“每关键边界全历史校验 + 流式折叠/按需物化”，不减少审计次数。
- [ ] 接受 R-C 先证明现行 1 MiB 规则的覆盖范围，允许结论为不闭合。
- [ ] 新交付约束、停止条件、channel/磁盘预算或 sidecar 架构须独立明确批准。
- [ ] 原性能门槛、v4 比较基线和失败保留规则不变，不自动开始新的性能系列。
- [ ] 明确本次是设计批准，还是另行授权 P1-P3 离线实现；P4 和 live 不自动随之授权。

推荐：先批准设计与证明边界，再决定离线实施范围；不批准提高上限或研究批次执行。

## 10. 证据与本轮核验

既有验收报告：
`C:/Users/SiChuchen/.codex/worktrees/model-native-attribution-research/acmi/research/phase-0.9.19/gate2/wire-evidence-acceptance-2026-11-15.md`

既有原始验收根：
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-ro-rs-20261115/`
其中 paired-performance.json、capacity-recommendation.json、final-verification.json
和 source-final/ 均只读。本轮引用原结果，不将它们当作新测量。

本轮摘要保护集合：研究目录 110 个既有文件（仅排除允许追加的 progress.md 和本提案）、
r1-r4 历史 267 个文件、R-O/R-S 验收目录 189 个文件，合计 **566 个文件**。
本轮仅新增本提案并追加 gate2/progress.md，其他代码、配置、报告及历史证据保持原样。
