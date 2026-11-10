# ACMI Phase 0.9.2：Task Understanding 研究报告

## A. 结论

当前优先级不是扩大关键词表或放松 Guard，而是把**用户在做什么、它指的是哪项工作、它允许提出什么结构变化、Host 是否有权写入**分成可独立验证的合同。旧归档的主要可见失败是过度弃权和没有生成图提案；不能从历史输出辨认每条样本的内部失败原因。推荐继续研究**以可信事件调度、带有界状态的分层方案**：默认分析所有相关用户正文，先验证真正无关的元数据才跳过。保留无硬触发对照；当前硬触发原型漏掉了有效请求，不应上线。Phase 0.9.2 未改变生产代码、Graph Store 或 Host 的持久行为。

## B. 522 个历史场景：只读取证

原 Phase 0.9.1 ZIP SHA-256 为 `2cdbd69bed87e6db34f8aee5cfb693264391a51fa1bd497859827fa0d81895ac`；独立提取 53 个条目，验证 52 项内容哈希。档案含 Development 221、Validation 85、已消费 Holdout 216。本阶段只在归档预测、候选、Guard 输出与 provisional 标签之间建立证据链，没有重跑旧 predictor 或按旧 Holdout 调参、选架构、校准或评分。历史结构化 Mock 意图命中 100/522（Holdout 53/216）；这不是 Phase 0.9.2 分数。

- **494 次弃权**：84 次符合暂定的 `uncertain`，410 次与非 uncertain 标签错配。101 次历史 switch 标签均有候选进入 Top-8，但原始意图命中 0，99 次弃权。高风险 170 例中 165 弃权；75 次意图命中中 73 次为 uncertain。拒绝或 abstain 不算授权，也不能当作普遍正确。
- **422 个历史意图错配**：261 例 Top-8 已有暂定目标，160 例无暂定目标，1 例漏掉关闭引用。12 个 Top-8 miss 全部为关闭的历史目标；未见明确可路由的开放目标漏检证据。唯一可确认的构包失败为 9 轮全部省略的 `input-budget`。不能把候选存在当成分析器读到或理解正确。
- **77 项漏报**，分布在 73 个场景；71 项伴随弃权，6 项在意图已命中时仍未生成 objective。这 6 项表明单修路由无法覆盖结构推断。5 次错误合并和 3 次错误拆分都被 Guard 暂缓；Guard 不是语义正确性。
- **标签边界**：3 个样本另记争议理由，原标签未改；没有真实人工金标准。失效目录覆盖全部 522 案，区分可观察症状、场景主题、未识别机制和证据等级。

详见 [Failure Forensics](../research/phase-0.9.2-failure-forensics.md)。包内 `failure-analysis/` 提供 scenario ID，可在另行核验的 Phase 0.9.1 原始 ZIP 中回查；本包不包含旧语料原文。

## C. 分层理解与理解上下文

用 L1 言语行为、L2 工作意图、L3 任务身份、L4 生命周期和 WorkNode 图草案、L5 可信 Host 审核来替代单一操作标签，Runtime Facts 单独为 L0。讨论现有工作 ≠ 切换；扩大当前目标 ≠ 新 Task；没有工作 ≠ 无法确定；已执行 ≠ Result 被消费/接受 ≠ Join 满足 ≠ 关闭。相同的 Task UUID 可以跨 Session，模型只能在本次权限快照内提出身份假设。多个 span 可并存，冲突、未知、已关闭和不在授权 scope 必须显式处理。

[问题模型](../research/phase-0.9.2-task-understanding-problem-model.md) · [Understanding Context Package](../architecture/understanding-context-package-v0.1.md) · [身份解析](../architecture/task-identity-resolution-v0.1.md) · [增量状态](../architecture/incremental-understanding-state-v0.1.md)。

## D. 架构与工程证据

| 路线 | 长处 | 短板 / 结论 |
| --- | --- | --- |
| A Single-pass | 低复杂度，作为对照便于重放 | 单个输出揉合候选、意图和图变化；作为控制，不授予写权限 |
| B Hierarchical | 分层诊断、单独弃权、证据可校验 | 多调用成本和错误级联；可以单次执行但保持分层输出 |
| C Stateful Incremental | 有限记忆、重放、跨轮指称 | 脏状态和撤权失效；依赖 cursor/revision/fence |
| D Event-triggered Hybrid | 将 B/C 能力用在真正需要的事件 | Trigger 会漏；推荐只跳过可证明无关事件，记录并抽检；未达到自动化门槛 |

现有 Core、dsh Plugin、Graph Store 支持有界候选、显式 Host 审核与 append-only 保护；未在本阶段重写。新设计为读视图、Proposal 和诊断增加明确合同，不添加 writer。模型输出无法自动绑定、接受 Subagent Result、满足 Join 或关闭 Task。对草案的合法证据验证与真实用户确认各有独立 gate；授权或版本改变使草案失效。

[18 维证据矩阵](../research/phase-0.9.2-architecture-alternatives.md) · [分层架构和三张 Mermaid 图](../architecture/task-understanding-layered-architecture-v0.1.md)。

## E. 离线原型：边界和局部权衡，不是模型能力

三个可执行小型原型（flat single-pass、hierarchical、event/state hybrid）与无触发、无记忆、无 typed runtime facts 三个消融。新写合成 Development 4 场景/21 轮、Validation 4 场景/25 轮，标签都是 AI provisional。无旧语料导入、无 Holdout 评分。旧规则分数只作历史参照，新 flat 是机制对照，不能与旧 100/522 作等分母提升比较。

| 新 Validation | 路由+ID exact | false merge | false split | 分析必要事件 | 候选比较 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Flat | 21/25 | 4 | 0/10 | 17/17 | 45 |
| Hierarchical | 21/25 | 3 | 1/10 | 17/17 | 44 |
| Event/state hybrid | 20/25 | 1 | 4/10 | 14/17 | 33 |
| 同一 hybrid，移除硬触发 | 23/25 | 1 | 1/10 | 17/17 | 40 |

硬触发减少比较，但牺牲召回；不能把候选比较数当 API 调用或费用。开发切片保留有限记忆对一条回指有帮助（去掉记忆 18/21 vs 19/21）；无 typed facts 每个 split 少捕获一项需要观察的事件。混合原型通过验证集 6 个状态检查；一个带否定的语义草案仍通过了证据 Guard 并停在待审阅，两 split 各出现 1 个“错误但可展示”草案，**执行均为 0**。这同时说明为何不能依赖 provenance 代替语义或用户审批。规模、同一构造方与已知验证集限制泛化，局部 JS 延迟无外部 SLA 含义。见 [复现、切片与性能](phase-0.9.2-prototype-results.md) 和 [原型比较](../research/phase-0.9.2-offline-prototype-comparison.md)。

## F. 新语料与人工双标

已完成 800 场景方案（400/200/200），覆盖中文、英文、中英混合、10–30 轮长会话、状态纠正、任务身份碰撞、决策与结果、反例和证据边界；在构造族、语言模式、任务 fixture 簇隔离，真实资格 Holdout 由独立保管方一次性解封。交付两份无答案盲标包，各 12 个相同新场景、顺序不同；另有 8 个内部独立冻结研究场景，无标签、未评分，并非外部保管的正式 200 项 Holdout。

真实双标和仲裁均 0，状态 `pending`。需要独立 A/B reviewer、身份和签收确认、独立提交、按层一致性、分歧仲裁和可追溯修订；包中只有规范、schema、空模板及可复现包生成器，没有假造人类提交。详见 [Benchmark 设计](../research/phase-0.9.2-benchmark-redesign.md)、[人工双标流程](../research/phase-0.9.2-human-annotation-plan.md)。

## G. 未来真实模型评测

实际 Provider 评测请求 **0**。已有不依赖 Provider 的四臂配对协议与授权检查表：模型版本和输入锁定、零真实用户 Session、预算/保留/地域约束、少量批准的开发验证、锁定输出和分母、由保管方一次性终测。不读 Key、不运行线上模型、不部署或更改 Profile。真实模型资质须另行获批，不能将 mock 代替。详见 [模型评测协议](../research/phase-0.9.2-real-model-evaluation-protocol.md)。

## H. Phase 0.9.3 待实施

[完整计划](../roadmap/phase-0.9.3-implementation-plan.md) 按九个可验收工作包定义依赖、失败测试、提案指标、安全门槛和 rollback。优先做契约/身份/证据门禁和 ungated Shadow 基线，再做触发漏检诊断；后续才是新盲语料的真实人工复核和获授权的模型评测。保留显式 lifecycle，禁止自动副作用和生产 Context Injection。不开始 Phase 0.9.3。

## I/J. Git 与交付

起点 `93df8375232206aa3f0b7b5677de4b6c21743d81`，分支 `acmi/phase-0.9.2`，独立 worktree；源码补丁、提交与完整 Git/回归/ZIP 回执随交付。未 Push、未发布 Release，未改变 main、Alpha tag、已安装 dsh 或原始 Session Journal。未改动 Phase 0.9.1 冻结/消费文件。仅保留允许的研究资料、合成原型与验证日志；完整文件列表及 ZIP 外部 SHA-256 在交付根目录。
