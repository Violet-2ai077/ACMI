# ME-S2 Static Closure Proposal

> **For agentic workers:** 本文件仅提交 Owner 审核，不是实现或执行许可。
> 后续只有明确获批的静态任务可按 superpowers:executing-plans 推进；不启动代理、
> 模型、重评分、回放、性能系列、重新冻结或 Git 集成。

**Goal:** 对 ME-S 的 reader 接受域、完整错误/报告编码、stdout 队列和 RSS 缺口，
提出可逐项否决的静态证明路线，明确契约变更与不能由静态分析给出的保证。

**Architecture:** 保留 ME-1 的逐记录写入、原耐久屏障及每次完整重放；为 reader
分别证明全旧接受域的语义兼容和指定工作负载的资源界。先列出完整数据生产者及
所有权，再核算编码、磁盘、读取和驻留。对错误来源与输出接收端提出显式交付契约。

**Tech Stack:** 现有 Node 研究源码、JSONL/SSE、冻结输入及原确定性评分器的只读分析。
本提案不选定或声称存在已经合格的新解析器、客户端、序列化器或内存隔离实现。

**Spec:** [ME-S 已认可结论](../../../research/phase-0.9.19/gate2/me-s-static-proof-results-2026-11-15.md)、
[ME-S 接口合同](../../../research/phase-0.9.19/gate2/me-s-interface-contract-2026-11-15.md)、
[ME-1](2026-11-15-history-materialization-evidence-encoding-proposal.md)。

状态：**PROPOSAL_ONLY / OWNER_REVIEW_REQUIRED / G0_BLOCKED**。日期：2026-11-15。

## 1. Global Constraints 与本次申请范围

- 研究问题、冻结 public/oracle/prompt/计划、576 槽位、顺序和所有原分数不变。
- 原证据、ME-S 条件证明、历史失败全部保留；P-G 620 -> 496、20%、FAIL 不改写。
- G1 仍未批准，不重启计数优化；原 >=30% 计数改善门槛继续阻塞。
- live W=1048576 B；输入 131072 B、输出 16384 tokens、generation 180000 ms、
  cleanup 5000 ms 及原性能门槛不变。不得扣除 I/O/背压耗时延长原时限。
- Q/N/F/头域、capture/transport、磁盘和 RSS 候选数值不视为已批准配置。
- 不增设行长/错误长/队列长/内存停止条件，不截断、不补发、不重试、不减少槽位。
- 只提出下一轮静态任务；本轮仅新增提案和状态入口，做文档检查及证据哈希核验。

本提案建议下一次至多批准 S2-R/E/P/O/M 的静态合同、证明表和预算推导。
“允许研究某项契约变更”与“批准改变该契约/实现/运行”分别审批；任何静态结论
都不替代 G1、资源配额、性能验收或模型采集许可。

## 2. 需要审议的约束变更总表

| 编号 | 建议研究的变更 | 明确保留的内容 | 若不允许变更 |
| --- | --- | --- | --- |
| R | 将逐行物化改为语法感知扫描及临时外存表示；分离语义兼容证书与工作负载资源证书 | 完整旧接受域、原解析后摘要、完整审计与原证据 | 不能直接套正常 writer 行界；保留 reader 未闭合 |
| E | 容量认证绑定一个精确版本、完整来源可枚举的客户端/适配器组合，而非任意注入异常对象 | 原错误字符串和重复保存位置，不做裁剪或归类替换 | 只能保留参数 e；无可用的统一小预算 |
| P | 新派生文档允许分块紧凑编码及临时 spool；先保持原评分与 aggregate 调用语义 | 全字段、行/分组顺序、数值加法次序、旧文件字节 | 不足以避开全报告字符串；原限制继续存在 |
| O | 研究逐块背压、异步 onResult 完成确认及明确 sink 合同 | 完整 stdout 字节和顺序、模型/清理时限、错误事实 | 保留全批排队预算，不宣称单槽队列 |
| M | 分开认证有条件的分配/驻留上界与以后实测 RSS；绑定准确运行时与宿主 | 原 RSS 比值门槛、完整计量边界和所有子进程 | 不能从 JSON 字节直接推导 RSS PASS |

R 的临时外存是可丢弃的派生工作区，不是持久化可信索引或增量审计；额外写入、
读取、恢复和残留必须计入。O 改变执行驱动的异步契约和跨 attempt 时间安排；
不能作为“透明重构”直接实施。M 不是把未通过的实测门槛改成纸面证明。

## 3. Review Focus

1. 非规范空白、重复 key 被覆盖的大值、非法 UTF-8、超长数字/深嵌套：不能误用 SSE
   的严格 JSON 规则缩小原 ledger reader 的接受域。由 S2-R 给出逐类静态轨迹。
2. 失败路径的任意 error.code、原生 JSON 错误消息和不完整终态：不能只证明正常
   result。由 S2-E/P 给出来源到最终每份编码的链路。
3. B 的 inline AST 转换与动态 schema 路径：不能把 A 的原始 262144 B 检查视为所有
   中间对象的统一界。由 S2-P 区分 arm、解析阶段与字段复制次数。
4. stdout 永久停滞、部分 write、关闭与未确认完成：不能把 write 返回/文件存在
   当成完整持久证据。由 S2-O 定义所有权及失败状态，而非新增自动超时。
5. 旧新 cache、原 aggregate 的 rows、GC 未释放对象、client/native 缓冲同时存在：
   不能以“流式”消除驻留。由 S2-M 画同时存活集合及完整资源方程。

这些是拟议的静态反例/轨迹清单，不授权生成压力见证或执行故障测试。

## 4. S2-R：完整 reader 接受域

### 4.1 证明目标与可行性边界

定义 D_old 为固定原 v4 reader 在其运行条件下能够完成解析与校验的文件集合。
对 x 属于 D_old，要求新逻辑视图等于旧视图；对原语法/摘要/状态非法输入，不得
因优化而变为合法。原实现因超大字符串/OOM 不能完成，不是一个可依赖的语义拒绝
规则；ME-1 可以扩大可处理容量，但不得宣称“所有资源失败也逐字节等价”。

不新增小行长/深度/字符集拒绝规则。正常 writer 子域的资源界不得替代 D_old。
完整兼容的成本以原文件字节 H、最大行字节 R、token 数 T、最大深度 d、保留值大小 V
参数化；只有未来指定生成域具有这些参数的有证上界时，才能代入 576 槽预算。
这不是为非规范文件提供免费或固定小 RSS 的承诺，也不是将其排除出接受域。

### 4.2 推荐候选：完整语法扫描 + 外存语义表示

1. 按原 Buffer->UTF-8 字符串语义处理跨块解码、替换字符、BOM 和原 LF 行边界。
   原 JSONL 先分行再 JSON.parse；不能改为忽略任意跨行空白的一串 JSON 文档。
2. 完整 token/语法验证，只在 token 外处理空白；`1 2` 不得变成 `12`。
   被后续重复 key 覆盖的值仍须通过语法验证，不能跳过任意原始字节。
3. 深度栈、超长 token、对象成员记录允许受控外存化；临时记录引用原文件范围。
   不依赖固定小 JS 调用栈，不一次拼接整行。每个完整审计重新建立这些记录。
4. 对象成员按解析后的 key 比较，保留第一次插入位置、最后值及整数索引键枚举规则；
   `__proto__` 等必须保持 JSON 数据属性语义。原保留值、数组顺序和数字转换均不变。
5. 生成与原 hash(body) 相同的 JSON.stringify 字节序列再流式 hash。不得对原行直接
   hash，也不能用另一个 canonical JSON 替代。必须覆盖代理项、转义 spelling、负零、
   数字舍入，以及原 JSON.parse 接受但后来被覆盖的非有限数，不能套 SSE 拒绝规则。
6. 保持原 fields/digest/transition/checkpoint/fingerprint 次序、D1/D2 与单写者约束。
   范围消费时不释放原审计锁；外存副本不成为跨审计的信任捷径。

这是需证明的候选算法，不是已选合格库。准确数字转换和完整 JSON 对象语义是
高难度义务；仅有空白过滤器不能完成任务。错误消息若无法复现原原生文本，应
列为显式失败接口差异，另行审议，不能悄悄改变分类或历史日志。

### 4.3 交付与退出条件

- [ ] 从 `gate2/run-ledger.mjs`、`ledger-state.mjs`、`protocol/contracts.mjs` 提取
  reader 接受/拒绝分支表，禁止从 SSE parser 借用额外约束。
- [ ] 提交词法、重复成员/属性枚举、数值、hash、transition 五个模拟关系及反例轨迹。
- [ ] 列出 scratch 的最大同时副本、每轮读写次数、崩溃残留与安全清理责任；临时
  文件不能修改原 journal，也不能成为批准前实际产生的实现制品。
- [ ] 输出兼容证明状态与 `B_scratch(H,R,T,d,V)`、`M_reader(H,R,T,d,V)`、读取次数；
  若一项无法证明，就提交具体缺口，不把全域兼容降级成 writer-only PASS。

默认不选择“原 reader fallback”或“仅接收 canonical JSON”：前者回到全批物化，
后者缩小接受域，均需另一份明确约束修订。资源不足时不能将未完成审计报为合法
或非法；此区别是拟议结果合同，实际错误接口变化仍须批准。

## 5. S2-E：错误生产者与完整编码域

推荐先证明精确生产者的实际界，而不是在 sink 增加长度上限。

- [ ] 枚举 fetch/read/abort/cancel、decoder、record/recordBatch、文件输出、导出与
  reader/report 的所有 catch/throw 出口；标出当前保存哪些字段，不擅增“完整 OS
  异常对象必须保存”的新要求，也不丢弃原来保存的 error.code/message。
- [ ] 对固定字符串、版本化原生错误模板、来自输入的动态文本、可注入对象分别列
  最大调用次数、去重规则、编码长度和下游副本。W 只约束 wire 来源，不约束 OS 字符串。
- [ ] 为拟议客户端建立只读来源清单与版本/摘要依赖，证明其异常出口封闭；如果
  依赖环境路径/地址/系统消息，必须给该环境字段的实际合同，不能假定是短枚举。
- [ ] 产出 ErrorEncodingContract：`origin -> value domain -> multiplicity -> encoded bound
  -> destinations -> proof/source`；未知项保持 unknown，不填 0。

e 是一次尝试全部非固定错误字符串 JSON token 长度之和，terminal/result 的 4e
沿 ME-S 保留。确定客户端后的 e_max 必须由来源推出，不是运行时截断阈值。
评分器 `read-raw` 捕获的原生 `e.message` 也要绑定运行时模板；不能只查 transport。

如果坚持任意可注入 string error.code 且要求完整保存，就不能证明与输入规模无关
的小容量预算；JS 引擎的字符串极限也不能充当已证明的可行错误额度。把原文另存
blob 再写 hash/ref 并不减少信息量，而且改变结果字段合同，默认不采用。
若封闭来源证明失败，本项应返回 NOT_CLOSED，不新增停止/归一化策略。

## 6. S2-P：报告全字段界与序列化

### 6.1 先证明现有算法，不先改评分器

首选保留 `scoreDevelopmentAttempt`、`scoreAttempt`、`aggregate` 的原函数与调用
顺序；分块 serializer 只解决最终字符串，不自动解决 rows 驻留。先给原全 rows
和原聚合的完整预算，若不合格再提交单独算法/接口修订，不能本轮偷换成投影评分。

字段推导按实际 producer 递归，不只照合法 schema：

| 部分 | 必须推导的量 |
| --- | --- |
| 原 raw/inline -> AST | A/D/C0 原检查，B inline 到 AST/validator 的不同路径、转义放大、中间文本 |
| schema/reference 错误 | 访问节点数、未知 key/祖先路径长度、缺字段数、每类 push 次数；非法对象不默认遵守合法 list.max |
| score 行 | raw.errors 再复制、identity_observations、task_identity_records、per_task、answer_checks、固定数值和原文来源 |
| transport 行 | 完整 termination/error/usage；usage 在 transport 与 score 的两份都保留 |
| groups/diagnostic_groups | 原循环精确组数、选择顺序、censored_latency 数组、fragmentation 身份集合与原求和次序 |
| 辅助档案 | result/stdout/end、编码完成记录、manifest/source 引用或复制、失败与临时文件 |

`schemaErrors` 的动态路径不是一对一复制：用“访问次数 × 单次路径长度”及
实际源字节共享关系推导安全界；禁止把整个报告直接乘 ME-S 的 6 倍。
先保守，再用共同源域收紧，不能以历史输出中未出现大错误列表证明不存在。

### 6.2 拟议交付与等价性

- [ ] 产出字段级 `EncodedBound` 表：UTF-16/UTF-8 单位、数量、escape 规则、复制次数、
  source/derived、正常/无效/异常分支；所有 JSON 键、分隔符、LF 也入账。
- [ ] 逐 arm、condition、track、stage 推导 row 上界，再按原计划求和；不平均掩盖
  最坏分支。oracle 仅提取只读形状/已有上界，不转发、不重新评分。
- [ ] 定义 ordered value serializer：输出恰等于原结果对象的紧凑 JSON + LF；数组、
  属性顺序、null/缺失/负零沿原序列化，所有原字段保留，旧档案不重编码。
- [ ] 完成记录至少绑定源 head/profile、字节数、摘要和完整/部分状态；其字段值域、
  flush/rename 前后副本和失败残留要计入。receipt 只是派生结果，不替代 journal。
- [ ] 提交完整文档字节界与原 rows/aggregate 分配表；超出预算就报告不合格。

若以后改用磁盘 rows + 分组投影/逐组重读，必须另证每个 aggregate 所访问字段、
身份集合和浮点累加顺序不变，并计入额外读取与临时复制；它不是本提案已批准的
实现。不能把原函数“看起来只需要这些字段”当作已经完成的等价证明。

## 7. S2-O：stdout 的安全性与完成性分开

O0 是不改契约的比较基线：保留当前同步 onResult 与未等待 drain 的行为，累计
最多 576 个输出及宿主缓冲；ME-S 无错误条件下 3859808256 B 只是编码队列子项。
不能声称流式 reader 会消除它。

建议研究 O1：有界分块 serializer + 单一串行 writer + onResult 完成确认。
拟议接口为 `emitResult(value, sink) -> Promise<CompleteReceipt>`，驱动必须 await，
下一次 reserve 前不持有未确认的前次输出；回调不能仍由 executeSchedule 同步忽略。

- producer 每次只产生一个有证上界 c 的片段；sink 返回背压后不再生产下一片段。
  `highWaterMark` 本身不是硬内存上界，必须另证单次追加和 native/sink 缓冲。
- 保留原完整字节流，不改成“只打印路径/摘要”。结果文件和 stdout 捕获仍是不同
  副本；write 接受、drain、文件完整与持久确认分别定义，不能互相替代。
- 不在 ledger lock 内等待，不延长正在运行的 generation/cleanup；下一槽开始延后
  是显式驱动变化。完整 wall time、I/O 等待与原 measurement 边界不删去。
- 永久不消费的 sink 下，只能保证不继续积压，不能保证整批完成。要给完成界，
  必须另有 sink 服务/完成合同；本轮不凭空新增 timeout/kill/丢输出。
- 部分写入、EPIPE、进程退出保留部分证据并依原错误合同失败，不谎报完整、不重发；
  若异步错误无现有对应状态，必须列出需审批的差异，不自动增加停止条件。

静态交付：所有权状态图、JS/native/kernel/supervisor 各缓冲的责任表、成功与停滞
两类轨迹，以及 `M_queue <= c + B_JSsink + B_native + B_receiver` 的各项来源。
外部接收端不在资源边界内时不能声称“全流程 RSS 已闭合”。
任意停滞接收端、无损输出、有限缓冲、必定完成四项不能无条件同时保证；这是需
Owner 选择的环境/完成契约问题，不是增加缓冲数字可以解决的问题。

## 8. S2-M：576 槽资源证明与 RSS 的边界

### 8.1 三种结论不可混用

1. 逻辑编码/对象数量界：可由源代码、固定输入形状和生产者域静态推导。
2. 具体运行时条件下的驻留预算：还依赖对象布局、allocator、字符串表示、GC 保留、
   native/client/sink/cache 生命周期；需要准确版本/宿主假设，不能随意乘倍数。
3. 原 RSS/时延/读写性能门槛：需要未来另批实际验收；1/2 成立也不代表3通过。

所有权阶段至少分：full audit、range/context/compile、reserve、fetch/capture、
settle/D2/cache 交换、result/stdout、最终 report/export。每阶段列对象数量、内容
字节、引用/字符串/Buffer 开销、同时副本、释放条件和最坏回收滞后。
全 rows、前七个 dialogue、检查 I 之前的编译对象不能漏算。

若不能证明 GC 会及时释放，使用累计分配的保守界或明确保留 unknown；不得把
不可达直接等同于 RSS 立即下降。运行时的地址空间/OOM 极限不证明可完成工作负载。
新增 heap 限制、Job Object kill 或 supervisor 阈值是独立行为变更，本提案不申请。

### 8.2 联合预算方程与必须交付的表

```text
B_disk_peak = max_phase(immutable_new_archives + complete_results_and_stdout
              + complete_report + shared_copies + active_scratch
              + retained_failure_artifacts + simultaneous_temporary_copies)
M_peak      = max_phase(runtime_and_native + client + reader_and_scratch_buffers
              + current_attempt_and_D2 + cache_overlap + summaries_576
              + history_and_compile + rows_and_aggregate + serializer_and_sink
              + exceptions + retained_GC_and_allocator_memory)
Read_total  = original_full_audits + selected_ranges + freeze_verifications
              + syntax/member_resolution/scratch_passes + report/export_reads
Write_total = original_journal_operations + derived_output_operations
              + scratch_operations + completion_and_failure_operations
```

预算必须同时满足：S2-R 的接受域成本、S2-E 的 e_max、S2-P 的报告上界、S2-O 的队列
与 sink 合同。ME-S 的 86.3225 GiB 仅在其旧条件域内作基准，不自动包含本提案新增
scratch/receipt，不恢复 192 GiB 足够的结论。未知项不相互抵扣。

原正常 3459 次 ledger 全审计、1153 次 verify 调用保留；新增内部 pass 不冒充减少
原边界，不通过改变 read 分母宣称改善。完整操作表须标明逻辑/物理/计量层，并将
新增 scratch/输出成本计入对应层。原 capture median <=0.80、read p99/audit/RSS
每 pair <=1.25 的门槛和固定负载不变；原计数门槛仍不满足，G0 继续阻塞。

- [ ] 输出阶段重叠矩阵和每项确定/条件/unknown 分类，单位与宿主进程边界明确。
- [ ] 分开计算 legacy 参数域成本和候选 576 生成域；无证参数不代入批准值。
- [ ] 给出磁盘/内存/累计 I/O 完整表达式、能推出的数值和不能推出的原因；不预留
  资源、不运行基准，不把磁盘 free 查询或理论有限性当作可行性证明。
- [ ] 若真实 RSS 必须依赖以后运行时资格验证，明确标为 STATIC_CONDITIONAL，列出
  将来需要验证的假设；不得输出 FULL_CAPACITY_PASS 或调整验收门槛。

## 9. 顺序、文件责任与审核出口

| 顺序 | 静态任务及拟议交付 | 依赖/完成条件 |
| --- | --- | --- |
| 1 | S2-R：reader-domain-proof.md | 原语义分支完整；具体解析候选、模拟关系、参数成本与不等价项 |
| 2 | S2-E：error-origin-contract.md | 全保存字段来源封闭或明确不可封闭；不给任意异常隐含短界 |
| 3 | S2-P：report-encoding-ledger.md | 每字段/每分支完整、源码定位；原评分算法不执行不改变 |
| 4 | S2-O：stdout-ownership-contract.md | O0/O1 差异、背压与永久停滞轨迹、时钟和失败状态责任明确 |
| 5 | S2-M：joint-resource-proof.md | 合并前四项及 Q/F 等旧依赖，不漏 scratch/GC/报告/宿主 |

上述后续文件拟放 `research/phase-0.9.19/gate2/`，本轮不提前创建为已完成报告。
只读源码责任：R 对应 run-ledger/ledger-state/contracts；E 对应 transport/deadline-transport
及所有 catch 出口；P 对应 read-raw/inline-profile/score/development-evaluator/execution/report；
O 对应 execution/live 与 executeSchedule；M 汇总上述对象所有权及原操作台账。
无实现文件修改，无新工具/测试程序；若以后需要证明辅助工具，单独列明授权。

审核出口只允许：STATIC_PROVED（明确域）、STATIC_CONDITIONAL、NOT_CLOSED 或
CONSTRAINT_CONFLICT。若保留任意异常来源、永久停滞 sink 的完成保证或未绑定运行时
的硬 RSS 保证，不能承诺完整静态闭合；应直接提交冲突依据，不循环提高预算。

**建议批准的下一步是上述静态证明任务本身，不是表中契约变更的生效。**
即使五项最终都形成条件证明，G1 未批准及原 P-G FAIL 仍独立阻止准入；不得自动
转入实现、性能系列、研究重新冻结、模型批次、补样或正式 ACMI 集成。
