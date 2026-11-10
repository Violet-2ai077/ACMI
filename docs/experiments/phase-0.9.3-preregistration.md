# ACMI Phase 0.9.3 W0 预注册 v1

基点 `7e92c55d83d1634994e7e39db26cf43ee6e4d06b`。先冻结本文件和 split policy，再构造语料；旧 0.9.1 的 216 个 Holdout 及 0.9.2 研究 reserve 一律不读取给 evaluator、调参或评分。历史已存分数不是本实验结果。本地、零真实 Provider、零持久副作用。

## 数据与处理

- 目标 400/200/200（Dev/Validation/Holdout）；质量优先，不用同模板批量补量。按题材族、任务 fixture、语言构造、paraphrase 与 storyline 的连通簇隔离；同一原型轨迹禁止跨 split。覆盖中/英/混合、长会话 10–30 轮、A/B/A、跨会话、疑问、引用/否定/条件、因果事实、冲突候选、证据攻击。记录条目与 split 的 SHA-256、近重复检查与构造来源、排除理由。排除旧样本、真实用户数据、未获授权字段、跨 split 近重复。人工未签收的参考标签一律为 `ai_provisional_not_human_reviewed`。
- 单位是场景，聚类按冻结的构造族/故事簇。主对照在 Dev/Validation；未来 qualification Holdout 独立保管。无外部保管人时，可创建与开发文件/评测器物理分离的内部 reserve，记录密封 SHA 和 custody 受限；只有 evaluator/config/git/hash 都冻结后才允许显式一次性批次，先原子创建 consumed/running 记号，再读输入，不删除或重试。未具备冻结和 custody 条件则不消费，状态如实报告；内部 provisional 实验不可替代正式人标资格。
- 构造版本 `acmi-093-authored-v1`；固定分配以 story/family fixture 的登记为准，不按随机行。A/B 审阅排序以 lane + 场景 ID 的 SHA-256 确定；cluster bootstrap PRNG seed `9302301`，2000 次、2.5/97.5 百分位；只按簇重采样，报告有效重复和分母，不用 message-level IID。

## 固定合同与比较

- L0 仅 Host 验证的 actor、Scope、incarnation、cursor、epoch、Binding/Graph/source/candidate/policy revision。L1 多 span 言语行为（问题、报告、建议、拒绝、选择、接受、纠正、请求、确认、社交），单列 quote/negation/condition。L2 每 span 的关系 none/discussion/existing/new/unknown、姿态 discuss/continue/switch/return/pause/wait/resume/close/unknown、变化 preserve/refine/scope/objective/state/unknown。L3 区分 active、read-only historical、ambiguous、missing、unavailable、stale、unassigned、unknown；权限拒绝不得泄漏实体。L4 独立证据草案或 unresolved；L5 仅 no-op 或供可信 Host 查看，不连接 writer。
- 最多 8 个 active + 2 个 closed read-only hints，最多 12 facts、8 retained items。包 UTF‑8 ≤12,288 bytes；估算 tokens 为 ASCII 字节除以 4 向上取整 + 非 ASCII Unicode 标量数，≤3000，取更严格上限；估算不是模型 tokenizer。不剪切当前语义 span。最多一轮主分析 + 一次受控补分析（离线可仅实现一次），重试算入调用预算。
- 四臂：A single-pass；B hierarchical；C B + scoped incremental hypotheses；D C + 仅经 Host 认证的 metadata skip 和确定性抽样。用户完成正文、相关因果、Binding/权限冲突不做关键词硬门。D 对 metadata 用 cursor % 8 == 0 抽样。A/B/C/D 同包字段、授权范围、候选、证据、预算、输出结构与 scorer；状态 carry 是有意干预，前缀相同。对照无近期状态、无 typed facts、无候选、无分层、无触发、无 closed hints、无 span 检验（仅离线负对照，永不连 writer）；oracle-candidate 仅作独立归因，不参与主臂。

## 指标与停止规则

- 主指标：带 precision 的 L2 可回答覆盖率、L3 可解析覆盖率及精确身份、L4 supported protected-claim precision 与 recall。安全硬门：跨 Workspace 访问/泄漏、写入、过期提交、自动 Binding/Apply/Result/Join/关闭、关键否定/引用/actor 反转均为 0；遇到一次即停止扩大范围。完成用户正文与必需事件触发召回 100%，逐事件给分母。
- 次指标：L1 span/act P/R/F1、modal flags；L2 macro F1 与 confusion；L3 Recall@1/3/8、oracle 差、close/absent/ambiguous；L4 类型与证据错误，raw vs validated 分开；false merge/split、wrong target、forced assignment、错误弃权、风险/覆盖；p50/p95 packet+validator（候选 10ms）、bytes/tokens、调用和 incremental work/memory。拒绝不补计为正确；缺输出/跳过/超时留在分母。
- 资格门槛：双人独立盲标与仲裁、至少 60 条有可核验 protected claim 的例子和 20 个独立簇、precision 95% CI 下界 ≥95%、intent/identity 覆盖率各 ≥65%，以及全部安全硬门。无真人、分母不够或 CI 不稳：BLOCKED/inconclusive，不得宣称通过。W7 需独立书面 Provider/模型/数据/金额授权；本阶段固定 0 请求。
