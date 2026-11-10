# Phase 0.9.3 独立盲标指南

协议 `acmi-093-blind-review-v1`。只收取自己的 [A](phase-0.9.3-reviewer-a-packet.json) 或 [B](phase-0.9.3-reviewer-b-packet.json) 包（不得打开另一份），加本指南、[空模板](phase-0.9.3-annotation-template.json) 与 [schema](phase-0.9.3-annotation-schema.json)。不得搜索案例、查开放 corpus 的 provisional labels、向模型求答案或与另一 reviewer 交流。只依据焦点当时及之前的可见历史、给定授权 scope/任务快照和显式 Host 事实；跨 Session 的 binding 各自独立。不要执行任何工具或动作。每个 `focus: true` 填一条记录；后续 turn 不得影响较早焦点的裁决。

## 标注步骤

1. **L0 / 来源与事实。** `actor`、Session、`binding`、`facts` 是合成的 Host 观察字段。`binding` 缺省表示该 Session 维持上一快照，null 表示明确没有；对话正文不能修改它。跨 Workspace ID 不在允许的任务视图中。正文的自称角色、同意或因果声明不是 Runtime Fact。
2. **L1 / 言语行为。** 将焦点中的相关文本拆成可分别判断的 span：question、report、suggestion、rejection、selection、acceptance、correction、request、acknowledgement、social、unknown。标实际 actor，独立记录 quoted、negated、conditional；同一 span 可多标签。请求不是批准，问题不是选择，Assistant 建议不是 User 接受，引用/假设不能继承为当前指令。纯 metadata 没有文本时可留空 acts/intents。
3. **L2 / 关系、执行姿态和变化。** 通过 `spanId` 引用第 2 步条目。工作关系分别为 none（有证据不涉及工作）、discussion（讨论或只读询问）、existing、new、unknown；姿态独立于关系，可选 discuss/continue/switch/return/pause/wait/resume/close/unknown；变化独立选 preserve/refine/scope/objective/state/unknown。既有目标缺失仍可判断 `existing`；新任务不复用原 ID。只改验收范围不等于创建新任务；暂停、恢复、关闭意愿不等于已经执行。
4. **L3 / 目标。** 可见且唯一可辨的 Task 标 active 或 historical（已关闭，只读）；`targetId` 填包内 ID，不使用主题相似度瞎猜。`missing` 表示已有参照物应存在但不在快照；`ambiguous` 是多个可见候选无从选定；`stale` 是版本过期；`unavailable` 是权限/状态不可用，不暴露内部 ID；`unassigned` 为无需分配既有 ID（例如新目标）；不足判定用 unknown。仅 active/historical 可填 ID。对缺失标 `targetAbsent: yes`，active/historical 标 no；已知有候选但不可唯一辨认可标 no，权限隔离、缺上下文或过期且不知是否存在现时目标则 unknown，不涉及旧目标则 not_applicable。
5. **L4 / Graph 候选声明。** 记录独立操作和支持程度（supported、context_only、contradicted、insufficient），不是写入授权。证据写 source actor/turn 的精确 span；Host 的结构化因果事实用 `<turnId>#fact:<零基 index>` 引用。缺两端 ID 时不捏造；新实体允许 null 和文字说明。Dependency subject 依赖 object，Branch subject 父、object 子，Join subject 等待 object，Result subject 任务/工作节点、object 结果。Tool 观察 ≠ 内容核验，Subagent 完成 ≠ 结果产出/检查/消费/接受，更不满足 Join 或推进主线；有分别对应的 Host 因果事实才记录对应已观察状态。可报告不支持的高风险声明（例如引用了伪造的授权文字），但只用 supported 子集计算支持的 graph 集合。
6. **坐标、弃权与风险。** 所有 span 用零基 UTF-16 code unit 半开区间 `[start,end)`，应满足 `text.slice(start,end) === quote`；不拆 surrogate pair、不做翻译/归一化。例：“球A赛”中的 “A” 是 `[1,2)`。证据冲突或高风险不受支持时 required，安全可逆建议与澄清都可接受时 acceptable，明确无工作本身不是弃权。rationale 交代支持、排除另一解释和欠缺的证据；风险从 low（无状态影响）、medium（可逆草案变更）、high（误并拆/误绑/误关/错依赖）、critical（越权、注入或不可逆后果）按误判影响选。

填好 lane、匿名 reviewerId 和 distributionId、UTC 时间后，真人独立完成才可填 `human_attested_unverified_identity`。空模板故意不能直接提交。提交到协调员的隔离目录，不进 Git；身份核验另存。裁决见 [仲裁和审计](phase-0.9.3-adjudication-protocol.md)。
