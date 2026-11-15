# S2-R - 完整 reader 接受域的静态证明

日期：2026-11-15。结论：**算法关系 STATIC_CONDITIONAL；完整实现/失败文本兼容 NOT_CLOSED**。
依据：[获批静态任务](../../../docs/superpowers/plans/2026-11-15-me-s2-static-closure-proposal.md)。
没有实现新 reader、生成非规范大文件或执行重放。候选契约未生效，G1 未批准。

## 1. 原语义分支与证明范围

原 v4 是冻结 r4 的 JSONL 路径，不是 v6 binary 路径。冻结 run-ledger 与当前文件
hash 不同；本轮核对原 replay/transition 分支，未把新增 offline 功能视为原基线。
源码对照保存在本轮 `frozen-source-comparison.json`。

| 原步骤 | 必须保留的可观察行为 |
| --- | --- |
| 参数/路径/锁 | manifest 精确字节、safePath/符号链接检查、wx 锁；旧锁不自动删除 |
| 解码/行边界 | 整文件 UTF-8 解码语义；非空文件必须 LF 结尾；按 LF 分行，空行也交 JSON.parse |
| JSON | 非规范空白、重复 key、原数字转换；不是 SSE 的无重复/48 层规则 |
| envelope/hash | 精确字段集合；解构去掉 digest 后按原属性次序 stringify/hash；seq/previous 检查 |
| reserve | coordinate/hash、唯一性、halted、单 in-flight、费用/次数、D1 原答案、request 解码 |
| capture | 当前未结算 attempt、channel、有限单调时间、严格 Base64/hash、逐 channel 累计 |
| settle | 原 outcome/cost；diagnostic_censored 的 D2 完整审计；原 halted 规则 |
| 结束 | checkpoint 不回滚/不变更、fingerprint 前后相同、totals 原遍历和加法顺序 |

accepted-domain 定理要求旧实现成功的输入得到相同逻辑状态；不要求复制旧 OOM 或
单字符串极限作为新的语义拒绝规则。语法/摘要/状态非法输入不得变为合法。
精确错误字符串、异常顺序和资源失败另列，不能以逻辑状态定理覆盖这些接口。

## 2. 具体候选 R-T：token 表与原生标量转换

为减少重新实现 binary64 舍入的证明面，细化为以下候选，而非自行写数值转换器：

1. manifest/fingerprint之后先检查非空文件最后一个字节是否LF，再解析任何行，
   保留原 partial journal 优先于较早行语法错误的顺序；这一次尾部读取也计成本。
   增量执行与原 Buffer UTF-8 解码相同的解码器，保留 BOM/替换字符语义；识别 LF，
   每行用完整 JSON 文法扫描。记录原始字节范围与解码后 token 边界的对应关系。
2. 临时 token/node/member 表保存父子关系、原位置、类型和范围。对象/数组使用
   外存栈，不因 48 层或正常 writer 的 R_line 限制拒绝旧输入。
3. 标量 token 在需要时使用同一运行时的 `JSON.parse(token)`，包括长数字、字符串、
   负零及溢出到非有限数；不添加 SSE 的非有限数拒绝。此选择**仍有最长 token
   驻留量 U**，不是常数内存解析器。长 token 可从原文件重新取出，不复制整批历史。
4. 对象成员比较解码后的 key；保留首次插入次序与最后值。整数索引 key 按原规则
   排序，其他 key 按首次插入次序；`__proto__` 作为数据属性处理，不用赋值触发 setter。
5. 从最终语义树输出与 JSON.stringify 相同的字节流，包括去除顶层 digest 的原
   解构结果。所有被覆盖的旧值仍须语法合法，但不必保留其物化对象。
6. 沿原分支和短路求值顺序验证并折叠状态；seq/previous已失败时不提前做hash或
   transition。只有当前 attempt 完整驻留。每轮重建 token 表，
   不跨审计缓存可信 offset/解析结果；完成后按 ME-S lease 规则消费范围。

JSON 数据语义依据：[JSON.parse/序列化](https://tc39.es/ecma262/multipage/structured-data.html#sec-json.parse)、
[属性枚举顺序](https://tc39.es/ecma262/multipage/ordinary-and-exotic-objects-behaviours.html#sec-ordinaryownpropertykeys)。
这些规范不证明指定 Node 的分配量、诊断文本或候选实现已合格。

## 3. 五个模拟关系与反例轨迹

| 关系 | 归纳不变量/证明要点 | 不能省略的轨迹 |
| --- | --- | --- |
| R-L 词法 | 每消费一段，token 前缀与整行解码/JSON 文法前缀一致；保留字符串/escape/数字状态 | 32 MiB 前导空格合法；`1 2` 非法；CRLF 可解析与空白独立行失败分别处理 |
| R-O 对象 | 每插入成员，当前 key 集、首次位置和最后值与 JSON.parse 对象一致 | `a` 与 `\u0061` 重复；被覆盖的深对象仍检查语法；数字 key 重排；`__proto__` |
| R-N 标量 | 完整 token 交原生 JSON.parse，避免自造 Number 舍入语义 | 超长指数、-0、孤立代理项、溢出数值；不能因旧值随后被覆盖而跳过语法 |
| R-H 摘要 | 同一语义属性序列按原 stringify 输出，hash 分块与一次输入等价 | 对原始行 hash 错误；排序全部字符串 key 也错误；非有限值序列化遵从原规则 |
| R-S 状态 | 同前缀 seq/head/attempts/budget，沿原验证顺序更新；D1/D2 与 ME-S 一致 | error/unknown halted、未知费用、历史 D2 重验、尾部不完整、checkpoint 回滚 |

对象/数组归纳与原生标量组合可给出逻辑等价定理；但它依赖 R-L 解码器、文法机和
精确 serializer 的实现符合合同。本轮没有这三项实现证据。
特别是 JSON.parse 对整行的 SyntaxError 包含位置/片段；单 token 的原生错误不能
保证同样文本。重建整行调用原 parser 将重新产生大物化；本轮不这样做，也不批准
修改错误格式。因此**完整失败接口的全域兼容仍未闭合**，不能宣称 reader 合格。

## 4. 可核算的外存/驻留合同，不是新上限

令 H 为本次审计文件字节，R 为最大行，U 为最大标量 token 解码量，d 为最大深度，
T 为一行 node/member 记录总数，V 为其保留语义值量。U/R/T 均是成本参数，不是拒绝阈值。

候选固定宽度域为所有位置/计数可用 uint64 表示的当前研究文件；旧成功输入受原
单字符串可表示量约束，落在该域。超出此域的未来扩展不由此证书覆盖，不能反向
拒绝域内旧文件。节点及成员记录每个 <=256 B，外存栈 frame <=64 B：

```text
S_line <= 256*T + 64*d <= 320*T
M_logical <= B_two_scalar_conversions(U) + traversal_buffers + hydrate(V)
             + current_attempt + summaries + cache_overlap
Read_line <= (8*T*T + 16*T + 8)*(R + S_line)
Write_line <= (8*T*T + 16*T + 8)*S_line
```

B_two_scalar_conversions 包括两次比较同时保留的原 token、解码字符串和原生解析
结果；其底层复制/布局由 S2-M 绑定，不能假设每次只有一份 U。
读写式来自保守的逐成员两两比较/选择次序方案：不依赖未证明的外部排序性能，
把 token 重取、table 扫描/更新和输出遍历全部纳入。它是条件成本界，不是高效性
证明或实测 read 分母。元数据表单份原位更新，无第二份全表；失败时该份保留。
文件系统块分配、page cache、元数据/日志和运行时对象开销在 S2-M 另计。

对现有紧凑 JSONL writer，payload 在 Base64 字符串内，不递归解析成 journal 的
JSON 节点；外层 envelope、coordinate、各事件字段合计 T<128、d<128。
因此本候选**正常 writer 每行 scratch 逻辑文件界 <=40960 B**，与 payload 长度无关。
这是完整语法扫描后的形状结论，不是可跳过扫描的可信标签；非规范重复成员仍按
实际 T 计入。一般 D_old 没有这个 40960 B 界。

serial audit 一次只保留一行 scratch；新一轮不能消费旧 scratch。失败保留数 f
必须计入 `sum retained S_line`，不能假定已有失败文件会删除或无限恢复免费。
独立 report/reader 并行时乘实际同时工作区数；本合同不默认新开并发进程。

## 5. 判定

- 原接受域/五个模拟关系/参数化成本已细化；未通过缩域解决 32 MiB 反例。
- R-T 将数值语义依赖收敛到原生标量解析，代价是 U 相关驻留和额外 I/O；不是固定小 RSS。
- 三项实现符合性、UTF-8 边界同构、完整原生诊断文本以及实际性能仍未知。
- 不启用外存、行长限制或新失败规则；G0/P-G FAIL/live 1 MiB 原样保留。
