# R-O / R-S 离线验收与容量建议

日期：2026-11-15。授权：仅离线实现与验收。

## 1. 结论

**验收执行完成，但未全部通过。不得据此重新冻结或启动模型批次。**

| 项目 | 结论 |
| --- | --- |
| R-O 字节、时间及存储计量 | 已接通离线传输、账本及 guarded harness；见下文口径限制 |
| R-S raw-first 两阶段事务 | 功能、真实前缀一致性及覆盖到的故障/恢复测试通过 |
| 固定五组配对性能门槛 | **失败**：全部五组完整审计耗时比均超过 1.25 |
| 4 MiB 离线容量候选 | **不建议提升**：现有预算存在确定反例，未形成闭合容量向量 |
| 当前 live 规则 | 保持 1 MiB；没有新授权、解锁、冻结或模型请求 |
| 科学研究结论 | 不新增任务分数，不改变旧 GO 判断，不据工程结果判断模型能力 |

## 2. 实现范围

- `run-ledger.mjs`：显式 offline-only `raw-first-transaction-v1` / v5。
  单个物理帧包含完整逻辑事件数组、attempt、范围及物理摘要链；原逻辑摘要链继续审计。
  批内校验失败不落入有效前缀；写入/flush 异常 poison 当前 v5 writer。
  部分尾部、遗留锁、篡改及已知逻辑/物理 head 回滚均拒绝，不自动修复或重发。
- `deadline-transport.mjs`：同一 read 的 delivery metadata + raw 先耐久提交，
  再提交该次解码的全部 delta。不跨 read 缓冲、不移除 flush、不删除证据。
  parser 失败前已经产生的 delta 仍保存，但不补成完整响应。
- `wire-accounting.mjs`：有界旁路观测，区分原始 Fetch body、SSE 帧、JSON 原始
  字符串 token、转义、解码 payload、未解析尾部及观测溢出。溢出只标记 unknown，
  不更改 decoder 接受规则。逐片耗时使用固定桶聚合，不增加逐 token journal 写入。
- `send-boundary.mjs`：仅 offline 模式可显式选择新存储；发送前冻结/输入/请求/
  预留校验全部保留。增加 prepare、reserve、凭据解析、pre-send validation、
  termination audit、settlement、final audit 和 attempt-wall 的分段时间。
  live 传入该选项直接拒绝，默认路径没有启用 v5。

旧 v1-v4 账本不迁移。新账本的 manifest 与链根不同，不能声称新旧 journal head
相同；回放严格比较的是每个逻辑事件的 kind/value、原始载荷/hash、时间和顺序。

## 3. 正确性与回放证据

### 3.1 r4 全部真实前缀

- 对全部 **35** 个已捕获输入前缀解析核对；**34** 个完整，最后一个保持不完整。
- v5 实际耐久回放并重新打开：**99,985** 条逻辑记录、**35** 个尝试、
  **35,308** 个原始 read；逐条载荷与原记录一致，最终 `halted=true`。
- 原始最后响应：1,048,650 B / 5,667 个 read。固定假时钟的真实片段传输回放
  仍以 `response_byte_limit` 结束，content 仍为空，reasoning 原样保留。
- 没有补造真实尾部、任务评分、oracle 调整或历史结果重导入。

全量回放新物理 journal 为 **83,013,509 B**，原 r4 全 journal 为
62,484,057 B。事务封套增加存储，减少提交次数并不等于减少字节。
该回放 worker 峰值 RSS 为 **1,126,004 KiB**，包括源记录、比较数据、审计及
新状态，不能直接当成 live 单次请求内存；它仍提示全量审计容量需要独立证明。

### 3.2 故障与边界

覆盖：批内非法时间/跨 attempt、部分写入、写全后 flush 报错、ENOSPC 模拟、
raw/derived 间失败、terminal 写入失败、跨进程追加、两个进程竞争结算、
实际子进程在追加中退出、遗留锁、同长篡改、逻辑及物理回滚、重启后 in-flight
禁止重发、UTF-8/CRLF/CR/JSON/SSE 分片、一个 read 多 delta、多 read 一个事件。

v5 的 D2 截尾仍需完整证据审计；D1/A/B/C0、字节上限、派生写入、terminal 或
cleanup 超时不能取得豁免。180000 ms / 5000 ms 的既有停止规则未放宽。

自查发现并修复：保持逻辑链不变、将多物理帧重新封装为较少帧时，原实现缺少
physical seq 下界检查。回归先观察到失败，再补上拒绝条件并通过。不是独立评审。

### 3.3 测试结果

- 最终完整离线回归：**189/189 通过，0 失败、0 跳过**。
- **73** 个 `.mjs` 语法检查通过；`git diff --check` 通过。
- 0 / 35 / 576 槽位稀疏合成账本均能审计、重开并保持状态。
  每槽仅三条很小的 capture，**不是 576 个近上限响应的饱和容量证明**。
- 回归测试内仅创建 `synthetic-test` 包并评测工程 fixtures；没有新 development
  冻结，也没有用 Evaluator 对真实 r4 输出重新评分。
- 通用质量扫描器扫描 `.mjs` 数为 0，安全扫描器只覆盖 1 个非核心文件；
  其空报告**不构成源码质量/安全通过证据**。交付依赖具体测试及源码自查。

## 4. R-O 新计量发现

最后请求共保存 1,048,650 B；送入 decoder 的前缀为 **1,048,419 B**，
最后一个 231 B read 因触发上限只保存、不解析。

对这个匹配的已解析前缀：

| 口径 | 字节 / 数量 |
| --- | ---: |
| 完整 SSE data 事件 | 4,839 |
| 非空 reasoning delta capture | 4,838 |
| JSON payload 字符串 token 原始字节，含引号 | 80,610 B |
| 其中字符串引号 | 9,678 B |
| 相对 decoded UTF-8 的转义额外字节 | 1,935 B |
| 解码 reasoning / content | 68,997 B / 0 B |
| 其余 SSE/JSON/元数据封装 | 967,809 B |

这些数满足字节分解，但不意味着元数据可删除，也不证明服务端异常。
5,667 个 Fetch read 不是 5,667 个 SSE 事件，更不是 token 数。

最终一次只读前缀核对中，35 个前缀的观测回调累计约 309.33 ms，decoder 回调约
399.77 ms。这是一次无节奏离线测量，不是固定配对性能成绩、模型延迟或线上开销上界。

时间口径限制：旧 latency 字段保留；同步 callback、locked work、append/flush
和 audit 存在嵌套，不可相加。terminal 中自己的 durable ack 为 null，只有回调
成功返回后的结果才记录确认时间。guarded boundary 的 attempt wall 截止到结算/
最终审计，调用方结果文件写完时间仍显式为 null，不能预填一个未来值。
字节边界是 Fetch response body，不是 HTTP/TLS 抓包；没有证明客户端解压行为。

## 5. 固定五组配对性能：保留失败

同一主机、Node 和 E: 文件系统，五组固定交替顺序，每次新进程；OS/设备 cache
不清空。全部十次原始结果保留，没有丢掉慢值、追加试验或重跑到通过。
负载为最后请求的原逻辑事件；测量 capture 服务成本，不包含 decoder/R-O JSON
观测，也不模拟服务端节奏。其他验证没有与这十次性能试验并发运行。

| 组 | capture 耗时比 v5/v4 | 按 read 的 p99 比 | 完整审计比 | 峰值 RSS 比 |
| --- | ---: | ---: | ---: | ---: |
| 1 | 0.6681 | 0.6152 | **1.3001** | 1.0733 |
| 2 | 0.6661 | 0.8000 | **1.3799** | 1.0921 |
| 3 | 0.6721 | 0.7133 | **1.4361** | 1.0522 |
| 4 | 0.6893 | 0.6767 | **1.3278** | 1.0713 |
| 5 | 0.7053 | 0.7008 | **1.4863** | 1.0697 |

- 追加/flush 请求：16,178 -> **10,508**，减少 **35.05%**，达到 >=30%。
- capture 配对耗时比中位数 **0.6721**，达到 <=0.80；不等于端到端加速。
- p99 与 RSS 五组均在 <=1.25 内。
- **完整审计五组均超过 <=1.25，整体性能验收失败。** 中位数也不能挽救这一项。
- 单请求重放 journal：9,775,134 -> **13,091,155 B**，约增加 33.92%。
  这两个数来自新建单请求账本，不与原全局序号下的该请求字节数混用。

配对测量对应 ledger SHA-256：
`71bc059f4a7c33f14b8f07383391b225b09df018a6e446b6b31ab6e167c5dcdb`。
其后只对 ledger 增加上述物理回滚正确性检查及缩进整理；**未重测性能**。
已重建并核对相同 SHA 的测量版本供复现，明确标为 reconstructed，不能将最终
加固版本宣称为通过性能验收。后续 guarded harness 的接通也不在这个性能试验内。

这些工程门槛不是统计风险上界；本轮不估计机制成功概率。

## 6. 容量建议：不提升 4 MiB

在不改变现有 channel / capture 4 MiB 上限的前提下，合成反例显示：

1. 1 MiB raw + 1 B 的这个特定超限片段可以归档，但这不是任意 read 大小保证。
2. **4 MiB raw 存满后，再交付 1 B 即触发 `channel byte budget`**，不能完整保存
   触发停止的原始片段。不能把 admission 硬顶同时作为 evidence 硬顶。
3. 按明确的合成 delivery JSON 格式精确计算，逐字节 read 的 metadata 在 1 MiB
   raw 时达 **180,292,538 B**，在 4 MiB 时达 **724,503,482 B**，均超过现有
   transport channel 4 MiB。此项是精确算术，不是假称执行了数百万次磁盘事务。
4. Fetch 最大 read、cleanup 交付量、单事务 delta 数及近上限 576 槽位的磁盘/
   内存/完整审计成本仍无闭合证明。观测缓冲溢出已验证会标记 unknown，而不假装完整。

**建议保持 1 MiB 现行 live 规则，同时维持不启动新批次。** 现行值本身也不是所有
碎片化方式都能完整归档的容量保证；错误须按原规则失败并停止。

下一步如获授权，应独立审议事务封套与完整审计成本、明确 read-count/transaction/
cleanup 的资源约束，或另提分段存储/索引架构。不能删除完整审计、提高阈值、降低
证据完整性要求，或以模型通过率挑选容量。本轮没有实施这些后续架构或新限制。

## 7. 不变项与证据位置

研究问题、prompt、oracle、原计划与七项研究材料未变。r1-r4 **267 个历史文件**
逐文件摘要一致，包含原分数、失败、输入/输出、冻结材料及原始 journal。
正式 main 干净，HEAD 保持 `9db1ee7da8209363a1fd76f3bebc83f75dfe9c9d`。
没有正式 Host/Graph 集成、模型请求、续跑、补样、旧结果覆盖或研究批次重新冻结。

离线证据根：
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-ro-rs-20261115/`

- `prefix-verification.json`、`prefix-verification-final.json`：原始与最终正确性核对，均保留。
- `all35-v5.json`、`all35-v5/events.jsonl`：全部真实前缀的新副本与完整性比较。
- `paired-performance.json`、`pair-*-v*.json`、对应 process 记录：全部十次配对结果。
- `benchmark-run-ledger-reconstructed.mjs`：与测量版本 SHA 一致的源码重建件。
- `capacity-recommendation.json`、`history-*.json`：容量反例及稀疏历史探针。
- `tests-final.log`、`tests-final-boundary.log`：188 项中间回归与 189 项最终回归，均保留。
- `historical-baseline.json`、`historical-integrity-after.json`：历史逐文件完整性证据。
- `source-final/`、`final-verification.json`：最终源码副本与摘要/核验索引。

复现脚本在 research/phase-0.9.19/execution 下。结果路径采用 exclusive 创建，
已有证据目录不可覆盖；需要新的离线运行标识，不得借复现脚本启动 live。
