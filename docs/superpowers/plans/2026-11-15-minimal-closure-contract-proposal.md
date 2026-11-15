# MC-1 Minimal Closure Contract Proposal

> **For agentic workers:** 仅提交 Owner 审核，不是实施、探测或实验许可。
> 另获明确授权后才可按 superpowers:executing-plans 执行相应静态任务。
> 不启动代理、不修改实现、不运行评分/性能/模型、不重新冻结、不提交或合并。

**Goal:** 以最小契约差异处理 S2 的 native 错误、reader 失败接口、sink 完成和 RSS
四类缺口；不另起大型架构，不用增加容量数字或改研究门槛获得表面闭合。

**Architecture:** 首先给现有 native 执行环境建立只读资格描述；对未来 ledger reader
仅研究缩小诊断文本的等价承诺；将候选 stdout sink 明确为受控本地完整捕获端；
将静态分配证明与原真实 RSS 验收分开。四项各自审议，不捆绑为运行准入。

**Tech Stack:** 当前 Node/V8/native Fetch、原研究 JSONL/JSON 与已有 S2 静态台账。
不更换客户端、不改冻结模型协议或评分器、不新增持久化索引/进程隔离架构。

**Spec:** [S2 认可结果](../../../research/phase-0.9.19/gate2/s2-static-proof-results-2026-11-15.md)、
[完整资源台账](../../../research/phase-0.9.19/gate2/joint-resource-proof.md)。

日期：2026-11-15。状态：**PROPOSAL_ONLY / CONTRACT_CHANGES_NOT_APPROVED / G0_BLOCKED**。

## 1. Global Constraints

- 研究问题、冻结 public/oracle/prompt/计划、576 槽位与顺序不变；不改分、不补样。
- 现有原始输入/输出、错误文本、全部历史与失败证据保持原字节。S2 原文件不改写。
- P-G 620 -> 496、20%、FAIL 保留；G1 仍未批准，原 >=30% 计数改善门槛继续阻塞。
- live W=1048576 B；input=131072 B、output=16384 tokens、generation=180000 ms、
  cleanup=5000 ms 不变。原 capture median<=0.80、read p99/audit/RSS 每 pair<=1.25不变。
- 不加行长/错误长度/内存停止阈值，不裁剪证据，不增加 timeout/kill/retry/resend。
- Q/N/F/头域、磁盘及 RSS 候选数值未获准；本方案也不请求增加这些数值。
- 本轮只新增提案与状态入口，做文档和证据保护检查；不执行下一轮资格取证或验证。

## 2. 最小变更集与拒绝变更时的结果

| 项 | 最小候选契约变化 | 保持不变 | 若不认可该变化 |
| --- | --- | --- | --- |
| MC-N | 容量证明只覆盖可追溯的具体 native 环境，而非所有 Node/OS/注入对象 | 原 error.code/message 保存规则；不改现有客户端 | e_max/j_max 继续未知，不用短枚举代替 |
| MC-R | 未来 ledger reader 的失败等价要求为同一首个失败分支/语义类别，而非原生诊断句字节相同 | 完整旧接受域、合法结果、拒绝判定、错误优先级、原证据 | 精确原生诊断文本兼容继续未闭合 |
| MC-S | 完成接收端明确为受控本地完整 stdout 捕获文件；不承诺任意终端/GUI/远端已显示 | 完整 stdout 字节、顺序及与 result 独立的副本 | 任意停滞 sink 的完成保证继续冲突 |
| MC-M | 静态证书只证明绑定环境下的分配/驻留条件，真实 RSS 仍按原门槛另验 | 原 RSS 数值、负载、采样/进程边界及性能准入 | 无环境假设的硬 RSS 保证继续不可签发 |

MC-N/MC-M 是证明适用域与资格描述，不是更换运行时、启用新配置或新停止规则。
MC-R/MC-S 则确实改变未来研究内部交付/诊断契约，必须显式审批，不能称作透明重构。
四项认可均不等于 G1 批准，也不证明全资源证书已闭合。

## 3. MC-N：绑定现有 native 来源，不先替换或规范化错误

### 3.1 拟议环境资格描述

`NativeQualificationProfile` 至少绑定：

- 实际启动的 Node 可执行文件路径/摘要、版本、平台/架构、对应源码或供应方构建来源；
  不能仅凭版本号认定二进制与某份上游源码相同。
- V8、内置 Fetch/streams/TLS 等可达组成与构建差异；启动参数、preload/loader、
  自定义 dispatcher/monkey patch 是否存在以及来源。不以函数名为 native 身份证明。
- 本研究入口实际调用链与已保存异常字段：transport 的 code、parser 的 message、
  宿主捕获的 stderr；没有保存的 OS Error 整对象不凭空变成新的必存材料。
- 可进入错误模板的输入/本地环境字段域及字节/字符单位；只追查源码可达字段。
  不枚举无关账户/凭据；环境配置仅保留必要的非秘密身份或脱敏摘要。

资格描述是新的候选工程记录，不改原 freeze manifest，也不能给旧批次追认资格。
不得在本轮写入 Node flags、替换二进制、改变全局 fetch 或批准某个新客户端。

### 3.2 有限静态取证任务与证明出口

- [ ] 从实际入口向下逐项追踪 fetch/read/abort/cancel 与原生 JSON/Buffer/clone 的异常
  出口，形成 `producer -> exposed field -> template -> dynamic source -> multiplicity`。
- [ ] 区分本地 code、外层包装和 cause：只有原代码实际读取的字段进入 e_i；不能
  用 cause.message 的界替代外层 code，也不能漏掉实际保存的 parser message。
- [ ] 固定模板按字面量核算；动态模板按来源字节、转义和最大次数推导 e_max/j_max。
  引擎可能嵌入输入片段时，必须查实际实现，不能假定只打印几十个字符。
- [ ] 给每个边界标记源码证明/供应方保证/未绑定依赖；只要一条可达出口缺失，
  就返回 NATIVE_DOMAIN_NOT_CLOSED。不能从少量异常样本归纳“已枚举全部”。

这条路线不更改任何错误字符串。若实际构建来源不可追溯，或模板确实引用未限定
环境数据，就明确给出缺口；不自动切换客户端、截断、归类替换或开放 native 网络探测。
额外小规模故障取证即使有帮助，也需以后另批，且只能检验轨迹，不能替代穷尽证明。

## 4. MC-R：仅缩小未来 ledger reader 的诊断措辞等价承诺

### 4.1 保留与调整的精确边界

**保留：** D_old 中所有成功输入的同一逻辑状态；所有原非法输入仍非法；partial
journal、JSON、fields、seq/previous、digest、transition、checkpoint 等首个失败
分支及短路次序；不把资源/I/O 未完成解释为已判合法或非法。

**仅调整：** 不要求新 reader 重新生成旧 JSON.parse 对整行给出的完全相同句子、
片段展示和字符位置措辞。保留实际产生的原始 cause 文本，不伪造旧引擎诊断。
若错误位置不能证明与旧位置一致，用 unknown/null，不填推测值。

这项变化只限新的 ledger reader 工程诊断。**不得修改**冻结 readRaw/inline parser
返回的 errors、report 中的 parser_errors/score.errors、模型错误分类或任何旧分数；
这些原生 message 的 j_max 仍由 MC-N 证明，不能靠 MC-R 把它删除。

### 4.2 候选接口与等价表

拟议 `ReaderFailureV1` 包含：version、phase、stable_code、source_fingerprint/head、
record/range（仅已证位置）、实际 cause_raw（如确实已取得）及 audit_complete=false。
字段须在总预算逐项计量；不能把 cause_raw 从预算移走以换取固定小 envelope。

| 输入/故障 | 证明义务 |
| --- | --- |
| 非LF结尾且前面另有语法错误 | 仍先判 partial journal，不因流式扫描改为先报JSON错误 |
| 非规范合法 JSON / 重复 key / 深结构 | 不新增拒绝；仍满足 S2-R 的语义模拟关系 |
| 完整行语法非法 | 同一JSON失败阶段；native措辞可不同，但实际cause与原输入完整保留 |
| fields/seq/digest/state/checkpoint非法 | 同一最早分支和分类；不得把多个具体失败全部合并成 parse_error |
| I/O、临时文件、分配不足 | 未完成审计；不得生成通过凭据或允许重发；新增内部I/O失败如何外显须单列 |

- [ ] 输出原每个 throw/短路分支到候选 phase/code 的逐项映射，不能只有几个泛化标签。
- [ ] 补齐正常与失败模拟关系，以及实际cause、原文件引用和未知位置的完整编码界。
- [ ] 列出所有与旧接口不同的点和消费者影响；不能修改 catch 后继续/结算/重发语义。

不运行旧 reader 来制造“旧错误消息”，不新增第二份大物化，不重格式化旧日志。
如果 Owner 仍要求未来原生错误文本逐字节相同，此项继续 NOT_CLOSED，默认不实施
原 parser fallback，也不继续增加对 native 诊断模板的仿真实现。

## 5. MC-S：把 sink 定为本地完整证据接收端

### 5.1 最小接收端选择

推荐一个独占、无中间不可控 pipe 的本地捕获文件作为候选 stdout 接收端。保留原
完整 summary JSON+LF 的字节序列，不改成只打印路径/摘要，不以 result 文件替代
stdout 副本。终端/GUI预览可在捕获后另行读取，不参与完整性承诺；本方案不启动
预览或新的日志进程，也不把未计量的预览队列藏在边界外。

这不是对原任意 stdout sink 的无损透明替换，而是明确改变“谁签收即交付完成”。
如仍要求远端或交互终端接收确认，应另有该端服务合同；不能由本地文件完成代替。

### 5.2 完成与持久化合同

候选只保留一个串行 writer 和一个生产片段。下个 reserve 需等待原结果文件及
stdout 对应完整前缀均确认；不在 ledger 锁内等待，不扩展 generation/cleanup。
分块大小 c、操作系统缓冲和调用次数要有证明，不能把 highWaterMark 当硬上界。

候选确认必须同时满足：

1. 目标文件身份、独占写者和精确 offset/length 确定；部分 write 正确推进offset，
   不因短写重复已经确认的字节。
2. 完整字节和 hash 对应同一 summary/顺序；捕获后验证的全部额外读取计入成本。
3. 指定存储环境的 flush/完成操作成功，并满足明确的故障模型；write/drain 返回
   不能单独当作耐久确认。若模型不覆盖掉电/设备失效，不声称无条件掉电保证。
4. 完成记录绑定 source head/profile、范围、字节数、hash、完成状态；其写入、
   临时副本和故障残留都计入。新格式不自动继承 S2-P 的512 B额度，须重新核算。

`capture_complete` 只表示实际输出前缀完整，不表示576槽计划完成；提前失败时不得
把完整保存了失败前缀报告为 full_schedule_complete。批次完整条件仍沿原计划/结算。

### 5.3 必须承认的条件与证明义务

- [ ] 绑定文件系统/挂载/设备的实际资格、空间与配额、写入权限和独占条件；不扩大
  为“任意磁盘/任意宿主/任意崩溃下必完成”。
- [ ] 证明分块队列、短写、最终确认和部分失败轨迹；记录 reserve 前等待与原测量
  边界的关系，保留总 wall/output wait 成本，不能让新等待从性能台账消失。
- [ ] 明确 eventual progress 依赖：若本地I/O永久停滞，仍不能保证完成。本轮不
  加超时或 kill；环境不满足时不能签发资格，不假装已经有有界服务时间。
- [ ] 列明未确认退出的状态映射；完整原始部分文件不删，不重试/补发。异步回调
  等待与新增内部错误传播属于未来需批准的实现契约，不是已存在的行为。

MC-S减少了一个不受控接收端依赖，但没有消除存储故障或 native缓冲证明责任。

## 6. MC-M：RSS 不承诺纯静态无条件闭合

不提出新的 heap 上限、Job Object kill、worker/进程重启或强制GC方案。保留 S2 的
当前attempt/D2、旧新cache、全rows与原aggregate；先明确证书能证明到哪一层。

| 层 | 要交付的证明 | 不允许推出的结论 |
| --- | --- | --- |
| M-L 逻辑对象/分配 | 同时存活集合、别名、累积分配、token/字符串/数组/Map数量 | JSON编码字节等于RSS |
| M-E 绑定环境预算 | 以MC-N同一runtime/宿主绑定布局、allocator、native、GC最坏保留与sink缓冲 | 不可达立即释放；heap极限等于可完成负载 |
| M-V 原性能验收 | 未来另批的固定负载与原每pair RSS<=1.25等全套门槛 | 静态条件成立即可视为实测PASS |

最小契约是接受 M-L/M-E 的**显式条件证书**，不要求本轮或下一轮纯静态分析给出
未经运行时资格验证的硬 RSS 保证。M-V完全保留且不提前执行；这不是降低原门槛。

- [ ] 将每个 h_obj/h_slot、字符串表示、native buffer、GC/allocator保留项绑定源码
  或可核查保证；不能以任意倍数、经验峰值或一般文档替代具体资格。
- [ ] 原因无法静态给界的项保持 unknown。若采用累积分配保守界，必须包含所有
  full audit、D2、scoreSets/canonical/sort、输出和失败路径，不能只算活跃对象。
- [ ] 保持父/子进程及捕获端的完整边界。若候选sink改变进程结构，提交桥接差异，
  不移动工作到未计量进程来改善RSS；旧采样定义不擅改。
- [ ] 输出资源资格依赖清单：静态可证、需未来非计时正确性验证、需未来原性能
  验收分别列出。当前无测量授权，不采样RSS、不启动性能系列或“校准”负载。

如果要求“无环境假设的硬RSS上界”且不准做任何未来运行时资格验证，就明确返回
本条件下不能闭合，不再循环增加磁盘/内存候选数字。若M-E推出界过松，也只能
报告该界不足以证明可行，不能据其大于预算反推实际必然不可行。

## 7. 联合预算与剩余依赖

S2 的148.831282 GiB仍只是核心+报告的原条件子项，不因MC-1获得新的容量资格。
下一轮预算必须重新代入：

```text
e_max, j_max                         <- MC-N
新ReaderFailure字段及实际cause        <- MC-R
本地sink缓冲/验证读取/完成记录/残留    <- MC-S
运行时/native/GC/allocator/完整进程域  <- MC-M
```

此外，Q/N/F/头域、全reader实现符合性、完整文件系统分配和历史/失败保留仍沿S2
台账，不由这四项自动消除。不得把新ReaderFailure或sink字段塞进旧固定K额度，
也不删除stdout副本来省容量。全部新增读写/flush/scratch成本进入原三层操作表。

## 8. 最小执行顺序、交付与审核点

| 次序 | 仅静态的拟议交付 | 成功/失败出口 |
| --- | --- | --- |
| 1 | MC-N native-profile-and-error-proof.md | 具体构建与生产者域可追溯；否则明确缺失来源，不替换客户端 |
| 2 | MC-R reader-failure-equivalence.md | 每分支映射、完整证据/编码、不影响冻结parser；若需字节相同则继续未闭合 |
| 3 | MC-S local-sink-completion-contract.md | 接收端/故障模型/完成前缀/缓冲和操作完整；无服务保证则仅安全性条件成立 |
| 4 | MC-M runtime-resource-qualification.md | 条件界与未知项、未来验证需求完整；不签发实测RSS或容量PASS |

拟议后续文档放 research/phase-0.9.19/gate2/；本轮不创建为已经执行的结果。
只读责任路径：MC-N 对应 transport/deadline-transport/send-boundary及实际runtime来源；
MC-R 对应 run-ledger/ledger-state及消费者；MC-S 对应 execution/live；MC-M 汇总S2
report/score和完整对象/操作台账。都不要求本轮改变任何实现文件。

Review Focus：混入cause与code、误改冻结parser诊断、未知offset伪装精确、部分捕获
冒充整批完成、GC或进程外缓冲漏计。每项后续静态报告必须给对应反例轨迹。

**本次请求审核这四项最小方向及契约差异；如批准下一步，建议最多授权静态资格
描述/分支映射/合同和预算细化。批准研究不等于批准候选契约生效。**
未来非计时实现验证、性能验收、重新冻结和模型采集各需另批。G1仍未批准，原
P-G FAIL与原计数门槛独立阻止准入；本方案没有提出旁路或重新启动计数优化。
