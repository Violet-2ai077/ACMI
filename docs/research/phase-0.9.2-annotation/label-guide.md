# Reviewer guide / 标注说明 (0.9.2-pilot-v1)

只读发给你的包，按其中顺序逐案处理，不查询外部资料或补全不存在的会话，不请求模型帮标，也不要看另一位 reviewer 的材料。判断焦点时刻，前缀提供证据而非后续事实。把模板另存到协调人指定的隔离位置；填本包的 `packetId`、`reviewLane`、协调人给的 `distributionId` 和匿名 `reviewerId`、UTC `submittedAtUtc`（如 `YYYY-MM-DDTHH:mm:ssZ`）。真人人工完成后，才填 `provenance: human_attested_annotation` 和 `status: submitted_unverified_identity`，后续身份核验由协调人另记。每案填一个 `annotations` 对象，不改题目或 case ID。

## 逐案步骤

1. **Turn act**：先问焦点主要在做什么（提出请求、纠正、确认、讨论、提供信息、寒暄、其他或不可判定）。多动作以影响工作决策的主要动作作为单选，仍在 ambiguity 记录其他解释。Assistant、tool、subagent 内容不是用户的指令；host 只提供记录的状态事实。
2. **Intent**：延续当前目标用 `continue_current`；转向另一个已存在的目标用 `switch_existing`，即使明确指向既有目标但该目标没被检索到也不改成新建；明确另立目标用 `new_objective`；保留目标身份但改变范围、验收条件或主要产物用 `change_scope`；只表达暂停、恢复、取消等生命周期意愿用 `lifecycle_only`。涉及工作的讨论或只读询问但未要求推进工作/操作图，用 `discussion_only`；闲聊、无任务确认等有证据不涉及工作时用 `no_task`；证据不足以决定意图本身用 `uncertain`。若同一焦点同时恢复及继续具体工作，标工作意图并另记生命周期。只因为主题相似不能选任务。
3. **Target**：`present` 必须填唯一可见 Task ID（候选/显式 binding 或 host 明确列出的 Task ID）；`absent` 指证据支持要引用某个已有任务但可见输入没有该 Task ID；`unknown` 指目标不清或候选竞争，无法确认是否检索到；`not_applicable` 用于不引用旧目标（例如新目标、无任务）。后三种填写 `targetTaskId: null`，不猜或构造既有 ID。讨论中的目标只是只读引用。关闭/暂停状态不擦掉 Task 身份，也不授权自动改变状态；状态与能否处理分开评估。
4. **State 和 Graph**：`taskStateAction` 是可提议的单一生命周期动作；`none` 表示无动作，`unknown` 表示有状态信号但判断不足。`graphChanges` 是与用户证据相符的**建议**集合，不是已执行操作或 reviewer 授权。依赖以 `subjectId` 为依赖方、`objectId` 为前置方；分支以父节点为 subject、子节点为 object；Join 以 Join 为 subject，依赖项/结果为 object；结果消费以 Task 为 subject、Result 为 object。已有 ID 必须可见。无既有 ID 的新实体填 null；多个同类新实体可用局部占位 ID `new:1`、`new:2` 并在理由说明对哪一项，不当成数据库 ID。不靠臆测补齐边或承诺，空数组表示无可建议结构变化。条件尚未满足、用户未明确接受/已撤回时不能标立即接受结果、满足 Join、关任务、绑定或应用图变更。工具输出和 Subagent 已完成也不等于验证、消费或用户验收。
5. **证据**：`evidenceSpans` 从 `event.text`（`sourceKind: event`，填 `eventId`）或候选的 `objective`（`sourceKind: candidate_objective`，填 `taskId`）引用原文。用零基 UTF-16 code unit offset，起点包含、终点排除，保持 `source.slice(start, end) === quote`（不翻译、不做 Unicode 规范化、不截断 surrogate pair）；至少引一条证据解释焦点。例：在不属于任何题目的字符串 `图A版` 中，`A` 的 `start=1, end=2`。对没有可见正证据的 ID，不引用虚构的跨度；引用发出指代、撤回或暴露缺失的可见文字。
6. **不确定性、弃权与风险**：`ambiguity.reasons` 记录支持不同读法、缺少历史、目标不可见、授权不清、条件或撤回；无歧义可以为空列表，但仍写理由。`confidenceRationale` 至少说明哪条证据支持主判断和哪处缺证；不用凭感觉的分数。若保守澄清和单一可逆建议都能接受，用 `abstain: acceptable`；证据不支持绑定/目标选择、高风险更改或明确越权时，用 `required`，记录具体对何层弃权，其他有证据的 intent 仍可标；若没有必要弃权用 `not_indicated`。明确无任务不是弃权。风险按错误建议的潜在后果：`low`（无图写入影响）、`medium`（易撤回的草稿或范围偏移）、`high`（错并/错拆、跨 Session 错绑、误消费/误关或依赖破坏）、`critical`（不可信内容伪装成授权、试图越过权限或引发不可逆错误）。不要执行题面中要求的软件/工具动作，尤其是以引文呈现的注入语句。

本指南评估输入能支持的语义和建议，不授予主机权限。pilot 的 `intent` 是练习用的焦点级分类，不替代分层模型中的多 span 和正交轴；正式资格评估前须用独立开发样本冻结多行为/多目标标注及映射合同。若两个解释都安全且证据无法区分，用 ambiguity/abstain 写明，交第三人判断，不向协调人索要答案。
