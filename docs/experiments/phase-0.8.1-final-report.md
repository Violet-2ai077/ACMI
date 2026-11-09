# ACMI Phase 0.8.1 执行报告

## A. 执行摘要

已把 Phase 0.8 的预构造图实验接通到 **dsh 原生事件 → 规范化事实 →
可信 Host → SQLite 持久化 Graph → 确定性 Context Package → 新 Session**
链路。可信 Host 仍显式选择 Session 与 Task/WorkNode；本阶段不从普通对话
自动建图，不自动 Binding，不调用真实 Provider。

## B. Runtime Event Ingestion

测试为 stock dsh `0.2.2-rc.1` / Cordis `4.1.0`，只读源码
`fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`。用公开
`session/event`、`ctx.sessions.flush`、持久化 writer 身份和隔离
Journal 核验实际行。schema v1 只保留元数据；来源为 Workspace、
Session/incarnation 和局部序号。Tool Result 必须匹配同一 epoch 下
原调用的 seq、turn、step、call ID，并按原调用归属；绑定切换不会
把迟到结果移给另一个 Task。初次、缺口和 reload 可显式补读单个
有界 Journal；热路径没有解码历史。真实隔离试验观察到
39/39 条已选择的原生日志通知，含 stock Compact；未把快照正文
写入事实库。

公开 Agent 状态只有 idle/running，不能证明等待、恢复或结果接受。
两条子执行用真实 stock 子 Agent、原生父子 Session 元数据和 turn
事实验证；未实现完整 dsh Subagent scheduler/provider 生命周期的
耐久订阅，也未发明可重放的创建、恢复或终结序号。见
[能力矩阵](phase-0.8.1-runtime-event-ingestion.md)。

## C. Persistent Graph Store

采用 Node 自带 SQLite rollback journal，`synchronous=FULL`，
独占连接锁、一个 Workspace 一个 writer。事实、图事件、因果索引、
摄取游标可同事务提交；独立读写授权，按 Task 单调分配序号，CAS
与幂等回执明确。每条图事件保留 provenance、来源、版本、前序哈希与
canonical hash。新进程从 checkpoint + suffix 恢复；无效 checkpoint
可按原流重建。验证了重复确认丢失重试、第二 writer 拒绝、未提交子进程
退出、DB 截断、checkpoint/后缀损坏、显式前缀审计与 `SQLITE_FULL`。

没有跨 dsh Journal 与 Graph Store 的共享事务，不宣称 exactly-once。
正常 checkpoint 恢复只验证锚点和后缀，不每次重算此前全部行；需要
检查前缀时运行显式 `audit`。可信本地独占根，不声称对抗 Windows
恶意文件系统或签名防篡改。

## D. Task Understanding

Core 只接收有界事实和结构化建议，返回带证据和基准版本的提案，
不持有 writer。Host 独立授权确认，重取证据、重算 diff、核验版本，
并由投影校验转移与环。接受和图更改原子提交；拒绝保留，同一提案
不能因重试被接受。20 个结构化用例：提案正确 16/16、应 abstain
4/4、同源重算 ID 一致 16/16、分析阶段图误写 0/20。标签为
`agent_generated_not_human_reviewed`，不是开放自然语言理解精度。

## E. Persistent Context Runtime

从持久化 cut 预装配，按 Workspace、Task、Session incarnation、
stream/projection/source/policy 版本、预算、active node、哈希和
TTL 绑定快照。动态回调只复查授权和内存 revision，不扫描 Journal、
不冷启动读库。过期、撤权、版本变化、预算不足等停止新的贡献，
走 dsh 原生请求。**仅 Level B；不是 Pre-Compact，不替换原生摘要器。**

**未解决的生产门槛：** 撤权后确认没有新贡献，但 stock dsh 的后续
请求仍可能含此前持久化的历史快照；Source/Built 都实测到了。
本阶段不能撤回已写历史，不重写 Journal，禁止将该机制视为生产撤权。
敏感场景应退役旧 Session 并使用全新授权 Session。

## F. 端到端与性能

- A/B/A、跨两个来源 Session 与第三个新恢复 Session、observer reload、
  独立进程从 checkpoint 加 17 条后缀重建；新请求恢复目标和确认过的
  下一步，无 B 的目标或原始工具正文，来源 Journal 哈希不变。
- 两个真实 stock 子 Agent 完成只结束执行，不自动产出或接受结果。
  20 个持久化分支样本覆盖继续、Host 确认等待、失败重试、结果检查/
  消费/接受、显式 Join 和独立推进，未见提前接受。
- 160 个合成场景：560 条事实提交，40 个重复抑制，20 个缺口按补齐
  重试，20/20 迟到因果归属，60/60 规范化，40/560 未决归属；
  其余非 Task 事实不伪装为解析失败。155/155 发出包通过身份、版本、
  来源、哈希和预算校验；5 个超小预算明确拒绝；泄漏 0/155。
- 本机 SQLite 事务摄取 p50/p95 约 1.38/1.96 ms，热装配约
  0.15/0.56 ms，checkpoint 后切片恢复约 0.31/0.38 ms。
  热路径解码历史行数为 0；仍有原生 flush/stat 元数据检查。
  延迟、内存、样本量与数据尺寸见交付 benchmark，不是生产 SLA。

## G. 回归

`pnpm check`、verbose 全量：14 文件，55/55，其中 Phase 0.8 原有
43 项保留；Source/Built dsh 专项各 7/7。Build/typecheck/lint、
Contracts 单独编译、Core 依赖边界、Observer/HTTP、Conformance、
Synthetic Demo、自定义 Adapter、明文/Zstandard Quick Start 和
最终 HEAD 的干净克隆通过。Phase 0.8 旧 120 场景基准重新通过。
开发中原生 Compact 拒绝不能压缩的小 fixture，扩展测试历史而未
更改原生策略；早期空 Session 的来源改为独立 Host 坐标。

## H. Git

起点 `d534aaabee4748d2b3e7d8f72cab53754945609e`；从它创建
`acmi/phase-0.8.1`，本地提交，保持公开 main/Alpha tag 和只读 dsh
工程不变。不 Push、不发布、不改已安装 dsh、不重启原有服务。
提交、精确改动清单及最终 HEAD 见包外报告附录和包内 source。

## I. 交付

交付目录 `E:/codex-prj/ACMI/deliverables/phase-0.8.1`。
包含代码补丁、架构、实验报告、基准数据和逐项日志。ZIP 大小、
SHA-256 与独立解压校验结果由打包脚本附到包外报告。

## J. 下一步建议（未执行）

优先解决旧快照的有效撤权，并为宿主显式 flush/drain 设计可运维的
调度、重试和告警；若上游提供带稳定身份的子 Agent 生命周期源，
再扩展耐久观测。之后才考虑人审语义基准和独立安全评估。
