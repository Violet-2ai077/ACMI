# ACMI Phase 0.8 执行报告

## A. 执行摘要

Task Graph、确定性 Context Assembly、隔离 dsh 恢复和 120 项离线基准已验证。
**dsh 为 Level B，仅限合成环境的动态上下文注入；原生 Compact 摘要增强
不具备可追加的公开钩子，不启用。** 不改已安装的 dsh，不 Push，不启用
自动 Binding，不调用真实模型。

## B. Task Graph

Task UUID 跨 Session 稳定。WorkNode、AgentExecution、WorkResult、结果审查
和 Join 分离；主 Agent 等待或继续不隐式改变 WorkNode。结果产生、可用、
检查、消费、接受、Join 满足与主线推进各自有明确事件。失败重试新建
attempt，旧 attempt 结果不参与新汇合。Workspace 授权与可信主机事件流
是前提；不从转录猜测任务归属。

重复事件幂等；乱序按可信 Task 序号缓冲；无效、因果缺失和未知节点保留
为 unresolved；同槽冲突阻断投影。120 个 checkpoint 加后缀与全量投影
一致。Core 无 dsh、Cordis、浏览器或 Node 文件系统依赖。

## C. Context Assembly

以明确 Task UUID、可信 scope 和当前 graph cut 装配。目标、验收条件、
活动 WorkNode、执行等待、关键约束和阻塞等保留来源引用；明确决策
替代与冲突不会按消息时间静默覆盖。跨 Task 仅使用同 Workspace 的显式
精确结果收据。已产生但未接受的必要输出单独标注，不能当作整合结论。
预算计入 JSON、引用与包装保留量，使用 UTF-8 字节保守估算，不声称为
模型精确 Token。Tier 0 不够时整包拒绝；排序、版本与 SHA-256 确定。

120 个样本：发出 116 包、4 个 500 单位样本按策略拒绝。发出的包保留
696/696 核心事实和 116/116 活动状态；全样本计为 696/720、116/120。
依赖正确 80/80、无关标记泄漏 0/260、未消费误升格 0/34。Task-only
也为 0/260，但依赖仅 20/80、活动状态 100/120。ACMI 预算中位数
6,329 单位，低于原文/近期基线 7,097，高于短摘要基线（引用和结构开销
明显）。这不是模型效果或生产 SLA。

## D. dsh Compact

验证发布模块 `0.2.2-rc.1` / Cordis `4.1.0`，对照只读上游提交
`fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159`。全局已装
`0.2.1-rc.2` 未运行也未修改。分析了手动 Compact、压力、模型切换和
overflow 路径、TokenMeter、replacement checkpoint 与持久化。

只用公开 `ctx.systemPrompt.context` 做默认关闭的 Level B 试验；
不替换摘要器、不注册失败钩子做注入、不重写 Journal。Source/Built 各
通过两个配对 Shadow 场景、压力及工具对和预算/取消/摘要失败回退。
两种依赖状态下，脚本摘要保留 1/6 个标记并带有无关任务；恢复请求
保留 6/6 且不包含无关任务。此结果只说明所测脚本和结构化恢复，
不代表真实 dsh 模型摘要表现。旧 Journal 在原生 Compact 时只追加，
恢复时 SHA-256 不变；重复 Compact 后同一源切片的包哈希不变。

## E. 跨 Session 恢复

dsh 从独立新 Session 的首个模型请求观察到正确 Task、节点状态、
约束、下一步和准确的依赖标注，未继承旧对话。另有 116/116 便携包
哈希加载验证，6/6 代表样本通过只接收包和可信身份/哈希的新进程
恢复。热路径从有界图投影取数，不重放所有历史 Session。

## F. 回归

- `pnpm check`：12 个测试文件、43/43；包含 Core、SDK、Conformance、
  dsh Integration、Observer、HTTP 只读、Synthetic Demo 和自定义 Adapter。
- workspace build/typecheck、Contracts 独立编译、lint/依赖边界通过。
- dsh Level B 专项：ACMI Source 与 Built 各 4/4；旧 Alpha Quick Start
  明文和 Zstandard 路径通过。全部为合成输入。
- 开发中观察到超小预算触发 Tier 0 拒绝、压力 tail 不可切分、下一步
  被批量证据抢占、未审查结果在宽图扇出产生重复诊断；调整 fixture 或
  修复政策后复测。未故障注入模型切换、overflow 或运行中取消，未部署
  到生产。完整命令日志及干净克隆结果随包交付。

## G. Git

起点 `436b8b60b459eb9719e44947e4ad33b60c17fb60`，本地与远端 main
一致，Alpha 标签不变；远端既有 CI 两次成功。本地分支
`acmi/phase-0.8`，仅明确路径分阶段提交。未 Push、未发布；旧工程
checkout 保持干净。具体 HEAD、提交和变更清单由打包从 Git 生成。

## H. 交付

交付根：`E:/codex-prj/ACMI/deliverables/phase-0.8`。包内包含架构、
实验报告、基准标签/结果、完整变更补丁、命令见证和内部 SHA-256。
最终 ZIP SHA-256、字节数与独立解压核验见包外报告和清单。

## I. 下一步建议（未执行）

先建立可信 Task 事件摄取/持久化协议、人审留出集和独立模型评估，
再考虑减少引用编码开销和接入目标 tokenizer。以单独审计验证
动态上下文的生命周期、撤权/旧快照风险和 runtime 兼容性；继续
保持自动 Binding、用户配置部署和 Compact 摘要替换关闭。
