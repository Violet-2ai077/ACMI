# Full-History Materialization and External Evidence Encoding Joint Proposal

> **For agentic workers:** 仅提交 Owner 审核。本文件不是实施或测试许可。
> 另获分阶段授权后才可使用 superpowers:executing-plans；不启动评审代理，
> 不根据本文执行实现、性能系列、重新冻结、模型采集、提交或合并。

**Goal:** 在不丢失证据、屏障或全历史检查的前提下，提出解除 J1 两个表示反例的
联合候选，并明确等价性、完整容量及门槛适用性尚需满足的证明义务。

**Architecture:** `ME-1` 保留逐记录 JSONL 写入及各原始耐久确认，用有界记录读取、
完整逐次重放、单 attempt 物化和受审计绑定的选择性历史读取替代全批字符串/快照。
外部结果改为保留全部字段和值的紧凑 JSON；全批派生导出不得再次构造巨型对象/字符串。
不采用 v6 事务、不改 journal 编码、不引入持久化索引或增量审计。

**Tech Stack:** 当前研究 Node/JSONL/SSE 接口。仅研究内部 reader/consumer/serializer
契约提案；没有指定某个现成实现已合格，正式 ACMI Contracts、Host、Graph 不变。

**Spec:** [已认可 J1](../../../research/phase-0.9.19/gate2/j1-static-proof-results-2026-11-15.md)、
[已认可 S2](../../../research/phase-0.9.19/gate2/s2-acquisition-admission-review-2026-11-15.md)、
[DC-EC-1 原提案](2026-11-15-joint-delivery-evidence-capacity-proposal.md)。

状态：**DESIGN_ONLY / EQUIVALENCE_AND_CAPACITY_UNPROVEN / NOT_ADMITTED**。
日期：2026-11-15。J1 已被认可；此前 main 同步完成不是本方案的实现或执行授权。

## 1. 需要 Owner 决定的修订，不是已通过的优化

建议审议一个联合候选 ME-1，而不是继续提高 DC-EC-1 的数字：

1. 允许改变“全历史必须一次性变成一个字符串/完整 chunks 对象图”的实现方式，
   **不允许减少全历史验证内容、审计边界次数或逐记录耐久确认**。
2. 允许新版本外部派生证据采用紧凑、无损的 JSON 表示。原 raw、journal、terminal
   payload 不重编码；旧 result/stdout 的字节与 hash 绝不迁移或替换。
3. 显式审议 reader/consumer 的内部接口改变与编码版本。不得继续声称全量
   `snapshot()` 的返回对象、派生文件字节或整个运行身份完全没变。
4. **单独审议相对计数门槛的前瞻适用性。** 在保持全部逐记录写入时，本方案不能
   通过原 >=30% 计数改善门槛。如果它仍是本候选的准入条件，ME-1 保持阻塞。

本轮只提交设计，不请求启用任何数值。建议下一步最多批准 `ME-S` 静态证明和接口
细化，不直接批准实现。架构合理性、门槛适用性、资源可行性、实际运行许可是四个
不同决定；其中一项获认可不自动使其他项通过。

## 2. Global Constraints：不变项与未授权依赖

- 冻结 public/oracle、A/B/C0/D prompts、576 槽位、seed、顺序和研究问题不变。
- 旧分数、历史输出、全部失败日志与 J1/S1/S2 原文件不变；不重评分、不用新编码
  重算旧 hash 或重跑旧输出。原 P-G **620 -> 496、20%、FAIL** 永久保留。
- live W=1,048,576 B；当前 input=131072 B、output=16384 tokens、generation=180000 ms、
  cleanup=5000 ms 不变；不扣除审计、背压和落盘时间延长截止时间。
- A/B 同次生成、D 仅原诊断例外、无第二个 Judge、无 JSON 修复、无重试/补发不变。
- 原实际 read 边界、metadata/raw 顺序、raw-first、耐久确认、D2 局部截尾资格不变。
- 不启用新磁盘/RSS/行长/调用停止条件；不能靠提前停止、减少槽位或删证据证明容量。
- 保留单写者与原路径/锁/已知 head 检查；不扩大为恶意管理员或无条件掉电原子保证。
- ME-1 不解决客户端 Q/F。DC-EC-1 的 Q=64 KiB、N=32768、F=8 MiB、16 MiB capture、
  64 MiB transport 仍是未批准待证依赖；非空/空 read 限制与 identity/头限制也未启用。
- J1 已否定 X=16 MiB；旧 256 MiB/槽、192 GiB 磁盘不能直接继承为充分容量。
  不把原性能系列的 8 GiB RSS/18 小时行政建议当作 ME-1 证明。

## 3. 变更台账

| 约束 | 原实现/原候选 | ME-1 申请改变 | 明确保留与代价 |
| --- | --- | --- | --- |
| 全审计读取 | 全 journal readFileSync + split + parse | 按块读取并逐记录完整验证 | 仍从 manifest 起点到当次 head，全 payload 重读/重验，不只验缓存 hash |
| 全历史驻留 | 所有 attempts/chunks、旧 cache、snapshot 克隆 | 至多单 attempt 的完整 chunks，加每 attempt 有界摘要 | 失去“随时返回全批内存对象”的内部服务承诺；必须改调用者 |
| 上下文读取 | 从整批 snapshot 中筛选 | 从本次审计绑定的 attempt 范围读取必要历史 | 原完整对话、投影、reasoning、D1 answer 与请求字节不变；额外读取全计成本 |
| D2 资格 | 对完整 attempt 调用原审定函数 | 首版仍物化当前单 attempt，复用同一资格规则 | 不先重写成简化 hash 检查；当前 attempt 的内存也必须证明 |
| 外部结果文件 | JSON.stringify(value,null,2) | JSON.stringify(value) + LF，新编码版本 | 完整字段/值/顺序保留，不承诺与旧 pretty 文件字节相同 |
| 全批导出/报告 | 可能整批 snapshot/rows/stringify | 按 attempt/row 消费及增量写出完整派生文档 | 不删除任何结果；完整旧对象的内存 API 不再是新路径契约 |
| 权威 journal | 原 v4 逐记录 JSONL/hash/flush | 不改 | 不移除 Base64，不合并 read、record、append、flush 或审计 |
| 门槛资格 | 原 candidate/v4 替换门槛 | §8 提出需另批的前瞻适用规则 | 新实现不能冒充原基线；原门槛适用时明确不通过 |

即使文件格式仍是 JSONL，也必须为新 reader/外部编码/consumer 绑定单独版本。
新版本不得恢复旧 halted 批次；没有“读取旧证据成功就自动取得新采集权限”。

## 4. 全历史物化候选：完整检查不等于完整驻留

### 4.1 完整扫描与摘要

每个原来会触发完整审计的边界，分别执行：

`锁与 manifest/head 校验 -> 有界读取全部 JSONL -> 每事件校验/状态重放 -> 发布审计绑定`

1. 文件读取块建议 64 KiB，仅是待批文件 I/O 参数，不是网络 Q。跨块 UTF-8/换行
   处理必须保持旧解析语义；不把输入 read 与账本记录边界混淆。
2. 完整校验每条记录的字段、seq/previous/digest、Base64、payload SHA、coordinate、
   channel 累计、时间单调、成本、唯一性、单 in-flight、settlement、halted 和 head。
   全扫描过程中不能因“已经验证过”跳过旧 payload。
3. 由于只有一个 in-flight，当前 attempt 的记录连续；保留它的完整 chunks 至结算
   资格处理完毕，再释放。已完成 attempt 只保留有界 scalar summary 与 range anchors。
   是否连续必须由重放验证，不靠 schedule 的表面顺序假定。
4. 摘要至少含 coordinate/attemptId、请求/答案 hash、model 长度与 hash、各通道长度、
   settlement、预算所需字段、字节范围、范围前后链头。不得将任意 usage/原文/完整
   terminal 或 per-read offset 数组塞进“摘要”，使它重新随历史字节膨胀。
5. D1 答案摘要由本次扫描的原 model 字节累计得到；D2 审查使用当前完整 attempt
   调用与原 `auditDiagnosticCensor` 相同的规则。raw/delivery 一一对应、位置、
   generation/cleanup 顺序、decoder snapshot、usage/hash 全部检查，不能少做。
6. 无完整成功审计，不发布 summary、读取能力或下一坐标；不自动修补 partial tail。
   已确认前缀、失败状态和错误优先级保持原义；恢复不得重发已预留坐标。

原 capture 缓存若保留，其可信条件及失效行为必须等价；缓存只保留当前 attempt
和必要摘要，不能积累所有历史 chunks。不能为了限制内存随意删除 checkpoint。

### 4.2 研究内部接口候选

以下是待证接口，不是本轮代码变更或正式 ACMI Contract：

- `auditFullHistory()`：返回只读 bounded summary 和进程内不可伪造的审计绑定。
  绑定至少包含 manifest/source/profile 身份、文件身份、head/seq、已知 checkpoint
  及每 attempt 的范围锚点。它不是可持久化后直接信任的 index。
- `readAuditedAttempt(binding, id, selection)`：从已经审计的范围读取请求的完整字段，
  验证范围链头/摘要与文件版本绑定；selection 只能是已声明 consumer 所需的字段集合。
  不接受调用者自造 offset、hash 或未经审计的 summary。
- `iterateAuditedAttempts(binding)`：按原顺序提供完整逻辑 attempt 视图，一次最多一个；
  用于恢复检查、派生导出和未来 importer 的兼容层，不返回全批 chunks 数组。

选择性重读不能仅依赖文件大小/mtime。优先在同一锁及文件身份约束下完成审计和
消费；若必须跨锁，重验审计绑定及所读范围的链锚点，不匹配则按完整性失败停止，
不得退回未验证缓存。原威胁范围内的路径替换、截短、rollback 和等长篡改都需向量。
原来相邻两次同 head 的完整审计仍各做一次，不以绑定复用为由消除边界。

旧 `snapshot()` 不改成偷偷返回少字段的对象。旧工具和旧版本保留原路径；新运行
路径的消费者必须显式迁移到新接口，且不能在正常/错误/恢复路径回退到全批物化。
兼容承诺是完整逻辑视图、输入和行为等价，不是返回对象图的内存形状等价。

### 4.3 不是只改一个 reader

发送前核验、next/eligible、D1/D2、CLOSED-LOOP 输入、settlement 后检查、恢复、
最终导出/import/report 都必须列入调用图。尤其：

- CLOSED-LOOP 仍使用同 family/condition/arm/track 的真实历史、原 source IDs 和
  projection；不能用摘要代替模型看到的原始对话，不能只取最近一条任务状态。
- 选择性读取后仍用原编译规则生成同样的 request bytes。必要历史同时驻留的上界
  从冻结语料/计划推导，不能从当前仅运行 35 次的实际历史外推。
- 全批派生报告可逐行对象输出，但所有原字段、rows、分组及分母仍须保留；不能
  删除 usage、未评分项或失败条目。聚合状态/分位数数组也需列入资源表。
- Evaluator 的规则和 oracle 不改；未来 importer 适配属于需要单独批准的机械
  兼容工作。本轮不调用它，不用新 reader 对历史模型输出重新评分。

首版保留单 attempt 完整物化是缩小证明风险的选择，不是宣称单 attempt 很小。
若其最坏驻留仍不可承担，ME-1 在此范围退出；不自动升级为 D2 增量解析或磁盘索引。

## 5. 外部证据编码候选：无损而非删字段

### 5.1 两层权威与新编码

- **原始权威层不动：** 原始请求/交付/派生 channel 字节、控制记录、terminal、
  ledger 事件及 hash 链按原格式完整保存。新客户端本身若改变实际交付域，须另批。
- **外部派生层新版本：** 新 result 文件内容为 `JSON.stringify(summary)+'\n'`，
  不设置 replacer，不筛 usage，不排序或改写字段，不压缩、不归一化正文。
  保留现有 stdout 完整 summary；若捕获其日志，这份副本独立计入 X。

只删除 JSON token 之间由 pretty printer 添加的缩进/空白；字符串值内部的空格、
换行和 Unicode 一字不改。不得以“语义相同”为理由重写 A/B marker 或原 SSE。
新外部文件的 digest 按新字节独立登记；与旧文件不同是显式预期，不是 hash 验证豁免。

### 5.2 精确等价标准

对于同一完整 summary 对象 S，先把旧 pretty serializer 的有效对象域固定下来，
证明 `parse(encode_new(S))` 与 `parse(encode_old(S))` 递归相等：字段存在性、数组
次序、数字、null、布尔、字符串 UTF-16 内容均相同。不能把 undefined/missing/null
混同；不得扩大成任意 JS 对象、getter、循环引用或非有限数字的无条件编码承诺。
数字规范化、负零、孤立代理项和 JSON 转义必须按现有 serializer 语义保留。

若做大批派生 JSON 文档的增量写出，目标字节定义为原完整文档的紧凑序列化，而非
改成省略字段的 NDJSON。允许分块输出相同完整字节序列，但必须证明逗号/括号、
字段顺序、错误处理和最终完整性。不得为了 JSON 文件语法合法而补全截断结果。
每个文件的完成标记/持久化证据需准确；未写完的文件保留为 incomplete，不替代权威
账本。分块写入的所有操作、flush 和字节成本独立计入，不能藏在 journal 指标之外。

J1 的 600157 B usage 事件在紧凑编码下不再因每元素缩进放大到 20702334 B；这是
消除特定反例的理由，**不是所有终态/结果都能放入 16 MiB 的证明**。未知扩展字段、
数字规范化、嵌套、文件副本及错误描述仍必须给出全域上界。

## 6. 等价性证明与否决向量

区分四种关系，不能只做一个最终 JSON 比较：

| 层次 | 必须等价的内容 | 允许的差异 |
| --- | --- | --- |
| 权威字节 | 给定同一事件/时间输入时 journal、capture、raw 分片、hash/顺序 | 无；不改原 writer 的逻辑与物理事件数 |
| 状态与决策 | 每一前缀的预算、in-flight、halted、D1/D2、checkpoint、下一坐标 | summary/按需视图的对象布局不同；不能改变允许继续的判定 |
| 模型输入 | packet 对话、source IDs、C1 投影、reasoning、D answer、最终 request bytes | 无；不允许 summary/截断/重排代替历史 |
| 外部表示 | 所有原字段和值、事件/row 顺序、完整性/失败事实 | 新派生 JSON 的 token 间空白及相应新 hash；必须有新 profile |

字节差分的前提是相同 manifest/hash 起点、事件与时钟输入；它用于证明 writer 没被
改变，不要求未来真实新版本沿用旧冻结身份。未来新 manifest/source/profile 和路由
身份导致的差异必须逐项声明，不伪装成旧批次，也不通过宽泛的字段忽略规则掩盖
payload 差异。模型请求正文等价另以同一完整编译输入验证，不混同为跨批所有头相同。

证明主线：对原始事件前缀归纳，保留一个抽象关系 `logicalView(newState)=oldState`。
每次 reserve/capture/settle 校验、预算变化与错误继续性保持；选择性重读提供旧消费者
真正需要的同一数据，而不是拿较小输出和旧全 snapshot 做不等工作量比较。

参考只能是已钉住的原 v4 及其已声明 adapter；v6 不作为“原 v4”。原实现无法处理
超过字符串上限的全批见证时，以小域差分加前缀归纳/解析与状态规则证明扩展，不能
把原实现不能运行的大域结果填成通过。大域恢复正确性仍需以后独立非计时验证。

必须覆盖的未来离线向量（本轮不执行）：

- JSONL 在每种关键边界跨块，UTF-8 多字节、CR/LF、空行、末尾缺 LF、短读/短写；
  Base64 padding、错误摘要/seq/previous、重复 reserve、settled 后 capture。
- 逐记录耐久确认之间的所有 crash-prefix，partial tail、未知 flush、锁/路径变化、
  rollback、同长度篡改、过期/伪造审计绑定、读取过程中追加或替换。
- D1 answer hash 与字节绑定；D2 每个资格谓词的单变量反例；cleanup wire 不得被
  当作成功正文；早期已 censor 的 attempt 在之后每次全审计仍重新审查。
- CLOSED-LOOP 隔多轮恢复、C2/C3 输入边界、旧状态与新证据冲突；仅比较冻结请求
  构造规则和完整数据，不用新评分器或修改 oracle 来制造等价。
- J1 两个见证：全批 raw 下界超过字符串限制；usage 深层数组 pretty 膨胀。
  还要测数字规范化、escaped key、代理项、未知 usage、sourceMap/projection 重复。
- 原全批 snapshot、JSON.stringify 全批 rows、隐藏 cache 累积等回退路径的静态
  禁用检查；单 attempt/D2/导出损坏，结果写失败与 stdout 失败全部保留。

**解析域不可偷换：** 原 ledger 使用 JSON.parse，不等于模型 SSE 的 strictJson。
不能自动引入新的 duplicate-key/空白拒绝规则。记录上界必须覆盖约定有效域；若有
原 reader 接受而新 reader 因行长/缓冲拒绝的有效记录，必须登记差异并阻止等价通过。
仅证明当前 writer 的紧凑记录有界，不证明任意非规范旧文件都兼容；若需缩小读取域
或使用真正流式 token parser，须另报支持域和实现复杂度，不隐式增加停止规则。
旧证据不会为适配新 reader 而被格式化或改写。

## 7. 容量证明：从记录到完整 576 槽位

### 7.1 需闭合的变量

| 变量/集合 | 必须提供的证明 |
| --- | --- |
| 客户端 W/Q/F/N、头与空交付 | 精确版本的分配前保证及另行批准的域；ME-1 不补足 J1 缺项 |
| C_pre/C_request/C_response/C_terminal | 全字段、字符串转义、usage 扩展、数值规范化、失败描述与副本的 UTF-8 上界 |
| D/E/R/M/H | 复用 J1 已证明的原字段条件；任何字段变化重证，不直接搬结论 |
| R_line | 每逻辑事件外层 JSONL 的完整最大编码，含 Base64 padding、封套与 LF；须远低于运行时单字符串界 |
| A_live | 当前 attempt 全 chunks、解码对象、terminal/D2 parser、hash/Buffer 临时值的同时驻留界 |
| S_entry、H_live | 每 attempt scalar/range summary 上界；选中闭环历史、packet、编译请求的最大同时驻留 |
| X_result/X_stdout/X_diag | 每槽全部外部派生文件/日志，副本单独计，不能移到“共享”逃避 |
| G_shared、G_failure、峰值临时文件 | 共享文件、失败保留、结果写出中间文件及恢复证据；包含同时存在的副本 |
| B_k、R_selected、R_frozen、R_export | 全审计、选择性重读、冻结校验、导出/报告的累计逻辑读取量及操作数 |

16 MiB capture 的完整 Base64 约需 22.37 MB，说明“单条有界”与“整批有界”是两回事；
实际 R_line 必须按全部事件证明，不能先写一个 24 MiB 行长阈值再把拒绝当作证明。
如果单条/control 仍触及运行时字符串或内存上限，本候选失败；不自动分拆原 capture。

### 7.2 统一字节公式

保留 DC-EC-1 中尚未批准的交付域作为**条件变量**，而非已开启配置：

```text
B_raw <= W + 2Q
T     <= (N+2)*M + C_pre + C_request + C_response + C_terminal
L     <= 6 + 2*(N+2) + E                 # 仅原事件集合成立时
P     <= B_raw + T + D + R
J_journal <= 4*ceil((P+2L)/3) + L*H
X_total   = X_result + X_stdout + X_diag + X_other
Disk_peak <= sum_576(J_journal + X_total) + G_shared + G_failure + G_temp
```

所有 X 都按实际保存副本、文件数与最坏编码证明；新增外部 profile/完成证据也入账。
不沿用失败的 X=16 MiB，不宣称旧 256 MiB/槽或 192 GiB 仍足够，也不自行申请更大
数字。具体资源预算应在 ME-S 给出系数证明后计算，再提交 Owner。

### 7.3 驻留与全批扫描

目标驻留结构为：

`runtime/native + client F + I/O/current-record buffers + current-attempt/D2 live set
 + 576*bounded-summary + selected-history/compiler live set + serializer/report live set`。

这是对象存活集合，不是把各文件字节相加当 RSS。还需给出 GC、字符串/Buffer 副本、
旧新 cache 交换及错误处理期间的峰值；不使用任意 6*J 倍率。M_current 可以很大，
不得因其不随“历史槽位数”增长就称已可承担。没有证明就不给 RSS 通过值。

全扫描成本仍至少是 `sum(B_k)`，还要加 R_selected/R_frozen/R_export。J1 对理想
576 槽位的六边界/3459 次 replay 和约 1296.752 GiB 原始 Base64 扫描义务继续有效
作为原驱动的条件下界，**不是本候选的实际读量上界或速度承诺**。新 range 读取、
D2 物化和导出不能移出计量区间；如果完整扫描累计成本不可承受，应报告不可行。
不合并边界、不改增量审计、不分批删历史、不降低 576 负载来完成预算。

## 8. 原门槛适用范围：必须显式决议

### 8.1 无条件保留

| 门槛/约束 | ME-1 中的处理 |
| --- | --- |
| 研究完整性、R2 归属/SM/正文/流式/Token/延迟/统计门槛 | 全部不变；工程正确性或容量通过不等于研究 GO |
| 正确性、恢复、raw-first、全审计、原输入等价 | 硬否决；不能用速度抵消差异或证据丢失 |
| 原 v5/v6 的候选验收及 P-L/P-H/P-G 结果 | 原值、原分母、原失败保留；不以 ME-1 结果回填 |
| 客户端、完整容量、绝对资源与逐批授权 | 任何未来采集路径都必须满足，没有基线豁免 |
| capture 五对中位耗时比 <=0.80 | 如进入本候选成本验收，保留原门槛/原对照/固定负载，不承诺可通过 |
| read p99、完整关键审计/RSS 每组比 <=1.25 | 保留全部原成本和分母；选择性读取、D2、必要物化都计入 |

ME-1 确实改变了 R-A 类型的实现，不是原 v4 本体，不能直接援引 S2 的“基线不比
自身改善”取得资格。文件格式相同或称为容量修复都不足以改变适用门槛。

### 8.2 计数门槛的两个互斥决议

**路径 G0：不改变原候选门槛适用范围。**

ME-1 保留原每事件 append/flush，固定 P-G 仍应为 **620 -> 620，改善 0%**，不是
已测结果，而是保留写路径的设计预测。原要求至少 30% 即最多 434；ME-1 不提供
通过路径。保持阻塞，不运行计数优化或为获取曲线启动性能系列。

**路径 G1：Owner 另行批准限定的、前瞻的容量修订准入契约。**

申请仅对“保持原 v4 逐事件 writer、只改全历史驻留/无损派生编码”的 ME-1，
不以 >=30% 写调用改善作为它的准入要求，改要求固定负载的 journal append/flush
及耐久边界**与原 v4 精确相同**，外部文件操作另行完整报告。所有其余原正确性/
时间/RSS/研究门槛仍保留。越过这个范围（合并提交、改 journal、删扫描、缩负载）
就失去该有限资格，不能继承它给 v6 或其他优化候选。

**这确实是门槛适用性/准入契约的变化，不是证明原 30% 已满足，也不是语义重命名。**
Owner 本次要求提案不等于批准 G1。在单独明确决定前按 G0 处理，不进入采集。
原 v6 P-G FAIL 永远不变；不得把新结果写进原表、把 P-G 判 N/A 或平均其他层抵消。

G1 即使获准，也不解除 capture<=0.80 等剩余失败风险。若它们不能满足，不另行
改宽或剔除慢组；按实际结果不准入。固定三层原 v4 可运行负载上的相对验收，
与原 v4 因字符串限制无法完成的 576 全域容量证明分别报告；后者不能伪造比值。

推荐先审议是否接受 G1 这种明确、窄范围的前瞻修订。若不接受，保存本方案为
结构性结论即可，无须继续实现。任何路径都不重启原 P-G 计数优化。

## 9. 文件边界与分阶段批准

以下仅为将来实现的范围地图，不是执行命令或当前接口变更：

| 拟议文件/模块 | 职责与不可越界事项 |
| --- | --- |
| 新 `research/phase-0.9.19/gate2/history-materialization.mjs` | 逐记录 JSONL 完整审计、scalar summaries、审计绑定/range 读取；不引用 v6 事务作为默认格式 |
| 新 `research/phase-0.9.19/gate2/evidence-encoding.mjs` | 外部派生紧凑编码 profile；不改 raw、marker、journal 或 terminal |
| `gate2/run-ledger.mjs` | 将来版本分派及有界当前 cache；原 writer/旧路径保留，默认不启用新路径 |
| `gate2/send-boundary.mjs` | 显式使用审计/选定历史接口；原编译输入、停止/发送屏障不变 |
| `execution/live.mjs`、`execution/report.mjs` | 将来按新 profile 写出/消费派生结果；本轮不执行、不连接服务、不重评分 |
| 新离线 tests / proof manifests | 原 reader 差分、前缀与故障、编码边界、完整计量和容量证明；与真实研究证据隔离 |

具体 parser、summary 字段、所有 caller 的接口清单及兼容策略须先在 ME-S 固定。
若旧原生 JSON.parse 语义无法在选定有界策略下保留，就停下报告，不临场扩展算法。

### ME-S：下一步最多申请的静态证明细化

- [ ] 固定 JSONL 有效读取域、完整 caller 图、摘要/锚点/单 attempt/D2 的逐字段合同。
- [ ] 给出前缀归纳关系与单 attempt 原 D2 规则复用证明，核对所有错误路径。
- [ ] 给出紧凑输出的等价域、控制/外部全字段编码界、576 槽位联合资源预算。
- [ ] 列出客户端依赖及 G0/G1 决议，不把未知项填为 PASS；无法闭合则明确退出。

ME-S 本身也须另获授权；不运行回放、性能系列或新模型。

### ME-I：以后另批的离线实现和非计时验证

只有 ME-S、适用契约和准确范围获认可才申请。验证 §6 全向量及有界完整负载，
在独立派生目录保留所有失败，不改原计数/原评分。不能仅跑小样本就称容量通过。

### ME-P：以后另批的资源与适用成本验收

精确实现/预算/操作表/全部 read 分母/测量桥接与 supervisor 齐备后另报。保持原
固定负载与数值门槛；不重新执行已关闭的 v6 计数优化。完整外部编码/导出成本
纳入同一实作计量边界，不能把必要工作移到测量前后。

### ME-L：最后才可能申请冻结与新增研究采集

交付域、容量、等价性、适用验收、资源、研究前缀版本及单独 Owner 授权全部闭合
后再提。旧冻结材料只作为原字节输入；新运行身份与新外部编码不得冒充历史版本。
不得续跑 r4、补 541 槽位或用新环境替换旧失败分数。

## 10. Review Focus 与本轮交付

本方案自查五个高风险点：

1. 只流式读取却在 cache/snapshot/report 再次全批物化：由 §4.3/§6 调用图和回退检查覆盖。
2. 只核验 digest、不重新读取 payload 或 D2 原资格：由 §4.1/§6 前缀及单变量故障覆盖。
3. 为满足 X 删除 usage 或改变值：由 §5/§6 编码逐字段等价和 J1 见证覆盖。
4. 本次审计与按需读取之间失去文件/链头绑定：由 §4.2/§6 替换/rollback 向量覆盖。
5. 把新实现改名为基线以绕过原计数门槛：由 §8 G0/G1 显式决议覆盖；未决时不准入。

本轮只新增此方案与状态入口；没有实现、回放、Evaluator、压力测试、性能系列、
研究重新冻结或模型调用。候选数值未启用，J1 结论和旧失败不覆盖，main 不改。
来源摘要、原证据保护及文档检查保存于：
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-history-encoding-proposal-20261115/`。

请 Owner 分开审核：物化约束改变、外部编码字节改变、等价/容量证明义务，以及
G0/G1 适用范围。即使认可方案，也建议只另批 ME-S；ME-I/ME-P/ME-L 不自动授权。
