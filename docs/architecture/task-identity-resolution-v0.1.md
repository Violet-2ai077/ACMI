# Task Identity Resolution v0.1

身份是一个受 Scope、有效性和时间约束的实体解析结果，不是“哪项任务最相似”。已有 Task 的 UUID 随细化、继续和跨会话复用保持不变。新工作在用户通过可信 Host 确认前只有本包临时句柄，不分配 UUID。

1. **提取引用而不操作**：单个 turn 可有多个提及。保存 span、角色、引用/否定/条件和局部语境，例如“从 A 查日志给 B”不是一次全局切换。
2. **检索与授权先行**：来自 Host 的显式目标先验 Scope；从授权候选池做有界检索并记录 rank/reason。选择性读 closed tombstone 仅在该对象对用户仍可见且需求提到过去工作时；可提示确认重开，永不进入 binding allowlist。授权验证先于摘要，输出不能透露别的 Workspace 是否存在同名实体。
3. **解析结果与 action 分开**：`resolved` 返回来源和 revision；`ambiguous` 返回当前权限内最多两个可区分提示或通用澄清；`absent` 指可见集合中未找到，不声称全局不存在；`closed` 只读；`scope_denied` 内部 fail-closed，外部不披露；`stale` 要重取；`new_unallocated` 仅表示提出新工作。
4. **谨慎用增量状态**：记忆中的最近指称只作为带版本、turn ref 与期限的先验。若 A→B→A，分别验证各次实际 Binding 和语义提及；新旧 Session/incarnation、scope 变更不能借出既有焦点。权威版本冲突时不以较新文本覆盖较旧 Host 事实。
5. **澄清与复核**：无证据、同名、关闭、候选过期可请求澄清或一次有界补取；低置信或高风险不强行 Top-1。原样传来的 UUID 不授予权限。模型发回任意外部 UUID、未发行 handle 或越包引用一律拒绝。

可以先从当前 turn 抽取指称再检索，或并行准备小候选集再让分析器作对比。前者更能避免语义被错误候选锚定，后者适合短时延，但不得让候选缺失消除明确意图。推荐并行准备授权初筛、保留当前 turn 的独立语义，再做每个 span 的有界解析；只有输入不足且预算允许时才补取一次。

对照测试：近似命名但相反目标、同名分属不同 Workspace、两个开放候选同分、明确 UUID 与状态冲突、关闭任务与同名开放任务、提及两个并只授权其中一个、工具中伪造绑定语句、撤权并发、A/B/A 口语回指与 restart。分别报告可绑定开放候选 Recall@k、只读 closed hint 覆盖率、missing-candidate 率、带拒绝的 identity precision/coverage、误 merge/split 与未授权句柄泄漏，不合并分母。
