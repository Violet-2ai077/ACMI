# ME-S 静态证明、完整编码台账与 576 槽位资源预算

日期：2026-11-15。状态：**STATIC_REFINEMENT_DELIVERED / FULL_PROOF_NOT_CLOSED / G0_BLOCKED**。

Owner 认可 ME-1 方向，仅批准 ME-S；**G1 未获批准**。本轮不是实现、性能验收、
重冻结或模型批次。前置 [ME-1 方案](../../../docs/superpowers/plans/2026-11-15-history-materialization-evidence-encoding-proposal.md)
与 [J1 原结论](j1-static-proof-results-2026-11-15.md) 原字节保留。
配套交付：[静态接口及等价性合同](me-s-interface-contract-2026-11-15.md)。

## 1. 结论：补出了什么，仍不能证明什么

1. 已固定全审计 lease、逐 attempt/选择性读取、摘要字段、D2 复用方式及完整消费者
   表，给出 reserve/capture/settle 的前缀归纳关系。不是未实现代码的正确性 PASS。
2. 已证明适用纯 JSON 数据域的紧凑重编码保守界 `<=6*源 JSON 字节`；覆盖数字规范化，
   不能错误地假设 parse/stringify 不增加字节。
3. 固定语料静态盘点：6 families、各 8 turns；单次输入消息数保守最多 18，闭环
   先前 attempt 最多 7。由发送前 I=131072 B 检查推导 pre_send 完整编码的保守界。
4. 在未批准的 Q/N/头域前提及原字段集合下，已算出**无错误核心档案子项**：
   journal + compact result + 一份捕获 stdout，576 槽位上界约 **86.3225 GiB**。
   它不是整个研究的总容量；没有替代 192 GiB 或提出新获准配置。
5. 发现必须明确保留的阻塞：原 reader 的非规范 JSON 接受域、适配器错误文本界、
   完整评测报告/诊断/临时副本、stdout 队列、真实对象驻留与客户端保证。不得把这些
   项按零计入后声称“完整预算已闭合”。
6. G0 下原写路径的计数仍不提供 >=30% 改善。G1 未批准，不进入 ME-I 或采集；
   本轮没有执行 P-G，也没有更改原 **620->496、20%、FAIL**。

本轮完成的是静态接口、条件定理及资源台账；**未获得全读取域等价证书或全错误域、
全输出链路的容量证书**。下文具体列出反例和缺失项，而不是用“等实现后再说”替代。

## 2. 方法与事实基线

只读源码、冻结文件结构和既有证据；使用小整数、极小 JSON 例子及公开语言规范。
没有导入/调用研究 decoder、ledger、Harness、评分器或模型，也没有生成大见证。
本轮未运行回放、压力负载、故障测试或性能系列；文档 lint 不属于研究测试。

静态盘点的冻结 public 文件为 566405 B，runtime 文件为 3645 B；endpoint 的 JSON
编码长度为 54 B，只记录长度/摘要，不复制凭据。原 W=1048576、I=131072、576 槽位
保持不变。当前客户端未因此获得 Q/F/头界；原 live 存储限制也没有改变。

## 3. 等价性：条件证明与一个确定的未覆盖域

### 3.1 已完成的算法级关系

定义原前缀重放 O(p)，新 summary + 当前完整 attempt + 经审计 range 为 N(p)。
按范围逐项展开、去掉内部辅助字段的 V(N,p) 必须等于 O(p)。

- reserve：保留坐标 hash/唯一性/预算/单 in-flight，D1 摘要由本次读取字节产生，
  因此与原 concat 后 hash 等价；非空和成功结算条件不省略。
- capture：仅当前 attempt 接受记录；原字节、时间、channel 与累计量逐条验证。
  保留完整当前 chunks，故后续依赖它的检查不变。
- settle：先做原 outcome/cost/D2 全部判定，再将已验证当前对象换成摘要；下一
  reserve 的可执行条件相同。后续全扫描必须再次重建并验证历史 censor。
- 读取/上下文：只在同次全审计的锁与文件身份约束下使用 range；按原顺序展开
  同样的对话/控制字段，并使用原编译规则，不用摘要替代文本。

该归纳依赖**记录解码、原校验顺序、head/锁和失败语义保持**。它不证明尚未实现
的解析器或所有调用者已做到这一点。数字聚合必须保持原操作顺序，不能将重新
分组浮点累加当成逐值等价。接口合同列出了每个调用点及所有权边界。

### 3.2 新反例：不能用紧凑 writer 上界直接限制 reader

取任意原 v4 已验证的短 JSONL 记录，在该行 JSON 前插入 **32 MiB 空格**：

- 文件仍以 LF 结尾，JSON.parse 接受前导空白；解析对象和属性顺序不变。
- 原 digest 对解析后 body 的 JSON.stringify 求 hash，因此该变换不改变逻辑链。
- 稳定文件在审计前后 fingerprint 相同，已知 seq/digest checkpoint 也不变。
- 对短原文件而言，新增文本仍远小于 J1 的单字符串限制；这个构造在语法、摘要
  和状态规则上没有给原 v4 增加拒绝理由。

若新 reader 把后文 8935558 B 的正常记录编码界直接当成行长拒绝阈值，会拒绝这个
旧 reader 接受的记录。没有构造/写入这 32 MiB 数据，也没有执行原 reader；这是
由原 JSON.parse/hash/fingerprint 分支直接导出的接受域反例。

进一步，重复 key 采用 JSON.parse 的最后值语义、转义 spelling、非规范空白均需
独立处理。仅删除空白也不是可直接实施的修复：必须保持 token 边界和原语法错误，
不能把原本非法的 `1 2` 合并成 `12`；重复 key 等仍未解决。

因此本轮**不选择“累计至正常 R_line 后报错”作为合格解析器**，也不自动声明
所有非规范文件都属于已允许拒绝的篡改。完整 D-READER 等价仍缺一份具体有界
解析方案；改读取域必须另案审批，旧证据不能为此被格式化。这不撤销 D-WRITER
上的前缀条件定理，但阻止将它宣传为全域实现资格。

## 4. 紧凑 JSON 的编码引理

### 4.1 6 倍界的适用域与证明

令 t 是现有 SSE strictJson 接受的一个完整 JSON 值：没有重复 key、非有限数、
函数、getter、循环引用或自定义 callable toJSON；其纯数据复制仍在同一域。

- JSON string/key：未转义 UTF-8 保持；必要控制字符、引号、反斜线和孤立代理项
  的输出编码不长于其合法原 token；不对字符串内部空白做格式化。
- 标点和布尔/null：紧凑输出不增加 token 长度，输入中的格式空白可以消失。
- 有限 binary64 数字的最短十进制至多 17 位有效数字。按固定/指数格式及符号，
  序列化文本至多 25 B。源数字 token 长度 >=5 时，25<=6*length；长度 1/2 的
  合法值不增长，长度 3 的指数形式最多展开到 10 B，长度 4 至多需 24 B 的保守界。
  因而每个数字 token 的规范化长度也不超过原长度六倍。

逐 token 相加得到 `bytes(JSON.stringify(JSON.parse(t))) <= 6*bytes(t)`。
`1e20` 从 4 B 变 21 B 是必须覆盖的例子；本轮小例子不是枚举全部浮点数的测试。
语言依据：[Number::toString](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-tostring)、
[JSON 序列化规则](https://tc39.es/ecma262/multipage/structured-data.html#sec-json.stringify)。
6 倍界是本报告的保守推导，不是规范给出的一个容量配置。

新旧外部编码对同一纯数据对象只改变 JSON token 间格式空白，故 parse 后字段、
数组顺序和值相同。这里比较的是两次 serializer 的结果，不声称负零经 JSON 还原
后保持负零，也不把 missing、undefined、null 混为一谈；必须沿原 serializer 规则。

### 4.2 从 wire 到终态不能重复计同一源片段

设 U 为接受的 usage 对象在原事件中的字节数，V 为已经发出的 content/reasoning
字符串 token 所占原字节。这两者源区间不重叠，且均来自通过 W 检查的 decoder
前缀，故 U+V<=W。concat 后的两段字符串紧凑编码不比原分段 token 总量更大，
usage 规范化则 <=6U。因此终态这部分 `<=6U+V<=6W`，不是错误地给它们各分配 W。

id/model 最多各 256 个 UTF-16 code units；两个 JSON string 保守合计 <=3076 B，
由下文固定 K 覆盖。无副本删除；terminal/result 中需要保存的副本分别计入。

## 5. 完整编码台账

令 Hh 为客户端**整个头域已经证明**的原始字节界；目前没有这种已合格客户端，
65536 仅用于条件算术。令 e 为一次尝试所有非固定错误码字符串的 JSON token 总
字节数（含必要引号/转义），不是本轮新增错误文本上限。逗号和 errors/error_code/
stop_cause 重复保存保守使用 4e。额外 accounting/诊断/receipt 不藏在固定 K 内。

### 5.1 当前字段集合的上界

| 项目 | 完整上界 | 适用理由/条件 |
| --- | --- | --- |
| reserve 请求副本 | I=131072 B | 发送前已有检查；底层 1 MiB 较松，不必在这个冻结路径重复使用 |
| pre_send | 2I + 566405 + 16384 = 844933 B | messages 与 sourceMap 双份；catalog/active/projection 已进入请求；剩余固定语料字段和封套另计 |
| request 控制 | 16384 B | endpoint JSON 54 B，两个固定路由头、两个 hash、kind/时间/键名远低于此值；不含已在 reserve 的正文 |
| response 控制 | 6Hh + 1024 B | content-type/encoding 源于不同头值；转义和字段封套完整计入 |
| terminal 控制 | 6W + 6Hh + 4e + 16384 B | usage/两种文本的联合源界；mime、错误重复、identity、时钟和所有固定字段 |
| compact result 文件（含 LF） | Z=6W + 6Hh + 4e + 16384 B | 保留完整原 summary/termination/protocol revision；不用删 usage 达标 |
| 完整 stdout 的一份捕获 | Z | 独立副本；文件容量与进程中尚未 drain 的队列另外区分 |
| wire_delivery M | 203 B | 沿 J1 原字段、N/Q/数字位数前提；没有新增 metadata 字段 |
| 非 payload 封套 H | 814 B | 沿 J1 原三种逻辑事件最大值；含 LF/键名/hash，非 v6 封套 |
| 派生 D/E | W / floor(W/12)=87381 | 沿原 decoder；不包括 report 的再次编码与扩展结果 |

pre_send 的 2I 不是用请求字节盲目代替整个 packet：请求已包含同一消息内容及
source_ids、C1 catalog/active/projection，metadata 还再包成字符串，故这些数据在
packet 中的两份至多由 2I 覆盖。未发送的字段以完整 public 文件大小覆盖一次，
其余 wrapper 以 K=16384 覆盖；消息最多 18，UUID 槽固定 4，hash/路由字段固定。
这个界只在 prepare 已通过 I 检查后有效；**不能倒推检查之前编译峰值有界于 I**。

terminal/result 固定 K 覆盖原无 accounting 扩展的字段集：少于 80 个固定字段，
键名各小于 64 B、数值以 32 B 保守覆盖，加固定枚举/协议对象及 identity 字符串。
它是宽松字段上界，不是任意以后新增 diagnostics 的额度。当前协议对象来自已钉住
runtime；引入新的 profile/receipt 必须在剩余项单列，不沿用 K 冒充已证明。

### 5.2 错误域不能设为零

`deadline-transport.mjs` 将适配器的任意 string `error.code` 放入 errors；该接口
没有长度合同，W 不限制它。新客户端尚未选定，不能静态给所有 e 指定有限数值。
这不等于证明本机 native Fetch 实际会产生任意大错误码，而是当前接口不能从
已有证据推出所需界。所有原错误事实必须保留，不能截短/映射掉后说容量闭合。

对完整失败域，后续需提供准确客户端错误集合/每字段界与完整诊断格式；缺少它们
时保留 e 和诊断项为未知，不能用“遇到写失败就停止”代替完整档案证明。

### 5.3 评测报告不是一个普通 result 文件

原 report 同时保留 `row.transport.usage` 与 `row.score.usage`，还包含 parser_errors、
identity_observations、task_identity_records、state 和各组结果。仅 usage 这一成分
就需计入最多 `576*2*6W = 7247757312 B` 的条件上界，不能只算一份，也不能将结果
报告当作每槽 Z 的重复使用。其他字段须另算，不能把这 6.75 GiB 称为完整报告界。

无效 marker 会产生动态 schema 错误路径，合法输出又会产生身份记录等扩展结果；
这些不是源 JSON 的一比一复制，**6 倍引理不能直接套到 Evaluator 生成的整个报告**。
本轮读取源码确定了这一遗漏，未执行评分器或新评旧输出。完整报告/错误路径扩展、
完整导出 receipt、共享/失败/临时副本仍缺全字段上界，下面显式保留其预算项。

## 6. 576 槽位：数值子项与不能消失的剩余项

### 6.1 条件核心算术（不是配置或容量 PASS）

仅用于检查以下假设同时成立时的编码：原字段集、无 accounting 扩展、已证明的
Q=65536/N=32768/Hh=65536、e=0，以及 result + 一份完整 stdout 捕获。N/Hh/Q 仍未批准。

```text
C_sum     = 7,956,613 B
T         = (N+2)*203 + C_sum            = 14,608,923 B
L         = 6 + 2*(N+2) + 87381          = 152,927 records
P         = (W+2Q) + T + W + I          = 16,968,219 B
B64       = 4*ceil((P+2L)/3)             = 23,032,100 B
J_journal = B64 + L*814                  = 147,514,678 B
Z         = 6W + 6Hh + 16384             = 6,701,056 B
Core      = J_journal + 2Z               = 160,916,790 B / slot
576*Core                                = 92,688,071,040 B
                                        = 86.3224929571 GiB
```

这些独立最坏值未必同时可达，但相加仍是该条件域的保守子项上界。它们不是历史
实际占用，没有降低原门槛。每槽 control/metadata 的这个界已经超过现行 transport
4 MiB，故也不能用“新证明”让未修改的 live 存储自动合格。

同一条件下最大正常记录编码的保守界是 `4*ceil(6701056/3)+814 = 8935558 B`。
它低于单字符串极限，但只能说明正常 writer 的单记录表示不再需要整批字符串；
**不是批准新行长限制**，也不覆盖 §3.2 的旧 reader 非规范接受域。

### 6.2 完整预算方程与缺口

对每个 attempt i 使用其有证上界 e_i：

```text
J_i <= 4*ceil((16,968,219 + 4e_i + 2L)/3) + L*814
X_i <= 2*(6,701,056 + 4e_i) + ExtraDiagnostics_i + ExtraArtifacts_i

Disk_peak <= sum_576(J_i + X_i)
             + CompleteReport + SharedSourceAndFreezeCopies
             + FailureRetention + SimultaneousTemporaryCopies
```

CompleteReport 包括上节双份 usage 以及全部其他评分/错误/汇总字段；临时导出若和
最终文件同时存在，二者都计入。共享源码/冻结引用即使已在别处保存也要区分此次
是否物理复制。旧证据占用不算可回收额度。本轮没有预留磁盘或查询 free 值充证明。

以旧“192 GiB 候选”减去上述核心子项，算术余量为 113470359168 B；**尚无证明
所有剩余项都不超过这个余量**。因此不得恢复“192 GiB 足够”的结论，也不自行
提高到另一个数字。给出遗漏项的明确方程，比把它们记 0 后给一个假总额更严格。

### 6.3 驻留预算与 stdout 风险

- 摘要固定结构的极小编码核算为 <=1430 B（已用扩大数字占位符），设计保守界
  4096 B/项、576 项 2359296 B。只证明序列化字段量，不是 V8 对象量。
- 当前单 attempt 最多 L-2 个 capture；本轮条件核心 journal 界约 140.681 MiB。
  当前完整对象、解析临时 frame、Base64 Buffer、D2 重建、旧新 cache、克隆同时
  存活的份数必须按生命周期分别列出，不能用一个任意的文件字节倍数代替。
- 选择的先前闭环历史最多 7 项，model+reasoning 原字节合计 <=7340032 B。
  projection、sourceMap、UTF-16/JSON 转义及编译中间值另计；检查前的峰值不受 I 保证。
- **stdout 并未等待 drain。** 保留现驱动时，最坏必须考虑多槽输出排队，而非假定
  只有一槽 Z。在 e=0 子域，仅 `576*Z=3859808256 B` 的编码队列量也必须入账，
  尚未包含编码副本/native queue 开销。具体输出宿主可能同步或异步，须准确绑定。

完整 RSS 方程必须包含 runtime/native、client F、I/O/current record、当前 attempt/
D2、cache 交换、576 摘要、必要历史/编译、单 row 评分/导出、stdout queue、异常与
GC 保留集合。对象数与 V8 布局/释放行为、native F 仍未证明，故**不给 RSS 通过值**。
改成 await drain 或新增超时会改变驱动/时序契约，本轮不暗改，也不自动批准。

### 6.4 累计审计与读取成本

保留原正常驱动的 6 次/槽 + 3 个固定边界，即 3459 次 ledger 全审计；另有 1153
次 verify 调用及内部文件读取，不能用它们的调用数冒充字节分母。

对上面相同单槽 J_journal 上界，考虑三次前历史扫描、三次最多包含当前槽的扫描、
两次尾部全历史扫描；用更保守的 `J*(6*n*(n-1)/2+6*n)` 得
**147080394787968 B，约 133.76884 TiB** 的正常路径 journal 逻辑扫描上界。
该上界只在上述编码域成立；不是下界、实际 I/O 或已测耗时，不能据它断言超时。

完整读取预算还要加：每槽 prepare 至多 7 个 dialogue 范围、发送前当前控制范围，
冻结文件验证、全部导出/report 及任何辅助文件重读。保守可先以 8*n*J 覆盖正常
发送路径的范围读取，再逐调用点收紧；报告路径的额外轮次尚须明确，不能漏掉。
J1 约 1296.752 GiB 的 raw-only 条件下界仍保留；两种界的含义不同，不是新性能分数。

## 7. 已闭合、反例与未闭合项台账

| 项 | 本轮结果 | 不能宣称 |
| --- | --- | --- |
| 摘要/lease/消费者/D2 接口 | 已静态细化，配套合同给出字段和调用次序 | 代码已实现或验证过 |
| 状态折叠前缀关系 | 在解码/锁/失败行为等价条件下成立 | 已覆盖全部 reader 接受域 |
| compact JSON 值等价及 6 倍界 | 纯 JSON 域可证明，原字段子项已核算 | 任意 JS 对象/整个评测报告也自动是 6 倍 |
| pre_send 与正常 terminal/result | 在明确请求/头/错误/字段域中有完整保守界 | 当前客户端和所有错误路径已满足该域 |
| 非规范行长 | 明确反例阻止直接套正常 writer 行界 | 新增拒绝规则已经获准 |
| 576 核心档案 | 条件子项 <=86.3225 GiB，完整公式列出余项 | 完整总预算 <=192 GiB |
| RSS/完整报告/输出队列/客户端 | 具体依赖已列，仍未闭合 | 可启用、已取得资源配额、时间必达 |
| G0/P-G | G1 未批准；原 FAIL 保留，不重启优化 | 计数门槛已豁免或新候选已通过 |

剩余静态证明必须拿到：完整有效域的具体解析策略、准确客户端/错误字段合同、
完整派生报告与辅助制品字段量、对象所有权/队列及分配模型。部分运行时资格最后
还需要另批的实现与验证；不能以这些缺项为理由先运行模型探测。

建议 Owner 审核本轮条件证明、接口合同和明确反例；在上述证明缺口及 G0 约束仍在
时，**不申请进入 ME-I、不申请性能或模型运行**，也不把本轮认可当作 G1 批准。

## 8. 证据与本轮边界

独立派生证据目录：
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-me-s-static-proof-20261115/`。

- `frozen-shape-inventory.json`：冻结文件形状/长度盘点，无 Harness 或 oracle 执行。
- `number-encoding-examples.json`：极小数值例子，非穷举或性能测试。
- `interface-shape-arithmetic.json`：固定摘要字段编码核算，不是 heap 证明。
- `conditional-core-budget.json`：带明确排除项的条件子项算术，不是容量证书。
- `source-before.json`、`reviews-before.json`、`source-catalog.json`：原文件摘要与定位。
- `review-verification.json`、lint/diff 日志：实际保护核验；不修改原评价结果。

本轮只新增两份静态文档和状态入口；实现、冻结材料、原分数、计划、旧提案与历史
证据保持原位，live 1 MiB/P-G FAIL 不变。main 不改，无提交/push；提交报告后等待审核。
