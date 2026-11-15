# R-C 容量契约细化 - Task 1

日期：2026-11-15。范围：获批的离线设计、纯计算工具、非计时正确性验证。
本文件不修改研究设计 R2、prompt、oracle、开发计划、live 1 MiB 或既有门槛。

## 1. 结论与证据等级

**现行容量仍不闭合。** 已归档反例在现行允许域内超过证据 channel；这不是再做一次
计时就能解决的问题。新增 `capacity-contract.mjs` 返回当前域 `INFEASIBLE`，不导出
运行配置，不改传输或账本，不把推导公式当作可运行容量证明。

工具区分四类信息：实现契约、精确编码、控制流不变量和观测值。前三类必须提供数值、
引用和 SHA-256，观测值不能替代保证。引用及摘要只提供来源绑定，**不是证明认证**。
`CLOSED_WITHIN_DECLARED_DOMAIN` 仅表示输入前提全部给出且保守算式落在所声明预算内；
当前生产路径没有满足这些前提。合成正例只能验证判定器，不能证明 V8、Fetch 或磁盘。

状态语义：

- `INFEASIBLE`：存在属于声明域、实际编码大小超过限制的具体反例。
- `INCOMPLETE`：前提缺失，或当前保守上界大于预算，尚不能给出充分性证明。
- `CLOSED_WITHIN_DECLARED_DOMAIN`：仅有条件的算术闭合，永远不产生 runtime 授权。

特别地，保守上界超预算并不证明实际输入一定超预算；工具不会混淆这两种结论。

## 2. 交付域与控制流

现有 `deadline-transport.mjs` 的 while 循环每次只拥有一个 `reader.read()`；停止后 cleanup
等待这个在途 read，不发起新的 read。收到的非空交付先归档 metadata/raw，再检查 admission。
由此可用 W+1 界住 generation 非空 read 数，加一个 cleanup 交付得到宽松 N=W+2。

Q 是单次交付字节保证，F 是 Fetch/解压/内部队列的联合驻留保证。两者目前未知。
工具保留 `raw <= W + 2Q` 的宽松公式，不把 overshoot/cleanup 互斥的某条路径推广为全局证明。
空 read 不贡献 raw 字节，却可能消耗 CPU、微任务和时间；其工作量边界单列未知。
W=1,048,576 B 不蕴含 Q；收到大 Buffer 之后切片，不能倒推出底层分配有界。

只读历史盘点最大 read 为 **882 B**，这仅是该固定输入的观测，不是 Q 的候选保证。
本次没有联网探测、安装新客户端、增加 read-size/read-count 限制或修改 cleanup。

## 3. 联合容量算式

记 M 为单条 delivery metadata 最大编码，C0..C3 为 pre_send/request/response/terminal
各自上界，D 为全部派生输出，R 为请求副本，E 为派生事件数，H 为逻辑封套编码上界。
这些上界都必须覆盖 JSON 转义、字段值、计数位数及独立记录边界，不用平均值代替。

```text
N = W + 2
raw = W + 2Q
transport = N*M + C0 + C1 + C2 + C3
events = 6 + 2N + E
payload = raw + transport + D + R
J = 4*payload + events*(H + 146) + 65536
disk = 576*J + failure_reserve + source_input_report_artifacts
rss = 6*J + raw + F + context + node_base + heap_overhead
audit = 576 * complete_audit_cost_per_attempt
```

Base64 必须逐记录计算 `sum(4*ceil(record_bytes/3))`；不能直接总量乘 4/3。
工具的联合上界采用每输入字节最多四个 Base64 字节，另有精确逐记录计算接口。
J 保守地为每逻辑事件预留一个 146 B 物理封套及 64 KiB 固定余量，不是改变存储格式。

RSS 的 `6*J` 是显式列出的保守物化项，不是实测倍率或 V8 上界。还必须证明独立的
heap_overhead、Node 基础内存、输入上下文和 F。无法证明时就是 unknown，不允许拿
8 GiB 的行政额度填进这些证明项。审计每次上界也必须覆盖逐渐增长的历史、所有关键
屏障、选择性物化触发的额外完整审计；不能用一次 reopen 耗时代替。

需枚举的同时驻留对象包括：Fetch 队列、交付 Uint8Array/Buffer、wire 数组及 concat
副本、decoder 字符串与 pendingDerived、capture Base64、逻辑对象与 JSON、整帧 payload、
写入 Buffer、审计当前 attempt/D2 chunks、完整 snapshot/选择性物化、编译请求和结果
序列化。64 KiB 读文件块不代表这些对象都在 64 KiB 内。

## 4. 当前不能闭合的具体项

| 项 | 现有证据 | 本次处理 |
| --- | --- | --- |
| Q/F/空 read 成本 | 当前实现无可引用的有限保证 | requiredBounds 保留 unknown |
| wire | 1,048,576 + 3,145,729 = 4,194,305 B > 4,194,304 B | 保留原真实合成传输反例；不重新执行它来改结论 |
| metadata | 1 MiB 逐字节交付精确编码 180,292,538 B > 4 MiB | 保留原精确编码反例；不是推荐新上限 |
| controls | 历史最大值可计算，允许域最大值未证明 | 控制记录联合预算保留 unknown |
| writer/RSS/audit | 现行宽松格式上界约 17.26 GB，整帧及当前 attempt 物化仍在 | 不进行巨额分配；不宣称可用 |
| 576 饱和 | 现有稀疏恢复不覆盖最坏输入 | 用 576 乘联合上界而非平均样本；缺项阻塞 |

具体反例必须校验声明域：prefix <= W、交付非空、有 Q 时不超过 Q、总字节一致；
碎片化反例 raw <= W 且 0 < reads <= raw。越出输入域的反例不能证明该域不可行。
底层历史反例来源通过 `evidence-index/capacity-proof.json` 的摘要绑定，不修改原文件。

## 5. 建议决策

1. **CAP-KEEP：当前继续采用。** 可以准备固定历史负载，不恢复 live，接受容量未闭合。
2. **CAP-DELIVERY：先补契约证据。** 需要在分配发生之前可保证的 Q/F 和空 read 工作量
   约束；不根据 882 B 观测自定 1 KiB/4 MiB。没有可信保证就不提交可运行配置。
3. **CAP-STORAGE：与交付域联合另案审批。** 已知碎片化仅 metadata 就是约 171.94 MiB，
   所以现行 transport 4 MiB 不能作为充分预算；控制记录、Base64、封套、RSS 和整批还须
   加总。不得直接将 180,292,538 B 设为新上限。
4. **CAP-MATERIALIZE：暂不实施。** 如果联合证明要求流式 writer 或外存审计，须另批
   新布局、崩溃与耐久语义、兼容性和性能成本。本轮没有引入 sidecar/index 或新停止条件。

新限制可能改变可接受交付域和失败分布；必须作为环境/协议版本记录，不能把历史
evidence_write_failed 改为成功。任何后续设计都不得删除原始 read 边界、raw-first 或耐久屏障。

## 6. 固定输入不等于通用容量

只读盘点校验逻辑哈希链、raw 内容及其 metadata 的对应关系、文件前后指纹，得到：

| 固定输入 | 尝试 | read | 逻辑事件 | 保守 journal 字节 |
| --- | ---: | ---: | ---: | ---: |
| P-L 原最后请求 | 1 | 5,667 | 16,178 | 12,197,586 |
| P-H 原全部前缀 | 35 | 35,308 | 99,985 | 77,047,418 |

原 journal 文件 62,484,057 B。最大逻辑记录 117,393 B；control 观测最大值分别为
64,604 / 415 / 128 / 72,156 B。这些数值只支撑固定负载磁盘估算。
完整性能资源建议和阻塞项见 [Task 2 结果](performance-preparation-results-2026-11-15.md)。
