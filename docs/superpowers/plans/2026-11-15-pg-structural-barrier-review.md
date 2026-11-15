# P-G Structural Barrier Feasibility Review and Conditional Plan

> **For agentic workers:** 本文件仅供 Owner 审核。只有另行获批的任务才能使用
> superpowers:executing-plans 执行；不启动独立评审代理，不自动实施下面的候选。

**Goal:** 判断在保留既有证据、耐久屏障、固定负载和原门槛时，P-G 是否存在可通过
计数门槛的候选；不可行时给出限定范围的依据，而不是调整实验使其通过。

**Architecture:** 将证据记录、耐久确认点、完整审计、物理提交分别建模。先核对当前
八个提交组的恢复语义，再评审候选。屏障内成本优化与屏障合并不能混称。

**Tech Stack:** 现有 Node 24.16.0、文件型追加账本、同步耐久确认、只读归档核对。
本轮不运行新回放、测试系列、性能系列、模型或网络请求。

**Spec:** [既定容量/性能计划](2026-11-15-attribution-capacity-performance-plan.md)、
[完整负载结果](../../../research/phase-0.9.19/gate2/workload-bridge-results-2026-11-15.md)、
[R-E/R-A/R-C 屏障约束](../../../research/phase-0.9.19/gate2/transaction-audit-capacity-proposal-2026-11-15.md)。

状态：**OWNER_REVIEW_ONLY / NO FEASIBLE COUNT-PASS CANDIDATE UNDER PRESERVED BARRIERS**。
日期：2026-11-15。这是新审议文件，不修订既定研究计划或已冻结 schedule。

## 1. 推荐决议

保留 P-G 计数失败，**不提交当前约束下可以通过计数门槛的实现候选**。
在本文件明确的八个独立耐久确认点及恢复前缀等价定义下，最低为 496 次，而门槛
要求最多 434 次，存在 62 次提交的不可消除差额。

唯一保留为合规工程方向的是屏障内部 CPU/分配成本优化；它不能降低这个提交下界，
所以不能作为解决本次 P-G 失败的方案，更不建议以此名义启动新实现或计时系列。
能够在纸面达到 30% 的控制记录合并候选，会改变现行确认/崩溃前缀，按当前约束拒绝。

这是限定于现行文件存储、确认语义及计数合同的不可行结论，不是所有存储硬件或任意
未来协议的普遍不可能定理，也不是 LLM 任务归属研究的 NO-GO。

## 2. Global Constraints

- 研究问题、R2、prompt、oracle、原计划、原 576 槽位和顺序不变。
- live admission 1,048,576 B；16384 output-token、131072 input-byte、180000 ms
  deadline、5000 ms live cleanup 不变；不增加 read-size/count 等停止规则。
- P-G 既有 62 步、一片段 synthetic 响应、12 个 D 步骤、57 个带历史步骤、step 21 后
  恢复不变；不改变 chunk 数、响应大小、执行顺序或并发来提高 batching 比例。
- 原 v4 baseline、计数范围、append/flush-request 各减少至少 30% 不变；不换 v5。
- 所有关键完整审计、原始 read 边界、raw-first、错误优先级、no retry/no resend 保留。
- 原 620 -> 496、20% 的 FAIL 不改分。P-L/P-H 的改善不能平均覆盖 P-G。
- 不改任何实现、正式接口或 main；不重新冻结、不运行模型或性能系列。

## 3. 原始证据核对与结构分解

本次只读逐条核对既有 v4-guarded JSONL。**62 个 attempt 全部具有相同的十条序列**，
不只依据第一个样本推断；并核对两臂逐 API 调用的 append/flush-request 计数。

| 序号 | 原 v4 逻辑记录 | v4 提交 | 已批准 v6 提交组 |
| --- | --- | ---: | --- |
| 1 | reserve | 1 | B1：reserve |
| 2 | pre_send | 1 | B2：pre_send |
| 3 | request | 1 | B3：request |
| 4 | response | 1 | B4：response |
| 5-6 | wire_delivery、wire | 2 | B5：raw-first，一次提交 |
| 7-8 | reasoning、model | 2 | B6：derived，一次提交 |
| 9 | terminal | 1 | B7：terminal |
| 10 | settle | 1 | B8：settle |
| 合计/attempt | 十条证据均保留 | **10** | **8** |

这里的“原屏障”指当前已批准的 raw-first/binary 路径仍具有的八个独立确认点；
不是把此前已经获批的 metadata+raw、reasoning+model 组内合并重新判作非法。

计数来自真实既有回放：每组同步提交同时增加一个 append_call 和 flush_request。
原始 read 分母仍为 62 次非空交付，另有 62 次 EOF；EOF 不是用于凑分母的第二片段。
初始化 manifest、完整审计、报告写入等成本按原口径另列，不挪进 baseline 分母制造改善。

## 4. “不删除屏障”的操作性定义

本案沿用现有同步 API 和故障处理，采用以下等价标准，而不是只要求正常结束时状态相同：

1. 每个原调用成功返回时，所确认的逻辑前缀已耐久；不得提前返回、内存 ack 或后台补写。
2. 在某屏障返回后、下一次提交调用尚未发起的明确切点，恢复可见的已提交前缀与现行
   路径相同。不得提前把后续事件解释成已发生/已提交来减少一次落盘。
3. 各点的失败、取消、证据不完整、未结算与禁止重发语义不变，所有记录及其来源保留。
4. raw+metadata 耐久后才解码，terminal 落盘后才按现有条件判断并结算；不能拿内存
   terminal 代替 D2 审计使用的磁盘事实。完整审计边界也不合并。

**不能偷偷将“独立耐久确认/恢复等价”改成“最终包含同样十条记录”或“仍然没发错请求”。**
reserve+pre_send 一次提交可以保留多数业务安全先后，但消除了 reserve-only 恢复切点；
这属于屏障协议变更，不是已证明满足当前约束的优化。

本定义不要求普通文件 append 掉电原子，也不要求恢复只出现最后一次已返回 ack；
在正在进行的提交内部仍按现有 partial/unknown 规则处理。这里比较的是两次独立调用
之间、下一次调用尚未发生的切点，避免用一般的 ack 前掉电窗口混淆提前提交后续事件。

## 5. 八个确认点的依据

| 点 | 必须保留的顺序或恢复区别 | 主要依据 |
| --- | --- | --- |
| B1 reserve | 占用 attempt/预算后确认，再发起 pre_send；保留只有 reservation 的中断状态 | send-boundary.mjs:115-119 |
| B2 pre_send | 输入包/编译与路由证据已落盘，再解析凭据；不能因凭据失败丢掉此证据 | send-boundary.mjs:119-126 |
| B3 request | 完整 pre-send 校验后记录 request，再允许 Fetch；不得提前声明 dispatch 证据 | send-boundary.mjs:135-148；deadline-transport.mjs:134-143 |
| B4 response | headers/status 已落盘后才进入 getReader/read；响应与尚未交付 body 可单独恢复 | deadline-transport.mjs:146-160 |
| B5 raw-first | metadata+raw 耐久后才 parser.push；不能先解码再等组提交 | deadline-transport.mjs:90-119 |
| B6 derived | parser 已产生的 reasoning/model 提交完成后返回 read 处理；保留 decoder 部分失败输出 | deadline-transport.mjs:117-129 |
| B7 terminal | EOF/停止/cleanup 的实际结果已知并归档后，perform 才返回；保留 terminal-only 未结算状态 | deadline-transport.mjs:171-223 |
| B8 settle | 根据完成/错误/D2 磁盘审计分类，结算后再完整审计和开放下一原定坐标 | send-boundary.mjs:154-175 |

以上源路径均位于 `research/phase-0.9.19/gate2/`，对应本次核对的未改源码。
文件提交计数及同步 flush 位于 `run-ledger.mjs:140-141`；settle 独立追加见 `:194`。

## 6. 条件下界与不可行证明

在现行追加账本和诚实耐久请求计数下，每个独立确认点都需要该点自己的持久状态推进。
若两个确认点之间没有新的持久状态变化，分别在“第一个点后、第二次调用前”和
“第二个点后”崩溃，则恢复器无法从相同磁盘状态区分两个要求不同的已提交前缀。
预写后续数据也不能解决：要么恢复提前看到未来事件，要么需要新的耐久 commit 标记。

因此，保留八个独立确认点的完整 attempt，至少需要八次被如实计数的耐久提交。
在当前单次同步 append+flush 封装内，append 与 flush-request 下界均为八次。

```text
baseline = 62 * 10 = 620
required_max = floor(620 * (1 - 0.30)) = 434
preserved_barrier_minimum = 62 * 8 = 496
maximum_reduction = 1 - 496 / 620 = 0.20
missing_reduction = 496 - 434 = 62
```

不要求每个 attempt 都恰好七次才算通过；可非均匀分配节省，但总共至少还需省 62 次。
由于每个 attempt 都不能低于八次，非均匀安排也不能突破这个总下界。
任何新增控制/失败/维护操作只会增加成本，不会提供负的提交次数。

这里的 20% 是固定负载的确定性结构结果，不是总体统计风险上界或模型概率。
重复五对或更多次不会改变该正常路径的提交数量。

## 7. 候选审议

| 候选 | 纸面效果 | 屏障/证据检查 | 本案结论 |
| --- | --- | --- | --- |
| C-INTRA：屏障内减少复制/分配、重建临时查找表 | 提交仍 496；可能改善 CPU/RSS | 不跳过校验且临时表不当权威时原则可合规；收益未证明 | **不能解决计数失败，不建议为本目标实施** |
| C-RP：reserve+pre_send 原子提交 | 7/attempt、434 总计，纸面 30% | 丢失 reserve-only 切点；或 reserve 必须等待未调用的 pre_send | **不满足当前独立屏障，拒绝** |
| C-TS：terminal+settle 合并 | 至多再省一次/attempt | 丢失 terminal-only 未结算切点；D2 还依赖落盘 terminal 审计；success 特判也改变其恢复语义 | **拒绝** |
| C-PR：pre_send+request 或 reserve+request | 可减少控制提交 | 跨过凭据解析及完整发送前校验，或提前记录 request；改变错误/dispatch_unknown 证据 | **拒绝** |
| C-RW：response+首个 raw | 可省一次 | 必须在 response 未确认前读取 body，或提前无事实地编造 raw；也丢失 header-only 切点 | **拒绝** |
| C-RD：raw+derived | 可省一次 | 要先解码才能取得 derived，破坏 raw-first 的耐久先行要求 | **拒绝** |
| C-DT：derived+terminal | 可省一次 | 要等 EOF/cleanup 才有 terminal；消除 derived-only 切点，改变中途失败证据 | **拒绝** |
| C-GROUP：跨 read/attempt 或异步 group commit | 可能减少系统调用 | 改 read 边界、串行/in-flight 规则，或提前 ack；等待未来调用又会阻塞现行同步流程 | **拒绝** |
| C-IO：writev、定位写、后台/WAL、write-through 等换名 | 未必减少真实耐久确认 | 不改变八点就不能省掉其确认；不能将等价同步耐久请求从计数中隐去 | **无合规计数通过依据** |
| C-BYTES：压缩/去重/更紧凑封套 | 可减字节，不减少八次确认 | 有额外完整性/格式风险；即使解决也不改变当前计数下界 | **不作为本案解法** |

特别是 C-RP，prepared 数据大部分已经存在，提前构造 pre_send 并不难；但数据“已知”
不代表可以把其“独立提交确认”当作不存在。保留两次真实耐久确认则仍是八次，无法过门槛。
不得只保留两个函数名、两个计数器或两个内存 callback，就声称保留了原耐久屏障。

替换介质、引入另一种持久化原语或改变确认语义，需要新的环境/存储/故障合同；不能
以本案有限下界声称其永远不可能，也不能未经论证将其算作本案的合格候选。

## 8. Review Focus 与条件后续任务

本轮没有代码任务获批。以下仅定义 Owner 若需要进一步形式化验证时的交付，不是
推荐继续优化直到通过，也不是启动实现的隐含许可。

### Task S1：可选的屏障/恢复合同形式化，需另批

**拟新增文件：** `research/phase-0.9.19/tests/gate2-barrier-contract.node-test.mjs`。
不得修改现有 transport、ledger、原 v4、冻结材料或既定性能计划。

**Interfaces:** 输出每个 B1..B8 的输入事实、提交前缀摘要、ack、下一允许动作、失败状态。
只用固定合成事件和独立测试目录，不访问模型或真实凭据，不运行计时。

- [ ] 先定义八个切点及“下一次调用尚未发起”的恢复预期，明确不能只验最终状态。
- [ ] 以反例验证 C-RP 的提前 pre_send、C-TS 的提前 settle、C-RD 的提前 decoder 不能等价。
- [ ] 验证 reserve/pre_send 后凭据失败、request 前冻结校验失败、response 后 body 失败。
- [ ] 验证 raw 耐久失败时 decoder 未运行；derived 部分失败仍保留已产生片段。
- [ ] 验证 terminal 后中断、D2 磁盘审计失败、settle 后重开均维持原 no-resend 语义。
- [ ] 如发现某个切点不属于原合同，提交具体源码/既有批准依据重新审议；不自行删掉它。

**退出：** 可反驳的合同证书或修正后的不可行范围，不产生计数 PASS 或实现许可。

### Task S2：C-INTRA 成本研究，仅在 Owner 另设明确工程目的时考虑

若另行批准，其唯一合格范围是屏障内计算：每次审计仍读完/重验全部证据、临时索引
每次重建、同等结果物化、全部耐久确认保持。既有八组计数仍应得到 496，P-G FAIL 保留。
没有证据表明它能降低时间/RSS；不得将“减少提交次数”写入该任务的预期收益。

本案不建议启动 S2，因为它不能达到当前的计数目标。也不提交“先计时看看是否值得
豁免计数项”的流程。若只维持当前目标与约束，合理退出就是停止该类计数优化。

## 9. 本轮验证与审批边界

本轮仅新增本审议文档并更新状态入口，使用已有源码和归档作只读核对。未修改实现、
未产生新回放或性能数据、未重新冻结、未运行模型、未改 main 或提交推送。
原 233 项回归属于上一轮成绩，本轮不冒充新运行。

新审议证据根：
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-pg-structural-review-20261115/`。
`structural-analysis.json` 保存 62 个 attempt 的原事件序列和算术；完整历史仍在原目录。

**请求 Owner 审核的决议：** 接受该条件不可行结论，保留 P-G FAIL；不批准计数优化
实现或性能系列。若仅需进一步验证等价定义，可独立批准 S1；本案不请求放宽任何门槛、
改变负载、合并原屏障或恢复模型批次。
