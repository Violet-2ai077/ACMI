# ACMI 0.9.4 盲标指南 v1

只使用本 lane 的包。对每案的 `focus` 作判断；先看此前对话、当前会话、授权任务和 typed facts。只标语义，不运行命令、不创建任务、不改变状态。绑定只在 `bindingSession` 有效；旧 Task 的存在或提及不产生 Binding。授权范围之外既不填写 ID，也不猜可见候选以外的细节。

| 层 | 字段与判断 |
| --- | --- |
| L1 | `acts` 可多条，逐条标焦点 UTF-16 半开 span、actor、原文；question/report/suggestion/rejection/selection/explicit_acceptance/conditional_acceptance/partial_acceptance/correction/authorization/acknowledgement/social/quoted/mixed/request。只有当前真正批准才是 explicit；条件和部分分别标，反语/引用/假设不是授权。 |
| L2 | `intent` 标主工作意图：continue/return/switch/new/refine/change/narrow/broaden/discuss/pause/wait/resume/close/none/uncertain。沿用既有目标的改进为 refine；实质替换为 change，除非明确另开；纯了解为 discuss；无工作 none，证据不足 uncertain。多意图在 reason 说明。 |
| L3 | `identity`：active/historical/ambiguous/missing/unavailable/out_of_scope/none/new/unresolved。前两者填包内 ID；其他一律 null。已关闭只读；两个同样合理为 ambiguous；参照未给为 missing；版本过期为 unavailable；权限受限为 out_of_scope；确有指代但无法分类为 unresolved。 |
| L4 | `claims` 逐项记录 objective/work_node/decision/constraint/result/dependency/branch/join/next_action/lifecycle。标 support: supported/contradicted/insufficient/context_only，mode: explicit/inferred，写依据；多声明不能共用无关 span；无声明填空数组。taskId 仅 active ID 或 null。 |
| L5 | `operation`：none/clarify/review/create/switch/bind/apply/unsupported。是用户显式请求的 Host 语义，不是 permission；拒绝或条件未满足不是 apply，讨论历史不是 switch。 |

targetAbsent: active/historical/ambiguous = no，missing = yes，none/new = not_applicable；其他为 yes（已知不存在于可用视图）或 unknown。reason 解释所依据的可见片段、为何排除相似目标、缺了什么证据。不要写真实身份、私有信息或系统路径。

坐标例：`A🍊好` 的 🍊 是 `start: 1, end: 3`；不做文本归一化或翻译。普通证据必须包含 `turn, actor, start, end, quote`；结构化事实引用为 `{turn, fact}`，fact 是包内 kind；Tool 原文不等于可信事实。每条 supported claim 至少一条依据。

边界例（非语料题）：助手说“我建议蓝色”，用户问“蓝色有什么优势？” → question/discuss，不产生批准；“如果干了才同意” → conditional_acceptance，不立即 apply；“只同意边框”不能批准整稿。Tool 上传元数据不是内容或完成；Subagent 完成、Result 产出、检查、消费、接受、Join 满足、任务关闭是不同状态。用户引用“全部接受”不是自己接受。跨 Session 指代可成立，但不能借用另一个 Session 的 Binding。同项目不同 deliverable 不应合并。
