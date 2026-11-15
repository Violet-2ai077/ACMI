# J1 静态证明：交付契约、完整编码与 576 槽位成本

日期：2026-11-15。状态：**STATIC_REVIEW_COMPLETE / DC-EC-1 BLOCKED / NOT ADMITTED**。

Owner 本轮仅授权 J1 静态细化；不是批准候选配置或 J2 实现。
本报告新增证明，不覆盖 [联合方案](../../../docs/superpowers/plans/2026-11-15-joint-delivery-evidence-capacity-proposal.md)、
S1/S2、原分数或任何验收失败。P-G FAIL 和 live 1 MiB 保持不变。

## 1. 审核结论

DC-EC-1 不能按原定“保留 v4 全历史单字符串物化，仅改交付域与容量”的范围进入 J2。
这不是因为已测性能慢，而是发现两个静态反例，另外还有客户端和控制记录证明缺口：

1. **全批表示不可行。** 当前 Node v24.16.0 的单字符串上限为 536,870,888 个 UTF-16
   code units。v4 每次全审计读取整个 JSONL 为一个字符串。384 个各有 1 MiB raw 的
   槽位，仅 raw Base64 字段下界就达 536,871,936 个 ASCII 字符；无需到 576 槽位，
   也无需耗尽候选 192 GiB 磁盘。增加 RAM 不改变这个运行时表示上限。
2. **外部文件系数 X=16 MiB 不成立。** 当前允许保留的 usage 扩展字段可以使一个
   600,157 B 的 SSE usage 事件，在结果文件的两空格缩进下产生至少 20,702,334 B。
   这已经超过 X，尚未计同一槽位 stdout、其他结果字段和诊断副本。
3. **没有合格交付客户端。** 已核对本机 native Fetch / bundled Undici 7.25.0；
   未获得分配前 Q<=64 KiB、整个协议栈 F<=8 MiB 和完整新增头/编码契约的证明。
   这不是证明所有客户端都不可能，而是本候选当前没有可认证的客户端。
4. **局部有界项可以证明，但不构成容量证书。** D/E/R 和原字段集合下的 M/H 可给
   保守界；C、X 的完整控制/外部证据合同未闭合，其中 X 已有具体反例。

上述结论仅针对工程采集候选与声明的完整支持域。**不能推导模型自主归属 NO-GO**，
也不能把“当前采集不可行”改写为“研究假设已被否定”。S1 的状态维护失败和 C2/C3
覆盖缺口原样保留。本轮未运行模型、Evaluator、回放、压力测试或性能系列。

## 2. 证明对象与边界

静态读取当前工作树源码、既有冻结索引与前序报告；只执行运行时常量读取、内置
客户端源码读取、小整数及极小 JSON 字符串长度计算。没有构造大数组、大字符串、
大 journal 或模拟响应；没有导入并调用研究 transport/decoder/ledger/Evaluator。

本机运行时：Node **v24.16.0**、V8 **13.6.233.17-node.49**、x64、Undici **7.25.0**。
内置 `internal/deps/undici/undici` 源文本 SHA-256：
`3d0666f4a255706b75d1f09f48d385d92e981218c240371bfd10bd1c7e266df5`。
它是本次本机静态观察，不声称已经证明历史运行二进制完全相同。

仍是待证目标而非配置：Q=65536、N=32768、F=8 MiB、capture=16 MiB、transport=64 MiB、
X=16 MiB、单槽 256 MiB、整批磁盘 192 GiB。原 W=1048576、576 槽位及冻结顺序不变。
没有用较小矩阵、重新分片旧证据、提前停盘或较宽门槛替代这些要求。

## 3. 客户端保证核对

| 义务 | 静态证据 | 判断 |
| --- | --- | --- |
| 一个 owned read，cleanup 不另开 read | `deadline-transport.mjs` 的 readPending、cancel、closed 等待及 sealed 保护 | 应用层结构已具备；不等于底层队列有界或 cleanup 必达 |
| 分配前 Q<=64 KiB | 当前 `reader.read()` 返回后才 `Buffer.from(item.value)`；内置 Undici 13579-13604 行从迭代器取值，再 `new Uint8Array(bytes)` 并 enqueue | 没有本候选 Q 的分配前保证；事后切片不成立 |
| F<=8 MiB | Undici 13683、13731、13745 行涉及 Readable、可能的解码 pipeline 和 push；desiredSize 判断发生在 enqueue 之后 | 单一背压阈值不等于 TLS/HTTP/Readable/WebStream/关闭驻留总额；UNKNOWN |
| identity-only | 当前请求未显式要求 identity；响应记录 content-encoding，但无拒绝非 identity 的分支；内置源码创建 gzip/deflate/br/zstd 解码器 | 当前实现不满足候选契约；仅添加请求头仍不能证明拒绝路径和内存界 |
| 头总量<=64 KiB 且<=256 项 | Undici 有 maxHeaderSize 机制；本路径未绑定候选两项约束及其分配前行为 | 不声称当前头完全无界；准确候选保证仍未成立 |
| 无隐式补请求 | 应用固定 POST、`redirect:'error'`，驱动无重试 | 应用层可确认；底层 dispatcher/连接池全部重连和重发路径未完成封闭证明 |
| 真实交付边界、原始证据范围 | 当前边界是 Fetch response.body，不是 TLS packet；raw 在解码前耐久 | 保留；不能将接收后 Q 切片冒充原始 read，不能声称保存未交付缓冲 |

结论为 **NO_QUALIFIED_CLIENT_IN_THIS_REVIEW**。没有安装/选择新库、替换 Fetch、
访问 provider、探测服务或调整请求头。也没有把 BYOB/highWaterMark 的名称当作证明。
更换客户端仍需准确版本、完整驻留集合、分配界、域外关闭与隐藏请求的独立证明。

## 4. 完整编码清单与逐系数判定

### 4.1 原 JSONL 逐记录路径

| 层/记录 | 原始或编码内容 | 次数/预算归属 | 结论 |
| --- | --- | --- | --- |
| reserve | coordinate、请求 Base64、request/answer hash、cost | 1；R + H | R<=1 MiB 已由 ledger 限制；现行发送检查还收紧到 131072 B |
| pre_send | 完整 input_packet、sourceMap、C1 projection、冻结/路由/坐标 | 至多 1；C 的 4 MiB | 输入正文界不能直接当 packet 界；需计重复 sourceMap、静态字段和未来描述符，未给完整闭合证书 |
| request | endpoint、hash、elapsed、routing headers；正文已在 reserve，不在此重复 | 至多 1；C 的 256 KiB | 原 captureValue 明确剔除 bytes；未来客户端头/描述符精确 schema 未定 |
| response | status、content_type、content_encoding | 至多 1；C 的 256 KiB | 需绑定头解析后的字符串转义及失败路径；新头契约未成立 |
| wire_delivery | kind、elapsed、index、phase、byte_length、SHA-256 | 至多 N+2；M | 原字段保守编码 <=203 B，低于 1024 B；新增逐交付字段不在此证明内 |
| wire | 每次实际交付的完整字节 | 至多 N+2；B_raw | 给定 Q/停止域时 <=W+2Q；当前客户端不保证 Q |
| model/reasoning | 每次非空 delta 的 UTF-8 字节 | 合计至多 E；D | 原 decoder 可证明 D<=W、E<=floor(W/12) |
| terminal | result、usage、content/reasoning、termination/errors、latency、boundary_failure | 至多 1；C 的 11.5 MiB | 不能只算 delta；未来错误/契约描述符及完整序列化界未闭合 |
| settle | attemptId、outcome、actualCostMicros | 至多 1；H | 原固定字段有界；保留每个非 capture 的全审计 |
| 每个 JSONL 封套 | seq、previous、kind、value 非 payload 字段、digest、换行 | L*H | 原三种事件保守最大 814 B，低于 1024 B；不套 v6 封套 |
| 单槽外部证据 | pretty result、stdout、诊断/辅助文件等 | X | **16 MiB 被 §5 反例否定**；不能遗漏副本 |
| 批共享证据 | manifest、源码/冻结引用、execution-end、报告及保留区 | 批共享规划 | 尚非完整数量/峰值/配额证明；不能把不足自动转移到共享额度 |

失败路径只会减少既有正常记录，不能据此推断任何新 failure descriptor 都免费。
L=6+2(N+2)+E 仅适用于 reserve/settle 与上述四类控制记录；未来若新增独立持久化
事件，必须重新证明记录数，而不能沿用 L。本轮没有修改记录格式。

### 4.2 D/E 与编码边界

- strictJson 拒绝同对象重复 key；每个 event 仅消费一次，每个 delta 的两类字段
  各触发至多一次回调。它们在原始 JSON 中占互不重叠的字节区间。
- 未转义字符的 UTF-8 不变；JSON 简单转义、`\uXXXX`、代理对还原不会让单字段的
  UTF-8 超过其原始字符串 token 字节。孤立代理项 Buffer 编码为 replacement，
  仍不超过原转义六字节。跨事件配对也不增加已单独捕获字节的这个界。
- SSE 多 data 行只加入 JSON 外的换行；JSON 字符串内不允许原始换行。跨 read 的
  TextDecoder 状态和 SSE 拼接不重复发出字段。非法 JSON/UTF-8 不扩大发出次数。
- 最短非空 content 属性 `"content":"x"` 已需 13 B；reasoning_content 更长。
  escaped key、Unicode、空白只能增大源 token。因此使用更保守 12 B 得
  E<=87381。解码只处理 raw-first 后未越 W 的 generation 前缀，故 D<=1048576 B。
- 这两个界**不覆盖** terminal/result 的 JSON 转义、副本、usage 或 pretty print。
  `checkedUsage` 保留未知扩展字段；有限数字也可能因规范化增大编码，不能直接
  用 D 代替终态编码界。

### 4.3 M/H 与条件总式

极小字符串计算按所有固定字段枚举；时间用带引号的 32 位占位串保守覆盖有限
binary64 JSON 数字，seq 用 MAX_SAFE_INTEGER（比本候选实际记录数所需位数更多）。
坐标按允许的两个 100 字符 ASCII ID、最长枚举、64 字符 hash、最大金额计算；
空 payload 仅剔除 Base64 内容，不剔除键名、引号、逗号或换行。

得到 metadata 203 B；reserve/capture/settle 非 payload 分别 <=814/448/349 B。
这些是当前字段集合的保守上界，不是从样本均值外推。对象属性次序不影响长度。
新增契约字段若加入这些记录，需另算；32 位占位符不是实际可写入 ledger 的数值。

逐 payload 的 Base64 padding 不可忽略：
`sum(4*ceil(b_i/3)) <= 4*ceil((P+2L)/3)`。原条件算式仍是正确代数，
但 X 的前提已失败，C/Q/F 等尚缺证明，因此 **245,328,468 B 不能标为实际完整上界**。
X 失效本身不证明单槽必定超过 256 MiB；它证明原系数证书不成立，不能挪用余量
自动批准更大的 X 或宣布整体容量通过。

## 5. 独立反例：完整结果文件超过 X

构造一个合法形状的 usage：三个标准 token 数值为 0、1、1，另有 `pad` 属性；
其值是 30 层外包单元素数组，最内层为 300000 个数字 0。不是修改 oracle/prompt，
而是检查当前 transport 所接受的扩展响应域。

1. `checkedUsage` 检查标准 token 字段及两个 details 字段；没有拒绝额外 `pad`。
2. SSE JSON `{choices:[],usage:...}` 容器深度为 33，小于 strictJson 上限 48。
   此事件为 600,157 B，小于 W 和 event 上限；可配极小 content/finish/DONE 完整流，
   总量仍小于 1 MiB。各实际交付可 <=Q，总交付数远少于 N。
3. `live.mjs:56` 对每个结果使用 `JSON.stringify(value,null,2)+'\n'`，并完整保留 usage。
   在仅含 usage 的最小 summary 中，内层每增加一个 0，文件增加 69 B。
4. 仅对内层长度 1 和 2 的微型对象计算，分别 2403、2472 B。静态外推同一固定格式：
   `2403 + (300000-1)*69 = 20,702,334 B > 16,777,216 B`。
   真正 summary 还有其他字段，所以这个最小对象是下界，不是完整文件的最大值。

没有分配 300000 元素数组，没有生成或写入上述大事件/文件，没有调用 decoder。
证明依据是字段准入分支、固定缩进规则和小对象长度代数，不是模型观测或新评分。
未知 usage 不得删除/裁剪；改成紧凑结果编码、限制扩展域或提高 X 都是额外变更，
本轮不实施，也不把它们自动视为已经批准的解决方案。

## 6. 576 槽位：确定的字符串表示障碍

v4 `run-ledger.mjs:81`：`readFileSync(journalPath,'utf8')`；随后 split/parse 全部事件。
Node 文档说明 MAX_STRING_LENGTH 按 UTF-16 code units 计，带 encoding 的 readFileSync
返回字符串。数值取自本机运行时而非网上版本猜测。
来源：[Node v24.16.0 Buffer](https://nodejs.org/download/release/v24.16.0/docs/api/buffer.html#bufferconstantsmax_string_length)、
[Node v24.16.0 fs](https://nodejs.org/download/release/v24.16.0/docs/api/fs.html#fsreadfilesyncpath-options)。

### 6.1 支持域内的下界见证

取各槽 raw 总量恰好 W；小型合法 content/stop/DONE 流的其余字节使用 SSE comment
填充，放在 DONE 之前，每条 comment 行不超过数 KiB。`consumeLine` 忽略冒号开头
的行，但 raw-first 仍完整保存，不能在证据层删除它们。填充只描述字节长度，不
实际生成。短 comment 行可以组合为任意所需的大额整数余量，且不触发 event 界。

该见证不要求模型生成 1 MiB 文本、不耗尽 output token 配额、不依赖失败越限片段。
小正文可避免 CLOSED-LOOP 请求历史增长；任务标记即使错误也不是传输自动重试或
语义补发的理由。这里反驳的是容量对允许响应域的全称保证，不保证服务会实际发出
此流，也不声称某个真实批次必在第 384 次失败或能按 deadline 跑到那里。

任何非空交付分区的 raw Base64 长度至少为 `4*ceil(W/3)=1,398,104`。
选择 16 个 Q 字节交付时为 `16*4*ceil(Q/3)=1,398,144`；两者均符合候选次数域。
更细分片不会降低前一个下界。journal 这些字段全是 ASCII，一个字符就是一个
UTF-16 code unit；不涉及把一般 UTF-8 文件字节数错当字符串长度。

| 累计槽位 | 不依赖交付分区的 raw Base64 下界 | 16 个 Q 交付的例子 |
| --- | ---: | ---: |
| 384 | 536,871,936 | 536,887,296 |
| 576 | 805,307,904 | 805,330,944 |

单字符串上限 **536,870,888**。仅 raw 下界在 384 槽已超出 1048 个字符；所有其他
payload、封套和换行还会使障碍提前。settle 是非 capture，必走 replay；capture
缓存不能跳过这个全历史读取，也不能保证重启审计可执行。

结论：**在此运行时和原 v4 单字符串全历史物化要求下，无法覆盖完整 576 槽位
支持域**。这是表示域不可行，不是一个待测的 RSS/时间猜测。增大 heap/RAM/磁盘
不能解除固定单字符串上限；更换运行时或改变物化算法属于新范围，不在 J1 中执行。

### 6.2 RSS 并存集合：不能给虚假的 RAM 通过数

必须覆盖：旧 cache state、replay 完整文本、split 行引用/字符串、JSON.parse 新对象、
Base64 解码临时 Buffer、校验用 JSON/string/hash 中间值、新 cache、snapshot 深克隆、
prepare 保持的历史 state、当前 wire 数组与 concat、decoder 字符串/usage 克隆、
terminal/result 序列化、请求/packet/闭环投影，以及客户端 F、运行时与 OS 缓冲。
并非每个临时值在每一时刻同时存活，但现代码确实有新旧 state 与调用者快照并存；
不能用单一倍数代替活跃对象图/GC/native 分配证明。

按候选 L，仅 576*152927 就是 88,085,952 条逻辑记录的条件数量上界；这不是已观察
记录数，也不是相应对象的字节数。精确 RSS 上界、实际峰值和 GC 行为仍 UNKNOWN。
字符串障碍已足以否定本候选的全域可行性，无须通过大分配触发 OOM 再确认。

## 7. 完整审计成本：静态读分母，不测时间

在原 live 驱动、无错误、capture 缓存命中、无外部文件变化的理想成功路径，
每槽至少保留下列六个全历史 ledger replay，不计 frozen 文件散列读取：

| 每槽边界 | 本槽 raw 是否已全部进入历史 | 来源 |
| --- | --- | --- |
| schedule next | 否 | executeSchedule -> run.next -> snapshot |
| prepare eligible | 否 | send-boundary eligible -> audit |
| reserve | 否 | 非 capture append -> replay |
| request 发送前核对 | 否 | record(request) -> audit |
| settle | 是 | 非 capture append -> replay |
| settlement 后审计 | 是 | execute -> settled=audit() |

另外初始化一次、循环结束 next 一次、execution-end 的 next 一次，共 `6*576+3=3459`
次 ledger replay。每次 snapshot 还有 structuredClone；不是所有 replay 都 clone。
verify() 初始化与 prepare/request 共 `1+2*576=1153` 次，其冻结文件检查是另一个
读取集合，不能漏掉或与 journal 字节混成一个不明分母。

令 b=1,398,104（§6 单槽 raw Base64 下界）：

- 仅每槽一次前历史扫描的松下界：`b*576*575/2 = 231,526,022,400 B`，约 215.625 GiB。
- 按上述六边界与两个尾部扫描：`b*(6*576*575/2+4*576) = 1,392,377,366,016 B`，
  约 **1296.752 GiB** 的逻辑 journal 扫描义务，仍未计控制/封套、冻结文件与报告读取。
- 这是“假设完整跑完所要求的扫描工作量”。§6 已证明此见证会先撞字符串障碍，
  因而不能把上述数值冒充实际完成 I/O、物理磁盘读量、吞吐量或时间验收结果。
  OS 缓存可以影响物理读盘，但不消除解析/散列/克隆；所有时间/RSS 门槛均未测。

本轮初稿算术曾把边界记成七个；逐函数核对后修正为六个并补全三个固定边界。
原 `static-arithmetic.json` 保留，`static-arithmetic-correction.json` 明确替代其中
七边界相关字段。未覆盖任何历史验收计数、分母、分数或 P-G FAIL。

## 8. 可行、不可行、未知及下一步审核

| 分类 | 已获得的结果 | 不可跨越的边界 |
| --- | --- | --- |
| 可证明的局部界 | 原 decoder D/E、reserve R、原字段 M/H、逐 payload Base64 padding | 不是整体容量或客户端 PASS |
| 不可行 | 当前运行时 + 原 v4 全历史单字符串算法覆盖整个 576 槽位域 | 不自动改架构，不靠 RAM/磁盘加量宣称解决 |
| 已否定的候选系数 | X=16 MiB 在当前完整 pretty-result 记录要求下不成立 | 不裁 usage，不挪用共享余量，不自动提高 X |
| 未知 | 合格客户端 Q/F/头/identity/隐藏请求；C 完整编码；新描述符；精确 RSS、时间、资源预留 | 没有证明就不能启动 J2 或用真实请求探测 |
| 研究结论 | 仍沿 S1；自主归属与持续状态维护尚未充分验证 | 工程失败不等于研究 NO-GO；不重评分或混合新旧环境 |

建议 Owner 认可本报告后，**暂停 DC-EC-1 的原范围，不批准 J2/J3/J4 递进**。
如继续，只能另行审议是否允许改变“全历史一次性物化”的表示约束及外部证据编码/
容量契约，并先明确与原门槛的关系；所有旧屏障、全审计语义与 P-G FAIL 保留。
改变物化方式不必然等于删全审计，但等价性、驻留界、读取成本都必须重新证明。
此句只是新增范围的必要条件，不是指定 stream audit/index/v6 为已可行实现，也不是
重启计数优化、更换基线、缩小 576 负载、改变 live 1 MiB 或新设停止条件的许可。

无具体获准架构时，不提出虚假的“需要多少 RAM 就能运行”。192 GiB 仍是未批准且
未认证的磁盘规划；旧 8 GiB RSS、12 GiB 主机空闲、18 小时也不能变成本轮承诺。

## 9. 证据、复核与交付边界

本轮独立派生证据目录：
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-j1-static-proof-20261115/`。

- `runtime-and-client-source.json`：运行时常量、内置源码 hash 与有行号范围的摘录。
- `static-arithmetic.json` / `static-arithmetic-correction.json`：微型编码核算及保留的
  初稿计数修正；不导入研究执行代码，不写大负载。
- `source-catalog.json`：关键源文件/方案/冻结 runtime 的 SHA-256 与定位范围。
- `source-before.json` / `reviews-before.json`：改文档前的仓库/既有审议证据基线。
- `review-verification.json`、`lint-final.log`、`diff-check-final.log`：保护对象核验与文档检查；
  不代替容量 Evaluator，不含性能或模型验收。

本轮已完成 SHA-256 复核：162 个受保护仓库文件（含 99 个 mjs）、36 个前序审议
文件、267 个 live 文件、456 个历史文件、234 个前序制品、158 个前序源码快照文件、
7 个冻结研究材料及 10 个引用来源均与各自基线一致；这些集合有交叉，不相加声称
唯一文件总数。main 保持原 HEAD 且工作树干净。源码检查通过 805 个文件，
`git diff --check` 通过。没有新增回归测试或性能测量；静态证明不冒充运行验收。

只新增本报告、更新 STATUS/README 入口并保存本次派生静态证据。实现、测试、冻结
材料、原计划/提示词/oracle、原报告/分数和所有失败证据不改；main 不改、无提交或
push。完整性检查的实际结果以本轮 verification 文件为准。提交后等待 Owner 审核。
