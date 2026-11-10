# ACMI Phase 0.9.3 中文执行报告

## A. 执行结论

交付了独立 Understanding Context Package、分层理解和任务身份解析、证据约束草案、版本化增量解释缓存、60 个全新开放场景、四臂及七项消融、隔离 dsh Source/Built 只读 Shadow。W0–W6 的可执行工程验证已完成。**没有通过端到端语义资格，不允许生产自动路由。** 本阶段只增加 default-off 读侧路径，既有写入、绑定与执行包不变。

## B. 预注册与历史隔离

先校验 Phase 0.9.2 原始 ZIP（380580 bytes；68 entries、67 payload SHA-256）及交付包三项外部哈希，从 `7e92c55d83d1634994e7e39db26cf43ee6e4d06b` 建立独立 worktree 和本地 `acmi/phase-0.9.3`。W0 在任何新语料构造/实现前冻结，commit `ca924e8`；预注册 SHA-256 `7dee92fe9b702d08bfc3aeede4d3c13096feeb36ab7480754b36d178a55bb01c`。主门槛：零自动写入/越权/关键语义反转，必需事件触发 100%，人工审核后 eligible protected cases ≥60 且至少 20 簇，precision 95% CI 下界 ≥95%，意图和身份覆盖均 ≥65%。旧 0.9.1 的 216 例绝不重评分、调参或模型选择；历史回归只运行已明确排除旧 Holdout 的 `--open`。

## C. Understanding Context

与既有 TaskContextPackage 分离。Host 提供可校验 Scope、认证 actor、Session/incarnation、source cursor 和 Binding/Graph/source/candidate/policy revision；active、closed、typed facts、解释缓存分别投影。上限 8+2 候选、12 typed facts、8 retained、12 KiB UTF-8 / 3000 估算 token，取严格者。整段当前用户语义不可剪；超限或无效返回 typed insufficient-context，外域项无诊断计数。SHA-256 和精确 UTF-16 半开区间校验，不允许 Unicode surrogate pair 中间断开。Tool/Subagent 原文默认不进入包。见[契约](../architecture/understanding-context-package-v0.1.md)。

## D. 候选与身份

独立限量 posting 检索、对象 ACL、catalog revision 与明确 Binding；closed 只读 handle 不进入活跃候选或 Graph 目标。明确切换但缺目标，保留 switch 并返回 unavailable；同名歧义不默选第一。新工作为 unassigned，无新 UUID。验证集 active Top-8 13/13、closed Top-2 1/1；但 D 的可解析身份覆盖只有 3/14。oracle 不改善该计数。见[身份](../architecture/task-identity-resolution-v0.2.md)和[历史提示](../architecture/closed-task-historical-hints-v0.1.md)。

## E. 分层理解与四臂

L1 多 span + actor/引用/条件/否定，L2 relation/posture/change，L3 身份，L4 独立草案/澄清，L5 `no_operation`。分层不要求多个模型请求。A 整轮、B 分层、C 增量、D 可信事件混合；对照用同一新 corpus 和同一 Guard。D Validation L1 标签 F1 0.411、L2 exact 2/20（覆盖 13/20）、L3 exact 4/19（可解析覆盖 3/14）；A 对应 L2 1/20、L3 3/19。C/D 未在这批数据扩大身份覆盖。结果只是 scripted mock；不算真人 span agreement 或外部模型效果。见[分层合同](../architecture/layered-understanding-pipeline-v0.1.md)、[对照](phase-0.9.3-offline-comparison.md)和[消融](phase-0.9.3-ablation-results.md)。

## F. 证据约束 Graph 草案

支持对 WorkNode、约束、下一步、Decision、Result、Dependency、Branch/Join 等生成/校验有界草案，逐 Claim 校验引用、actor、全句范围、内容蕴含的保守边界、因果与版本，拒绝反向依赖、环、冲突及缺乏确认的结果接受/Join/Task 完成。候选或 Task 正在执行不代表可接受 Subagent 产物。完整正向结构句式可审阅；其他语言的语用可能弃权，不能把规则当作自然语言证明。验证集输出受支持 kind 4/4、召回 4/8，只有 7 个 eligible 焦点，不能达标。证据坐标独立攻击被拒，错误坐标被离线忽略时才产生只读草案。见[逐 Claim 协议](../architecture/evidence-grounded-graph-proposals-v0.2.md)。

## G. 增量运行与性能

状态是有 TTL 的会话解释缓存，不是 Graph；每个 Session 单飞、全局实例限制、重复/碰撞/乱序、权限/版本失效、取消和最多两次尝试。用户完整正文和必需因果不走关键词门，D 只跳过确认为 metadata 的事件，按游标模 8 抽样。D 的 Dev/Validation 必需触发 41/41 和 22/22；只跳过 1 个非必需 Dev metadata。512 Task、500 样本的本机探针独立计量 packet+validator p50/p95，以及 300 会话的缓存峰值与 heap 样本，见交付中的 `benchmark/performance-probe.json`；不是模型延时或生产 SLA。见[增量状态](../architecture/incremental-understanding-state-v0.2.md)。

## H. Benchmark、盲包与未消费 reserve

60 个新案例：40 Dev/20 Validation，65 焦点、162 事件，21 英文/19 中文/20 混合；3 个 10–30 轮长对话。不是 800 案目标的完成，不用模板填满。跨 split 检查 1280 对（含内部 reserve），未触发同簇/近重复阈值。Open SHA `1270ca0b508cd505babbcbd4cce18010c94ff273e9c9db51dc1aaffa2fe2aa02`。另外 8 个内部独立输入仅在工作树外同操作者 custody SHA 封存，无标签/未消费，不是独立 custodian 的正式 Holdout；封存收据 SHA `676b84edd22d77a87f3edad2586f89da621394a6e361c3569d788abadcfa50b5`。A/B 盲标包各 60 案、顺序不同、无答案；仅单独分发，不把完整交付发给 reviewer。人工 **BLOCKED**：`human_review_status: pending`、实际真人审阅与仲裁各 0，没有 Kappa 或假协议通过。见[语料与 custodian](phase-0.9.3-benchmark-design.md)及[人工状态](../annotation/phase-0.9.3-human-review-status.md)。

## I. W7 真实模型

**BLOCKED: explicit authorization required**。0 真实请求、无凭据读取、无真实 Session 或默认 Profile 改动。已交付离线接口和未来批准清单；需另行获得 Provider/模型/数据/隐私/费用授权，并满足新正式 Holdout 与人工前提。见[W7 状态](phase-0.9.3-real-model-status.md)。

## J. 隔离 dsh Runtime Shadow

信任边界：正文来自受信 Host 捕获的原生事件；旧 durable fact 只核对 actor/cursor，未认证正文哈希。metadata 类型也由 Host 认证，不是独立 Journal 内容认证服务。

锁定 stock dsh 0.2.2-rc.1，使用真实隔离 native Session 事件和进程内 scripted LLM Adapter，不是 Provider。Source/Built 各 3 个专用 Shadow 测试；两个运行中均生成 1 项待审阅 objective 草案，否定轮 0 项。每个观察窗口 Journal 与 Graph 文件清单/哈希、逻辑 Graph Cut、Binding revision 与 Proposal 状态前后相同；零 socket/fetch、零 Provider/LLM 调用进入 Shadow。没有修改安装 dsh、原 Journal 或生产 Profile。见[独立 witness](phase-0.9.3-runtime-shadow.md)。

## K–M. 回归、Git 与交付

旧 0.8/0.8.1/0.8.2/0.9 fixture、0.9.1 open-only、0.9.2 研究测试和当前完整回归与 Source/Built 回执随包。最终分支、Commit 列表、干净克隆、独立 ZIP 解压、SHA-256 和所有文件绝对路径见外层报告及 `FILES.txt`。未 Push、未发布 Release、未改 main / Alpha tag。

## N. 后续建议

保持只读 Shadow、显式 Host 操作与 ungated control；下一步优先补足由真人审阅的新语义场景（尤其候选已在榜但引用无法消解），完成独立保管与授权后才申请真实模型和资格评测。现在停止，不开始 Phase 1.0。详见[资格决策](phase-0.9.3-qualification-report.md)。
