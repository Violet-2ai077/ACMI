# ACMI 0.9.19：wire 预算、流式封装与证据写入独立修订提案

状态：**DRAFT / OWNER REVIEW ONLY**。日期：2026-11-15。

本轮仅核对源码、既有报告与账本的字节/记录计数，并提交方案。
没有修改实现或配置，没有压力回放、重新评分、重新冻结、模型请求、续跑或补样。
文中策略名、事务格式、候选容量及验收门槛均为待审批设计，不是已启用配置。

## 1. 建议决议

将本次问题拆为三个可独立审批的事项，避免“提高上限后跑过了”冒充机制成功：

| 事项 | 推荐 | 不包含 |
| --- | --- | --- |
| R-O：`wire-accounting-v1` | 明确字节与时间口径，增加有界、低开销的工程观测 | 不改接受语言、预算、评分或调用计划 |
| R-S：`raw-first-transaction-v1` | 优先设计/离线验证同一次 read 内的两阶段持久化事务 | 不跨 read 缓冲，不去掉 durable barrier，不压缩/丢弃原始证据 |
| R-W：wire 容量决策 | 当前 live 上限仍为 1 MiB；将 4 MiB 仅列为单一离线容量候选 | 本提案不直接批准 4 MiB live，更不解除 r4 halted |

**推荐顺序：R-O + R-S 离线验证仍使用 1 MiB 旧限制；容量证明完成后，再单独
提交是否采用 4 MiB 的资源配置与新冻结申请。** 不建议现在只改一个数字重跑。
R-S 改的是证据写入协议，R-W 改的是实验暴露条件，两者不是同一个修复。
若今后在同一新批次同时启用，必须同时标注，不能把结果归因于单一因素。
也不自动安排 S-only、W-only、组合组三个真实批次来做因果比较。

## 2. 不变项

- 研究问题：正常回答的同一次生成中，自主识别、标记并持续维护工作任务。
- 公有语料、oracle、plan、四份 prompt 共 7 项字节/摘要保持 r4 值。
- 原 576 个槽位、36 对 D1/D2、seed、顺序、场景与难度不变，不跳过困难样本。
- A/B 同次生成，D 仅诊断；不用第二个 LLM Judge，不修复 JSON，不重试或补发。
- 模型别名、路由、reasoning 设置、16384 output-token 参数、131072 input-byte 参数不变。
- 180000 ms 生成截止和 5000 ms 本地清理窗口不变；不暂停计时、不扣除写入时间后续时。
- `B-inline-v1-ws1` 的空白/帧/语义规则不变；不因本次 framing 失败扩张 B 语法。
- D2 只对满足全部证据条件的截止截尾允许继续；wire/容量/磁盘/完整性错误仍全局停止。
- UNRESOLVED、身份出生映射、状态评分、负例、提案与正式 Graph 的隔离不变。
- r1/r2/r3/r4 原分数、原始输入/输出、失败和 halted 状态不变；不迁移或修复旧账本。
- 任何将来的新批次都须另行授权、独立冻结、从首坐标开始；不是接着 r4 第 36 项运行。
- 已见开发输出仍是已见开发数据；不接触冻结验证集，不扩大确认性研究规模。

## 3. 事实、计量和不能推出的结论

### 3.1 r4 停止事实

冻结摘要：`9be9d99829e457b01f68578f652d6e4847b29a8503bc335bfc9580057608fac4`。
35 次请求，34 次完整传输，第 35 次 `C1/B/replay/icon-invoice-switch/t2` 因
`response_byte_limit` 全局停止。541 项未尝试，无 D2 截尾，无重试。

| 指标 | 既有证据 |
| --- | ---: |
| raw body 上限 | 1,048,576 B |
| 最后请求已归档 wire | 1,048,650 B |
| Fetch read 片段数 | 5,667 |
| 已归档 reasoning / content | 68,997 B / 0 B |
| 尝试 total_ms | 168,430.1385 ms |
| evidence_write_ms | 58,679.8207 ms，34.84% |
| prefix integrity / local pipeline closed | true / true |
| 最后请求 transport channel 逻辑载荷 | 1,116,188 B |
| 最后请求逻辑 journal 记录数 | 16,178，含 reserve/settle |
| 最后请求 journal 序列化字节数 | 9,786,240 B |
| 整批 journal | 99,985 条，62,484,057 B |

新增计数只读取既有 journal，不执行 SSE/任务标记解析器或 Evaluator。最后请求的
capture 为 transport 5,671、wire 5,667、reasoning 4,838；transport 包含
5,667 个 wire_delivery，以及 pre_send/request/response/terminal 各 1 个。
由此可见：1 MiB 的 raw-body 限制不等于 1 MiB 的归档开销。

34 个完整调用的既有 evidence_write_ms/total_ms 比例：最小 13.52%、中位数
30.99%、最大 43.45%。它们是工程观测，不是跨条件合并的模型成绩。

### 3.2 三种“放大”不能混为一谈

1. **流式封装放大**：SSE/JSON、重复字段、usage、控制事件、转义等；按事件定义。
2. **客户端交付碎片化**：一次 Fetch read 的切分；不等于一个 SSE event 或一个 token。
3. **本地证据放大**：Base64、逻辑事件封套/hash、delivery metadata、派生通道以及 terminal。

最后请求 wire/已归档 payload 约 **15.20 倍**，journal/wire 约 **9.33 倍**，
平均每个 read 约 **185 B**。这些只是该观测前缀的比值：越限片段已保存但未继续
解码，payload 与 wire 不是完全匹配的已解码前缀；不能将差额全称为可删除的 SSE 开销。
不能据 5,667 个 read 宣称有 5,667 个 SSE event 或 token。

当前 `wire` 实际位于 `response.body.getReader()` 边界，不是抓包层的链路字节。
它不包括 HTTP headers/TLS 等；是否涉及客户端解压须另行记录验证，不能拿它推断
真实网络带宽或压缩比。旧字段保留，未来报告应使用明确的 `fetch_body_bytes` 口径。

### 3.3 时间口径限制

源码中的 evidence_write_ms 是同步 record 回调耗时之和，包含锁、检查、编码/hash、
可能的完整审计及 flush 请求，不是单独的磁盘 I/O 时间。result 在 terminal 写入前
构造，因此该旧值不含最后 terminal 写入，total_ms 也不是 prepare 到 durable settlement
的完整尝试墙钟时间。结算前验证、settle、snapshot 和 result 文件写入另有开销。

禁止用 `total_ms - evidence_write_ms` 作为服务端生成时间，也不能从现有证据推出
“移除 58.68 秒就会得到答案”。同步阻塞可能影响读取/缓冲/定时器的可见行为；现有
数据不足以分离磁盘、CPU、调度、网络和服务端耗时。

### 3.4 本轮未证明

- 更大 wire 上限能让该请求在 180 秒、16384 token 参数内成功结束。
- raw body 大意味着用户答案或 work_state 大；本次 content 为零。
- 模型卡死、无限 reasoning、忽略 token 参数或任务识别能力不足。
- r4 的负担与早期逐次完整回放缺陷同源。capture cache 已存在；当前源码仍有高频
  同步持久化和额外 delivery metadata，须分开测量，不能直接回滚完整性措施。

## 4. R-O：只增加可解释的工程计量

建议新增以下旁路计量；不转发给模型，不参与 oracle 或正式任务评分。

### 4.1 字节/事件口径

- `fetch_body_bytes_received`、`raw_bytes_durably_committed`、`raw_chunks_received/committed`。
- `body_bytes_submitted_to_decoder`：越限、清理期等未送入 decoder 的字节另列，不隐含为零开销。
- complete SSE events、partial-event tail、comment/control/usage event 数；按真正解析边界计数。
- content/reasoning 各自的 decoded UTF-8 字节；两者不合并成用户答案长度。
- 对完整事件分列 JSON 字面 payload 的原始字节、解码后的字节、其余封装字节；转义
  放大另列。不能靠重新 JSON.stringify 估计原始 JSON 字节布局。
- channel logical bytes、physical journal bytes、logical event 数、physical transaction 数、
  请求 flush 的次数；后者不冒充实际设备写入次数或硬件掉电保证。
- generation 与 cleanup 的接收/提交计量分开，未解析尾部显式标记 unknown。

不得为减少数据而从原始流移除 reasoning、重复 metadata、心跳、空 delta、usage
或终止标记；即使某些事件不展示给用户，也可能影响协议完整性验证。

### 4.2 时间口径

保留旧 latency 字段，同时以新 metric version 增加：

- prepare/冻结校验/预留耗时；原生 Fetch 起点与固定 deadline。
- 接收到 raw read 的单调时钟时间、raw durable ack 时间、派生 durable ack 时间。
- 解码 CPU 回调区间、锁/完整性检查区间、追加/flush 调用区间；声明计量嵌套与重叠，
  不将重叠时长相加为“总 CPU”。
- terminal durable、完整审计、settlement durable、最终结果记录完成的时间。
- attempt wall time，以及按 delivered chunk 的处理耗时分布。

计数/分布使用有界内存聚合，随已有 terminal 或独立最终审计记录一次落盘。
不增加每 token/每事件的新 journal 记录来测量 journal 负担。假时钟只限离线测试。
终止记录无法自证“自己已落盘”，需用后续 durable receipt/最终审计明确证明，不能
把尚未执行的 fsync 耗时预填进 terminal。进程中断时后段耗时 unknown。

## 5. R-S：优先采用 raw-first 两阶段持久化事务

### 5.1 当前写入路径

每次非空 read 先分别持久化 wire_delivery 和 wire，再解析并逐条持久化
reasoning/content delta。每个 capture 都获取独占锁、检查路径/manifest、转换与
hash、同步追加并请求 flush、更新 fingerprint。缓存没有消除这些每事件开销。
reserve/settle/snapshot/reopen 仍作完整审计，不能为提速取消它们。

### 5.2 推荐事务边界

建议新物理格式 `gate2-run-v5`，实现 `raw-first-transaction-v1`：

1. **raw 事务**：同一 read 的 delivery metadata + 完整原始字节，在一个物理事务
   内按原顺序提交，一次独占锁/追加/flush；确认耐久后才送 decoder。
2. **derived 事务**：由该次 decoder.push 产生的全部 reasoning/content delta
   暂存在该 read 的有界局部缓冲，按原顺序一次提交。没有 delta 则没有该事务。
3. 不等待下一次 read，不设 10/100 ms 等凑批窗口，不跨 read 或跨 attempt 合并。
   原始片段、字节、delta 顺序、逻辑来源和时间字段全部保留。
4. 派生事务持久化前不发布其完成确认/正式状态。解析失败仍保留已耐久 raw，
   按既有规则记录错误，不补齐或修复模型输出。
5. reserve、pre-send 验证、terminal、settlement 保持独立的关键耐久边界。
   证据不确定、事务无法持久化、磁盘错误和残留锁仍 fail closed。

最后请求的结构性估算：目前 16,178 次单记录追加；保留相同逻辑事件时，raw 事务
5,667 个，derived 事务不超过 4,838 个，控制记录 6 个，至多 10,511 个物理提交。
这对应至少约 **35.03% 的提交调用数减少**，不是实测速度提升，也不保证耗时按比例下降。
本轮没有执行事务回放或基准测试。

### 5.3 格式、审计与崩溃恢复

- 一个物理事务帧包含版本、attempt、事务编号、logical seq 范围、前一事务摘要、
  完整逻辑事件数组及校验摘要。保留每个逻辑事件自身的顺序/摘要链。
- 采用带完整边界校验的单一物理记录；不把“多条普通 JSONL 一次 append”误当成
  已证明的原子事务。写入可能部分成功，必须检测不完整帧。
- v5 reader 只将完整且校验通过的事务展开为原逻辑事件，执行相同的状态转移、
  D1/D2 绑定和 D2 截尾审计。物理 head 与 logical head 分别记录。
- raw 已提交但 derived/terminal/settlement 缺失：保留证据，不给成功或继续资格；
  已发送的预留不可重发。可以检查原始字节，但不能静默补写结算或“恢复成成功”。
- 部分尾部保留原样，报错停止；不自动截断、修复、补事件或解除 halted。
- 新进程/竞争进程、同长篡改、known-head rollback、symlink、缓存 fingerprint
  变化继续触发相应拒绝或完整审计；不只相信内存 cursor。
- v1/v2/v3/v4 journal 不迁移。未来离线回放输出另存，不覆盖旧 journal/head。
- 这是既有可信本地文件系统/协作写入者模型，不新增对有权限重写全部证据的攻击者
  或设备断电的绝对保证。`flush:true` 的软件确认与设备真正持久化能力分开表述。

### 5.4 不推荐的捷径

| 替代方案 | 本次建议 |
| --- | --- |
| 只关闭 flush，结束时统一写盘 | 拒绝；改变崩溃证据窗口与确认语义 |
| raw + 解码合成一个事务，解析后才首次落盘 | 暂不采用；扩大 raw 未耐久窗口，需要另一份风险论证 |
| 多 read/定时缓冲、无限异步队列 | 不采用；可能丢失已确认前缀、改变 deadline/背压与恢复语义 |
| 删除 wire_delivery、reasoning 或重复头字段 | 不采用；破坏归档或 D2 截尾证明 |
| 持久化二进制 sidecar、不可变分段/索引 | 可另案讨论，不能混入本次较窄事务修订 |
| 禁用关键边界完整审计 | 拒绝；提速不能绕过发送与结算前证明 |

## 6. R-W：容量是独立的实验条件决策

### 6.1 当前建议不直接选择更大的 live 上限

保留 r4 的 1 MiB 值作为现行规则和离线对照。提出 **4 MiB = 4,194,304 B** 作为
唯一预注册的离线容量候选，而不是在 2/4/8/16 MiB 中寻找让模型通过的数字。
选择它仅因为是有界、四倍容量的工程候选，且通用 runtime 校验已有 4 MiB 上界；
这不是性能证明或“4 MiB 必够”的证据。当前 R-D guard 仍明确要求 1 MiB，不能绕过。

离线候选测试不得给历史未完成响应续造真实尾部。超过已有前缀的负载必须标为
synthetic，不能将重复真实片段称为真实模型继续输出，也不产生新任务评分。

### 6.2 为什么不能只改 max_response_bytes

当前 ledger 每个 channel 及单次 capture 上限为 4,194,304 B；最后请求 transport
channel 已有 1,116,188 B，比 wire 还大。若 wire 改到 4 MiB，metadata/terminal
可能先撞上 channel 限制；越限片段完整归档也需要额外空间。

提交 live 容量申请前必须给出一组闭合预算，而不是只给一个 raw-body 数字：

| 预算维度 | 必须明确的事项 |
| --- | --- |
| raw admission | 候选 4 MiB；任何达到停止条件仍全局停止，绝不因是 D2 放行 |
| 原始证据余量 | 合法超限 read 与清理期已交付字节的保存空间；不能让 admission 值等于物理存储硬顶 |
| 分片元数据 | 以 read 数及单条元数据最大长度估算，不仅按 wire 总字节估算 |
| 单 read / 单事务 | 超大 item、许多 delta、一字节碎片化的内存和序列化界限 |
| 各 channel / terminal | 包含完整原始/派生载荷、终止快照与错误证据，不允许隐性先撞其他上限 |
| 整次尝试 / 整批 | journal 实际编码膨胀、磁盘保留、内存、关键边界完整审计成本 |
| 已有 decoder / evaluator | SSE event 上限按字符、Gate 1 raw reader 262144 B、B gap 1024 B 均保持原义；不顺带放宽 |

不能凭平均 185 B/read 证明最坏碎片数有界，也不能假定 Fetch 每次 read 存在一个
未经验证的最大尺寸。若无法保证超限 item/清理交付全部归档，应明确报证据不完整
并停止，禁止把物理截断后的前缀宣称 verified。需要新增 read-count/transaction
保护上限时，须逐项列为新的停止条件，再交 Owner 审核，不能在实现中暗加。

本轮不猜测最终 channel、磁盘或 read-count 数值。候选只有通过闭合容量证明，
这些参数才能一并冻结。若候选失败，不自动再加倍；保留失败并重新审议。

### 6.3 推断边界

- 更大的 wire 容量不改变模型最大输出 token 参数，但会改变哪些流能被观察到结束。
- 更快的 sink 也可能改变固定 deadline 内的可见输出量。二者都是实验条件变化。
- 原始 wire 字节数不能作为任务难度、模型智力或回答 Token 的代理指标。
- 不把字节放大比设成按任务/条件变化的动态阈值，不针对 B 或 D 临时加额度。
- 不切换 stream:false、不改上游 streaming 请求、不要求服务端合并 delta；否则
  另引入流式兼容性变量，需要独立协议方案。

## 7. 未来离线验收（本轮未执行）

### 7.1 正确性与恢复硬门槛

1. 在新测试目录使用 r4 所有 35 个已捕获前缀，保持原始 read/delta/时间顺序，
   不运行任务 Evaluator、不修改研究报告；不完整前缀仍是不完整前缀。
2. 在旧 1 MiB 策略下，固定时钟/固定交付序列重放第 35 项仍触发同一 byte-limit
   类型，保留同一越限片段；不因为事务重组改变错误优先级或让它成功。
3. 每个逻辑事件、原始 channel 字节、摘要、来源、顺序和已记录时间 100% 保留。
   真实回放时间与原始时间分别记录，不用其中一个覆盖另一个。
4. SSE 的跨 UTF-8、CR/LF、JSON 字符串和事件边界分割，空/控制/usage 事件，
   一个 read 含多个 delta、多 read 合成一个事件、超大 read 与逐字节交付均覆盖。
5. 原始提交前、raw/derived 之间、terminal 前后、settlement 前后注入故障；
   partial write、flush 失败、满盘、进程终止、遗留锁、跨进程竞争均不能产生假成功。
6. generation/cleanup 字节分区、180000/5000 ms 边界、D1/A/B/C0 全局停止、
   D2 仅合格截止截尾继续、有限预算拒绝未知费用豁免全部回归。
7. 0/35/576 槽位历史规模的合成账本验证完整审计、恢复、内存/磁盘容量；不能只测
   单个短请求。失败不通过删审计或截断证据规避，必要时另提存储架构方案。
8. 七项研究材料、旧归档和 Gate 1 摘要保持不变；新事务的测试不产生新研究分数。

### 7.2 性能门槛建议

在相同 Node/主机/文件系统/逻辑输入下，预先固定 5 对交替顺序的 v4 vs R-S 测量。
不重复到通过，不选择最佳一次；报告所有值，记录磁盘/cache 条件。

- 固定最后请求负载的 physical append/flush-request 调用减少至少 **30%**。
- 配对回放 capture 关键路径总耗时比的中位数不高于 **0.80**。
- 按 delivered chunk（而非按新 transaction）的 p99 处理耗时不高于旧实现 **1.25 倍**。
- 相同逻辑字节/历史规模下，关键边界完整审计耗时和 peak RSS 不超过旧实现
  **1.25 倍**；同时提交绝对值与候选容量预算，不能仅因旧实现也很慢就称可用。
- 任何正确性/耐久性/恢复失败都否决性能通过；不存在“少丢几个事件换速度”。

这些是待 Owner 批准的工程验收门槛，不是统计风险上界或既有实测结果。5 对配对
测量不提供总体故障概率保证。无节奏回放只测 sink 服务成本；按原始时间的回放
也不能恢复当时服务端/网络反事实。二者不得被报告为模型延迟或原调用的修正成绩。

## 8. 报告、版本与后续执行边界

- 分开标记 model-output protocol、byte-budget policy、evidence-storage protocol、
  accounting version；不要只用一个“修复版”掩盖多个变量。
- 新旧批次分别报告；C1/C2/C3、难度、轨道和 D 继续分离。增加未尝试、资源截断、
  证据失败和未知字段的明确支持数，不仅展示完成样本的平均值。
- 所有真实 usage 原样保存；未知 usage/cost 仍 null，不依据 byte 数补算 token。
- 实际输出和判断不受 sink 统计修改；byte-limit 失败不能补为 marker/state 零分。
- 未来若批准 live，只能再审批一份新的冻结/执行授权；原 576 计划不能变成 r4
  尚余 541 项的补样。无自动额外实验组，也不解除 r4 的 halted。
- 冻结材料应绑定 Owner 决议、观测定义、事务格式、完整容量向量、源码、测试向量
  和离线证明。当前 r4 live grant 仅限 r4，不是新存储/容量策略的通用许可。

## 9. Owner 审核清单

- [ ] 接受 R-O 的三层字节/时间口径及有界观测方案。
- [ ] 接受 R-S 的 raw-first 两阶段事务方向，保留每 read 原始耐久屏障。
- [ ] 接受不跨 read 缓冲、不去 flush、不删原始/派生证据、不绕过完整审计。
- [ ] 接受现行 1 MiB 不变，4 MiB 仅作为单一离线容量候选，最终 live 值另审。
- [ ] 接受候选必须提交完整容量向量；任何新增保护限制都须显式审定。
- [ ] 接受预先固定的正确性/性能门槛，不以模型通过率选择阈值。
- [ ] 明确下一阶段：仅批准设计，或另行授权离线实现/验收；均不自动授权新模型批次。

本次交付停在提案。没有新 freeze、实现 diff、回放成绩或 live 成绩可宣称完成。

## 10. 证据与实现定位

既有证据根：
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/live-20261115-r4/`

- `observed-summary.json`、`report.json`、`final-audit.json`、`development/events.jsonl`。
- journal head：`f631422f9f49099b28ee9d6e9e85cbcd33b255806d733d05f00b136b60c32924`。
- 原 report SHA-256：`05dfe2b6c758f9d529e96874290f707d18955296d1ec18adbaae822d35c425ac`。
- 第 3 节新增计数来自只读解析外层 journal：按最后 reserve 的 attemptId 汇总 capture
  channel/base64 长度与 transport kind；记录 bytes 为原事件规范 JSON 序列化加 LF。
  不解码任务标记，不调用评分器，不修改上述目录。

未来实现边界（本轮不修改）：
`research/phase-0.9.19/gate2/deadline-transport.mjs`、`run-ledger.mjs`、
`send-boundary.mjs`、`revision-policy.mjs`、`freeze-development.mjs`，以及
`research/phase-0.9.19/execution/report.mjs`。保留正式 Host/Graph、Gate 1 和旧证据。

本轮前后完整性检查覆盖研究脚本/JSON 69 个、r1/r2/r3/r4 全部文件共 267 个，
合计 336 个受保护文件；文档变化不纳入这组程序/历史证据摘要。
