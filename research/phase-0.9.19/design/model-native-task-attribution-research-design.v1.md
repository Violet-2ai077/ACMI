# ACMI Phase 0.9.19 Model-Native Task Attribution 研究设计

状态：`DRAFT_FOR_OWNER_REVIEW`。日期：2026-11-14，Asia/Shanghai。

本阶段验证：模型能否在正常回答用户问题的同一次生成中，持续、准确地识别并标记当前工作任务。这里的“自主”是指根据任务描述和对话证据选择身份、关系和弃权，不是要求模型猜出未提供的 UUID。

**本次交付仅为研究设计。** 未实现实验程序、生成正式数据集、冻结验证集、启动模型实验或取得机制可行性结论。以下协议、阈值、样本量和预算均为待批准方案；Owner 批准设计不自动等于批准模型执行、扩大评测或合入 main。

## 1. 范围与现有系统边界

### 1.1 当前基线

只读检查的主仓库为 `E:/codex-prj/ACMI/acmi`，HEAD 为 `9db1ee7da8209363a1fd76f3bebc83f75dfe9c9d`，检查时 main 工作区干净。本设计保存在仓库外的新交付目录，不修改 main 或旧实验材料。

可复用的边界如下，不把“可复用”理解为直接沿用旧实验结论：

| 现有文件，均相对于上述主仓库 | 已确认内容 | 本实验使用方式 |
| --- | --- | --- |
| `packages/contracts/src/index.ts` | `TaskId`、`RuntimeSessionRef`、`EventRef`、显式绑定与 `AttributionProposal` 分离 | 引用身份和证据坐标语义；新协议不扩展现有枚举 |
| `packages/contracts/src/task-graph.ts` | `WorkState`、WorkNode、关系及事件写入接口 | 复用状态词汇；明确 Task UUID 不等于 WorkNode ID |
| `packages/contracts/src/runtime-facts.ts` | `GraphProposal` 与正式 Graph 事件的来源、确认边界不同 | 实验结果保留 `model_proposed` 来源，不冒充 `host_confirmed` 或既有 `heuristic_proposed` |
| `docs/qualification/phase-0.9.10-deterministic-scoring.md` | 原始输出、Host 验证和正文成功分开评分 | 延续分层评分、零分母不报成功的原则 |
| `docs/experiments/phase-0.9.16-unresolved-link-report.md` | 报告记录了 Host 可解释引用、模型未采用引用的结果；当时未验证真实逐 token Streaming | 作为设计风险来源，不重新使用其样本，也不把其结果当作本次结果 |
| `docs/workspace-organization.md` | 稳定 main 与新工作树、历史证据分离 | 实现获批后才建立新工作树；历史路径不搬迁、不改写 |

现有 `AttributionAction` 不包含本研究的完整 BRANCH/MERGE 语义；现有 `GraphProposal` 也不是本协议的直接编码。本阶段使用独立的 `ResearchWorkStateV1`，不向生产接口强行兼容。

### 1.2 禁止事项

- 每个被评测的 assistant turn 只允许一次模型生成；不得在旁路、隐藏工具、修复器、摘要器或 Judge 中再调用 LLM。
- A/B 均不使用模型生成后的 JSON 修复、语义补全、自动重试、best-of-N 或从多个答案中挑选正确答案。
- 不写正式 Registry、Binding、Host Journal、Task Graph；所有状态变化都是实验提案。
- 只用全新合成数据。现有真实会话、用户文件、凭据和个人记忆不进入语料。
- 不启动真实子 Agent、外部工具执行或正式记忆检索；跨 Agent 测试使用隔离逻辑 Agent 与受控合成交接包。
- 不以 schema 正确、Host 能解析、服务稳定或主观“回答不错”代替归属正确。

## 2. 研究假设与可证伪条件

研究结论的单位为“固定模型与版本 × 固定协议 × 固定上下文条件”，不以一个模型代表所有 LLM。

| 假设 | 可观察证据 | 可证伪条件 |
| --- | --- | --- |
| H1 同次生成可行 | 同一请求的原始输出同时包含可显示答案和完整标记，单次调用账本可对账 | 要靠第二次生成、补写标记或替换答案才能完整；当前方案 H1 失败 |
| H2 任务识别有效 | 六类场景、三个难度的冻结语义指标通过第 10 节门槛 | 协议有效但归属、新建或弃权指标不过门槛；当前条件下 H2 未获支持 |
| H3 持续性有效 | 闭环连续轮次、重启及跨逻辑 Agent 交接保持原身份，错误不持续扩散 | 单轮通过但闭环、返回旧任务或恢复明显失败；不能声称“持续识别” |
| H4 不以牺牲回答换取标签 | 同任务 answer-only 对照下，回答断言通过率、完成率不明显下降 | 正文缺失、任务遗漏、答案串任务、标记泄漏或正文门槛失败 |
| H5 协议成本可用 | 真实增量流、Token、首个可见正文延迟和总延迟满足预注册预算 | 仅 buffered 成功、流式不完整或成本超过门槛；只能作离线可行结论 |

“失败”不自动等于模型能力不足。只有同次请求、上下文可见性、原始记录及评分可信后，才能讨论语义能力。信息不足时输出 UNRESOLVED 是正确行为，不计为失败；在证据充分时滥用 UNRESOLVED 则损害召回率。

## 3. 任务语义与公共协议

### 3.1 归属单位与身份

1. Task 是具有独立目标与验收边界的工作；普通步骤、改措辞、同一交付物的修订不默认成为新 Task。
2. 输入消息按自然段/列表项形成 `unit_id`；分段器只看语法边界，不读取标签，也不按任务切分。一个 unit 可以涉及多个任务。输入、单元 ID 和源坐标在运行前冻结。
3. 每个输入 unit 必须恰有一个 decision。decision 的任务集合允许多元素；`focus_task_id` 只表示本轮主工作，不能把整个消息压成单一标签。无唯一主工作时 focus 为 null。
4. 回答为有序 blocks。每个 block 引用一个或多个 decision，并单独声明任务集合或 UNRESOLVED。这样可以发现 User 归属正确、Assistant 归属错误，不从 User 标签自动填 Assistant 标签。
5. 既有 Task 使用输入目录中可见的、随机化的不透明 UUID。每轮额外提供固定 4 个未绑定 UUID 槽位，不论该轮是否需要新任务，避免槽位数泄露真值。
6. CREATE/BRANCH/新目标 MERGE 从槽位中选择 UUID，模型必须输出所选 UUID。Host 不发明任务，不替模型决定需要几个新任务。超出槽位预算的语料不进入本次正式集。
7. 真值为新 Task 预先分配 canonical UUID。评分仅允许按首次出生的 `(unit_id, operation, occurrence)` 建立 predicted UUID 与 canonical UUID 的一对一重命名；birth 位置和操作不匹配时不能建立映射。其后身份必须持续一致。映射仅在 Evaluator 内使用，不能反馈模型或修复提案。
8. 重命名消除任意新 UUID 的字符串差异，不宽免错建、重复建、关系错误或任务碎片化。记录 raw UUID exact、canonical identity score 两者，不把纯 UUID 猜测当作语义能力。
9. `WorkNodeId` 仅是可选来源上下文，本协议的 BRANCH 表示新 Task 分支，不是既有 Task 内的 `decomposes_into`。后者若无独立目标，仍应 CONTINUE。

### 3.2 六类操作的确定语义

一个 decision 包含有序 `actions`。有明确单次任务转移时 action 为单项；并行 unit 可含多个 action。集合顺序不重要，操作顺序重要。

| 操作 | 必填身份与前置条件 | 提案语义与负例 |
| --- | --- | --- |
| CONTINUE | `task_ids` 非空，属于上一确认/提案状态的活动集合 | 延续已有活动目标；加步骤、改格式不新建 |
| SWITCH | `from_task_ids`、`to_task_ids`；目标已存在，集合发生变化 | 提议活动集合切换，可从空集合进入已知任务；单纯提到别的任务不是 SWITCH |
| CREATE | 一个未绑定槽位 UUID、非空 objective、acceptance、当前来源 unit | 独立新目标，无 parent；已有任务复述不是 CREATE |
| BRANCH | 已有 `parent_task_id`、一个新 UUID、独立 objective/acceptance | 新 Task `branch_of` parent；不暗示 parent 完成或停止 |
| MERGE | 至少两个不同的 `source_task_ids`、唯一 `target_task_id` | 来源汇入已有目标或一个新槽位目标；生成 `joins_into` 提案。合并上下文不等于任务汇合；不自动关闭来源或接受结果 |
| UNRESOLVED | 空确定任务集合、reason、可选 candidate UUIDs、缺失证据说明 | 不选择候选、不产生身份关系或状态变化；`no_task` 用专门 reason 区分非工作消息与歧义 |

UNRESOLVED reason 固定为 `ambiguous_reference`、`insufficient_context`、`conflicting_evidence`、`unknown_task`、`no_task`。候选集合不是正式归属，不能计算为 TP。

同一 unit 内“已确定部分 + 未决部分”通过 `resolved_scope_quotes` 与 `unresolved_scope_quotes` 表示；两组引文必须来自该 unit，禁止把未决部分分给已确定任务。主集冻结这类局部混合样本的范围；完整决策语法不能表达范围时判 schema/semantic failure，而不是忽略。

### 3.3 公共 work_state 数据结构

以下是协议的数据字段规范，不是对现有 TypeScript Contracts 的修改：

```text
ResearchWorkStateV1 {
  schema_version: "acmi-research-work-state-v1"
  turn_id: string
  base_state_id: string
  decisions: Decision[]
  proposed_active_task_ids: UUID[]
  focus_task_id: UUID | null
  status_updates: StatusProposal[]
}
Decision {
  decision_id: string
  unit_id: string
  actions: Action[]
  task_ids: UUID[]
  resolved_scope_quotes: string[]
  unresolved_scope_quotes: string[]
  unresolved: {reason, candidate_task_ids: UUID[], missing_evidence: string} | null
  evidence: {source_id: string, quote: string}[]
  self_reported_confidence: "low" | "medium" | "high" | "not_reported"
}
StatusProposal {
  task_id: UUID
  from: WorkState
  to: WorkState
  evidence: {source_id: string, quote: string}[]
  status: "proposed"
}
AnswerBlock {
  block_id: string
  decision_ids: string[]
  task_ids: UUID[]
  unresolved_reason: UnresolvedReason | null
  text: string
}
```

- `Action` 为按第 3.2 节区分的封闭联合类型，字段名使用表中名称；CREATE/BRANCH/新目标 MERGE 另有 `objective`、`acceptance: string[]`。UNRESOLVED action 仅含 `op`，细节在 decision.unresolved。CONTINUE 使用 `task_ids`。所有对象禁止额外字段、重复键和非有限数字。
- `Decision.task_ids` 是 actions 的当前工作目标并集：CONTINUE 的集合、SWITCH 的 to、CREATE/BRANCH 的新 UUID、MERGE 的 target。关系来源不是自动归属目标。纯 UNRESOLVED 必须为空。局部混合可包含 UNRESOLVED 与已确定 action，但每个范围分别有证据。
- `base_state_id` 由 Harness 给出并原样回显；只用于发现陈旧/串 Session 状态，不是权威任务真值。
- `proposed_active_task_ids` 与操作应用后的活动集必须一致。CREATE/BRANCH/MERGE 默认增加目标，不删除其他活动任务；只有 SWITCH 或有证据的显式状态提案移除活动任务。focus 必须在活动集中或为 null。
- `WorkState` 复用 `planned/ready/running/blocked/completed/failed/cancelled/superseded`。只允许输入证据支持的 from/to；“已经修好了”的模型正文不构成已验证完成证据。
- evidence 引用当前可见来源 ID 和原文引文，不要求模型计算字符 offset。确定性 resolver 验证引文与 source 一致，记录实际 offset；多次出现且无法唯一定位时证据无效，不按语义模糊匹配。
- 状态、关系、创建和切换均包在 `status=proposed`、`provenance=model_proposed` 的归档 envelope 内。该 envelope 由 Harness 添加，不充当模型生成证据。
- confidence 仅为自我报告；不作真实概率，不按它过滤主成绩，不用它调门槛。只做错误分布交叉表。
- 规格上限：每轮 8 个输入 units、每 unit 恰好 1 个 decision、全轮合计最多 16 个 actions、16 个 answer blocks、8 个既有候选、4 个新 UUID 槽位；精确字节/Token 限额随执行清单冻结。溢出不截出“可用部分”冒充完整有效。

### 3.4 A 方案 Structured Sidecar

同一次生成输出一个完整 JSON 对象：

```json
{
  "answer": [{"block_id":"b1","decision_ids":["d1"],"task_ids":["11111111-1111-4111-8111-111111111111"],"unresolved_reason":null,"text":"超时值为 300 ms。"}],
  "work_state": {
    "schema_version":"acmi-research-work-state-v1",
    "turn_id":"t2",
    "base_state_id":"s1",
    "decisions":[{"decision_id":"d1","unit_id":"u2.1","actions":[{"op":"CONTINUE","task_ids":["11111111-1111-4111-8111-111111111111"]}],"task_ids":["11111111-1111-4111-8111-111111111111"],"resolved_scope_quotes":["继续网关超时修复，计算 3 次各 100 ms 的总时长。"],"unresolved_scope_quotes":[],"unresolved":null,"evidence":[{"source_id":"u2.1","quote":"继续网关超时修复"}],"self_reported_confidence":"high"}],
    "proposed_active_task_ids":["11111111-1111-4111-8111-111111111111"],
    "focus_task_id":"11111111-1111-4111-8111-111111111111",
    "status_updates":[]
  }
}
```

主比较 A 使用普通文本生成 JSON，不开启 A 专有 constrained decoding，避免把协议与后端约束能力混淆。若 Owner 另批 native JSON Schema/grammar 臂，记为 A-constrained，独立报表，不能并入 A 成绩。

流式增量解析只在字符串 escape 和字段边界可确认时发出 answer.text 增量，不将 JSON key、UUID 或 sidecar 发给用户。最终完整对象未闭合/验证失败时，已显示正文保留并标为“元数据未完成”；提案不进入下一轮实验状态。整包等完再显示只能算 buffered，不算真实流式成功。

### 3.5 B 方案 Native Inline Marker

同一次生成输出专用应用层帧，标记可在正文块之间出现，而非最后由 Host 追加：

```text
<|acmi:decision:v1|>{完整 Decision JSON}<|acmi:end|>
<|acmi:answer:v1|>{AnswerBlock 元数据，不含 text}<|acmi:text|>用户可见正文<|acmi:end|>
<|acmi:decision:v1|>{下一条 Decision JSON}<|acmi:end|>
<|acmi:answer:v1|>{下一块元数据}<|acmi:text|>后续正文<|acmi:end|>
<|acmi:commit:v1|>{schema_version,turn_id,base_state_id,decision_ids,proposed_active_task_ids,focus_task_id,status_updates}<|acmi:end|>
```

- 这里的 Native 指模型原生生成标记，不声称 tokenizer 中存在这些 special tokens。无需微调或修改 tokenizer。
- decision 必须先于引用它的 answer；完整 commit 恰好一个、位于末尾，枚举且仅枚举已出现的 decision IDs。任何帧外文本、重复 ID、未知引用、嵌套帧、额外 commit 或不完整帧均判协议失败。
- 在 text 帧内仅解释结束标记；字面反斜杠用 `\\`，字面 `<|acmi:` 前缀用 `\<|acmi:` 转义。解析器按 escape 状态识别，不在最终全文中用简单正则删除标记。
- marker JSON 内禁止未转义的原始 `<` 字符，必须用 JSON Unicode escape 编码，避免字符串中的控制前缀撞帧。
- 增量解析必须容忍 UTF-8 字节、JSON escape 和标记被任意网络 chunk 切开，缓冲可能成为控制前缀的最短后缀。用户只看到解码后的 text。
- B 的逐块提案可暂存，但最终 commit、引用和结构都通过前不进入闭环状态。截断不能把前半段成功当成整轮成功。
- B 与 A 使用同一 work_state 语义、候选、证据、正文要求与资源上限。两者输出顺序不同是协议的组成部分，不能把 A/B 差异完全归因为“模型能力”。

## 4. Ground Truth 生成、冻结与隔离

### 4.1 真值先于自然语言实现

先由人工制定场景事件脚本，包含初始任务目录、目标边界、当前活动集合、输入 units、证据可见性、分支/汇合和状态变化；再撰写自然对话。确定性生成器负责 UUID、位置排列、算术/表格事实和渲染，不由被测模型或另一个 LLM 生成主评分标签。

每个 scenario 必须包含：

```text
scenario_id, family_id, split, category, difficulty
canonical_tasks: UUID + objective + acceptance + initial_status
initial_active_ids, sessions, logical_agents
frozen_reference_dialogue: 完整 system/context/user/reference-assistant 消息
turn_schedule: 用户输入、恢复点、交接点、可见来源、资源预算
oracle_by_turn: 每 unit 的任务集合、操作、focus、active 集、状态、关系
birth_events, switch_points, canonical_task_relations
forbidden_assignments: 每 unit 的禁止 UUID/禁止新建/禁止关系
answer_assertions: 必须事实、禁止事实、必须覆盖的 unit、澄清条件
allowed_equivalences: 事前列明的有限等价形式
provenance, review_record, hashes
```

不允许归属的负例必须显式标注：同名异任务、已否定候选、仅作引用的任务、不同 workspace 的诱饵、已关闭且未请求重开的任务、普通步骤误建任务、无证据汇合、非工作聊天。不得因实际输出“也有道理”事后扩展 allowed_equivalences。

### 4.2 人工审定与验证集保管

- 数据作者与真值审定者应为不同人员，由 Owner 指定。两人分歧须在冻结前解决；仍无法决定的输入保留为 UNRESOLVED 或排除并记录原因，不能看模型结果再处理。
- 当前对话给出的样例全部标记 `illustrative/dev-only`，不得进入验证集。
- 按 `family_id` 分割开发/验证，不按 turn 随机拆分。共享事件骨架、同义改写、UUID 重命名、位置变化和相同对话模板的样本必须在同一 split。
- 验证集内容及标签由保管者封存；提示词开发者只能看到覆盖统计、协议、预算和预检结果，不能看到逐题输入/输出或逐题成绩。验证运行器只接收公开 input 分区，评分器才读 oracle 分区。
- 公开清单包含文件路径、字节长度、SHA-256、生成器版本、人工审定记录、分组划分、模型/协议/prompt/evaluator hash 和执行顺序种子。先签署冻结清单，后执行验证。
- 一次解封对应一个预注册结论；验证结果一旦被用于提示词修订，该集永久降为开发/诊断集。新提示需新保管集，旧结果仍完整报告。
- 若无法提供隔离保管或人工审定，只能运行探索性研究，不能宣称确认性 GO。

### 4.3 “完整输入冻结”与真实闭环的区别

不能把尚未发生的模型回答提前冻结，也不能把逐轮注入正确历史误称为自主持续性。本设计分别记录两条轨道：

1. **FROZEN-REPLAY：** 每个被评测 turn 的完整输入字节事先冻结，包括参考 assistant 历史和初始状态。前一轮模型输出不进入后一轮。用于测单轮识别和协议的受控上限，不能单独支持持续性结论。
2. **CLOSED-LOOP：** 初始完整对话、未来所有用户消息、合成事件、恢复/交接点、上下文选择算法和 oracle 事先冻结；以后输入包含该臂实际已生成的正文和模型提案。因此未来完整请求在生成时才确定。每次调用前存档实际完整请求和 SHA-256，再发出生成；不使用 oracle 修正历史。主 GO 必须依赖此轨道。

两轨都保留完整参考对话。报告明确区分“事前冻结参考输入”和“运行时不可变的实际输入”。若 Owner 要求所有实际请求字节也必须在任何生成前冻结，则只能选择 FROZEN-REPLAY，并将“持续、自主”的最终问题判为尚未验证，不能偷换概念。

## 5. 场景矩阵与样例

难度不只由长度定义。简单：1–2 候选、直接目标、短上下文；中等：3–4 候选、非相邻回指/一次切换干扰；困难：5–8 候选、近似目标、否定证据、并行与恢复/交接，或者明确证据缺失。关键证据存在和缺失的困难样本分别计数。

### 5.1 六类乘三个难度

| 场景 | 简单 | 中等 | 困难 |
| --- | --- | --- | --- |
| 单任务连续 | 同目标连续修改，CONTINUE | 引用别的项目作比较，但不切换 | 同名历史任务、长间隔后返回；修订不得 CREATE |
| 多任务切换 | 明示 A→B→A | 通过交付物回指，不重复任务名 | A/B/C 交错、否定旧 focus、恢复后返回原 UUID |
| 多任务并行 | 同轮明确处理 A 与 B | 各自计算/约束，分块回答 | 多 unit 混合、部分未决、迟到合成结果指向旧任务而非当前 focus |
| 新任务产生 | 独立新交付物 CREATE | 旧任务扩写 CONTINUE 与真正 CREATE 的最小对照 | 名称近似而验收不同；候选均不合适，不能选最近者 |
| 分支与汇合 | A→B BRANCH，或 B/C→A MERGE | 父任务继续活动、分支独立完成 | 多层分支、汇回既有/新目标、只有引用/依赖而禁止 MERGE |
| 模糊与不足 | “继续那个”且两个同等候选 | 部分可识别、部分需澄清 | 证据删除、相互冲突、跨 Agent 缺权限/缺来源；UNRESOLVED |

每个单元格均包含负例和对照，不把六个操作与六类场景一一机械对应。

### 5.2 可审阅的具体样例，均不进入验证集

下面简写 UUID：A=`11111111-1111-4111-8111-111111111111` 为网关超时修复；B=`22222222-2222-4222-8222-222222222222` 为账单 CSV 导出；C=`33333333-3333-4333-8333-333333333333` 为 CSV 性能基准。正式请求显示完整目录，不显示“正确目标”。

| 类型 | 已知状态与当前输入 | 冻结期望 | 禁止归属/行为 |
| --- | --- | --- | --- |
| 连续 | active={A}；“继续网关超时修复，把 3 次各 100 ms 的总时长算出来。” | CONTINUE A；回答 300 ms | B；CREATE；把计划写成 verified completed |
| 切换 | active={A}；“超时先放下，回到账单 CSV，列名仍是 date 和 amount。” | SWITCH {A}→{B}；返回 A 时复用 A | 继续 A；给 B 换新 UUID |
| 并行 | active={A,B}；“网关取 3×100 ms；账单统计 2+5 行。分别给结果。” | 同 unit 两个 CONTINUE；A=300 ms，B=7 行；focus=null | 只标 A；将 7 行归给 A |
| 新建 | 已知 A/B；“另起一个独立交付：CSV 性能基准，验收 p95 小于 50 ms。” | CREATE 新槽位→canonical C；不虚构 parent | CONTINUE B；仅因 CSV 同名就合并 |
| 分支/汇合 | active={B}；“从账单导出分出独立性能基准，父任务继续。”随后明确“把基准与格式检查两个分支汇回账单交付。” | 首轮 BRANCH C branch_of B；后轮两来源 MERGE 到 B，保留来源身份 | 首轮无 parent CREATE；后轮自动关闭来源或 join accepted |
| 模糊 | 两个任务标题都是“导出修复”，无唯一证据；“继续那个导出修复。” | UNRESOLVED ambiguous_reference；澄清两个目标的区分 | 任意 UUID；CREATE；把 confidence 当作依据 |

并行/恢复数据中出现的工具结果只是冻结的合成输入事件；没有实际执行工具，不能宣称验证了生产工具路由。跨 Agent 场景测试记忆交接识别，不宣称验证并发 Agent 的共享存储一致性。

### 5.3 建议规模与配额

- 开发集：18 个单元格 × 3 个独立故事 × 6 个评分 turn = 324 turn。
- 保管验证集：18 × 6 个独立故事 × 8 turn = 864 turn，108 个独立故事。
- 每个难度 36 个验证故事；每个难度的 CREATE、SWITCH、UNRESOLVED 真例各至少 30 个，BRANCH、MERGE 各至少 20 个；至少 30 个可产生碎片化的持续任务和 30 个显式禁止归属机会。配额不是额外样本，设计时满足，否则不得冻结。
- 每单元格 6 个故事分为 2 个不重启、2 个同 Session 进程恢复、2 个新 Session/逻辑 Agent 交接。交接包含完整证据与不足证据两种，不足者真值为 UNRESOLVED。
- 预选每单元格 1 个故事进入 FROZEN-REPLAY 诊断子集，共 18×8=144 turn；选择在模型执行前完成。
- 每臂重复 3 次，使用预登记随机种子；模型不支持 seed 时记明并保留调用顺序。重复不是新的独立故事，不能把 3 次运行计作 3 倍统计样本量。
- 这是待批准的确认性规模，不在本轮执行。其统计能力不保证证明极低错误率；报告聚类置信区间和样本支持，不以零观测错误宣称零风险。

## 6. 确定性 Evaluator

### 6.1 评分流程

Evaluator 是无网络、无模型、只读原始输入/响应及冻结 oracle 的独立程序。运行器和评分器不共享语义归属判断实现；允许共享冻结类型定义，不共享把坏输出“修好”的代码。

固定处理顺序：证据完整性 → 原始语法 → 引用/集合一致性 → 出生身份重命名 → unit 归属 → action/关系/状态 → answer 覆盖和事实断言 → 连续性/聚合。最终报告保留每一层结果，不只显示 guard 后的安全输出。

- 主分数采用原始模型输出。Host 降级、丢弃或维持旧状态不能变成模型正确。
- 完整 marker 无效的 turn 在主语义分数中按“没有有效预测”处理，导致应有归属 FN、switch/action exact=0。可读取的错误身份尝试另计 unsafe attempt，不因 parse 失败消失。
- 同时给出 valid-only 语义分数以分离协议与语义，但它不能替代全尝试分母成绩。
- 无输出、超时、拒答、输出截断均保留；禁止当作正确 UNRESOLVED。
- 重复 predictions 按多重集计 FP；缺失 units 计 FN；重复键拒绝解析，不采用 last-write-wins。
- 无定义分母返回 null/N/A，并列出支持数；不能将 0/0 当作 100%。

### 6.2 指标的精确定义

令每个输入 unit 的 gold 确定任务集合为 G，模型有效集合为 P；局部混合只对已冻结范围评分。已知 UUID 直接比较，新生身份按第 3.1 节映射。

| 指标 | 定义 |
| --- | --- |
| Attribution Precision / Recall / F1 | TP=Σ\|P∩G\|，FP=Σ\|P−G\|，FN=Σ\|G−P\|；按标准比率计算。分别报告 User unit 和 Assistant 必须覆盖 unit 的角色分数，另报 macro-story 和 micro 汇总 |
| Assistant attribution | 对 gold 要求回复的每个 unit，收集引用它的 answer blocks 任务多重集，与该 unit 的 expected assistant tasks 比较；遗漏回复为 FN，额外/错误身份为 FP。clarify/no-task 有独立期望，不能直接复制 User 真值 |
| Task Switch Accuracy | gold SWITCH turn 中，预测操作、from/to 集合与切换位置全部正确的比例；另报非切换 turn 的误切换率，避免靠“从不切换”获得高分 |
| New Task F1 | 对每个 birth event 精确匹配 unit、操作及一对一新身份。错建为 FP，漏建为 FN；CREATE 单列，BRANCH/新目标 MERGE 的 birth 另列及合计 |
| Unresolved Precision / Recall | 对输入 unit/冻结局部范围的显式 UNRESOLVED 做二分类；`no_task` 和证据不足分别分层，并报告 reason exact；无效输出不是 UNRESOLVED |
| Task Fragmentation Rate | gold 原本应持续的任务中，被分配两个及以上预测身份或遭重复 CREATE 的任务数 / 可评持续任务数。另报每任务 excess identities 和身份全缺失率，避免用不归属压低碎片率 |
| Cross-task Contamination Rate | 对 G 非空的 unit，指向其他已知 Task 的错误归属边数 / 所有预测的已知 Task 归属边数；新建错误另计碎片/false birth。另报被污染 unit / 所有有明确 gold 的 unit，以及 UNRESOLVED/负例上的错误归属率 |
| Marker Schema Validity | 全部必需字段、帧、类型、引用和跨字段约束有效的 turn / 所有计划执行 turn；另分 syntax validity、semantic-reference validity 和条件于实际收到输出的比率 |
| Streaming Completion Rate | 收到真实增量、增量解析安全、最终 answer 与 marker 完整、正常结束的 turn / 所有计划 streaming turn；最终完整但全程 buffered 不计流式成功 |
| Token Overhead | 相对独立 answer-only C 臂的输入、输出、总 usage 的配对差值及百分比；另统计 marker/包装/协议提示词 token。推理 token 若 provider 报告单列；未报告则 unknown，不当成零 |
| Latency | 单调时钟记录 request→首传输字节、首可见正文、首完整 marker、完整 marker、正文完成、请求结束、端到端；各报 p50/p95 和相对 C 的配对差值 |

额外必须报告：六操作混淆矩阵；关系三元组 precision/recall/F1；状态更新 exact；活动集合/focus exact；forbidden assignment rate；User/Assistant 双角色联合正确率；恢复前后 UUID exact；每个故事所有 turn 正确的比例；首错 turn；首错后错误持续长度；正文断言通过率；控制标记泄漏率。

Assistant 分数检查的是模型声明的关联与固定响应义务，不声称它证明了任意自由文本每个句子的真实主题。正文的实际跨任务事实错误通过下述 answer probes 另测。

### 6.3 正文质量与防止标签“替代工作”

为每轮预先定义可确定判断的正文任务：算术结果、精确列表/键值、给定事实的约束、不得出现的另一任务数值、必要输出项。多任务答案必须分别包含正确结果且不能互换；正确任务 ID 配错正文同样失败。

自然语言澄清接受事前登记的多种表达，不仅凭是否出现问号；否定语境、引用文本、全列候选刷命中必须有负测试。判断器只能保证这些受控任务的要求，不给开放式写作、文笔或整体帮助性打分。可由人类做盲法补充观察，但不能改动冻结主成绩，也不使用 LLM Judge。

### 6.4 聚合、区间与反作弊测试

- 每一指标输出 category × difficulty 的 18 格结果、三个难度结果、按恢复/交接分层结果、每次重复及总体结果；列分子、分母、缺失数。
- A/B/C 同一故事、同一重复配对。随机化各故事臂执行顺序；同一故事内部严格时间顺序，不跨臂共享缓存状态、会话或模型提案。
- 用固定种子的分层 story-cluster bootstrap，10,000 次，计算 95% 区间和配对差值区间；每次抽样整故事携带全部 turn 和重复。不把 turn 当独立样本。
- 极少/零错误时另给独立故事层面的单侧精确上界，避免 bootstrap 产生虚假的零宽度“零风险”。报告观察率与风险上界，不宣称总体错误率为零。
- 验证集开封前固定测试：全弃权、全 CONTINUE、全 CREATE、固定首候选、所有任务全选、只复制 User 标签、重复 UUID、错源引用、伪造完成、漏 block、正确数字错任务、marker 注入、截断与重复键。Evaluator 必须对它们给出预期失败。
- 给定同一原始归档，评分两次必须逐字节一致；时间戳、路径和运行机器信息进入独立元数据，不混入确定性分数文件。

## 7. 最小 Harness 架构

实现仅在 Owner 批准后进行。建议工作树 `E:/codex-prj/ACMI/worktrees/model-native-attribution-research`，独立 `research/phase-0.9.19/` 模块，不接入正式 Host 启动链。

```text
dataset/public inputs ─→ context builder ─→ single-call model adapter
                              ↑                       │
                        experiment ledger             ↓
                              ↑               raw byte/chunk recorder
                      proposal-only reducer           ↓
                              ↑               A/B incremental parser
                              └──────── validated proposal + visible answer

sealed oracle + immutable raw archive ─→ independent evaluator ─→ report
```

### 7.1 模块职责

| 计划文件，相对于新工作树 | 职责与验证重点 |
| --- | --- |
| `research/phase-0.9.19/protocol/` | 公共 schema、A/B wire grammar、流式状态机；截断/escape/重复键/帧注入测试 |
| `research/phase-0.9.19/corpus/` | 公开 fixture 生成、family split、只读真值接口；不把 oracle 打包进请求 |
| `research/phase-0.9.19/context/` | 单一确定性上下文选择策略、证据来源表、完整性预检；不使用 LLM 摘要 |
| `research/phase-0.9.19/runner/` | 单次调用预算、顺序、隔离会话、真实流采集、暂停和恢复；无隐式重试 |
| `research/phase-0.9.19/ledger/` | append-only 实验提案、checkpoint、校验和链；不实现生产 writer |
| `research/phase-0.9.19/evaluator/` | 原始协议读取、确定性匹配、指标和决策；不导入模型 adapter |
| `research/phase-0.9.19/tests/` | 人工构造输出、mock transport、故障注入、评分 goldens |
| `research/phase-0.9.19/report/` | 按预注册模板生成机器 JSON 与人读报告，不改原始记录 |

优先使用现有 Node/TypeScript 工具链与测试风格，具体依赖及版本在实施时依据锁文件确定。这里只定义研究模块边界，不新增生产接口或默认启动服务。

### 7.2 同次生成证明

每条 scored response 归档唯一的 `attempt_id`、请求摘要、开始/结束时间、provider request/generation ID（存在时）、原始响应、流事件及 usage。答案与标记必须是该响应的可定位子串/JSON 字段，不能来自两条响应的拼接。

runner 有全局预算计数器，每 turn `max_generation_calls=1`。禁用 SDK、代理和 runner 自动重试，记录实际请求数。连接失败也消耗 attempt，保留原始失败；不能补跑挑好结果。若服务端内部是否重试不可观察，报告证明边界为“一个客户端生成请求”，不得声称已经证明后端只做一次解码。需要端到端强证明的确认实验必须选可核对服务日志的环境。

独立 answer-only C 臂只为测量正文、Token 和延迟；它不接收 A/B 输出、不补标签、不评判模型、不参与 A/B 生成。C 不是被禁止的第二次归属调用。

C 使用相同初始任务目录、外部用户消息、冻结事实与正文要求，但仅生成自然语言回答，不输出任何任务标记，也不运行提案 reducer。C 的历史只含其自己的实际正文；A/B 的标记提示和提案上下文均算入开销。需要分任务呈现的正文要求（例如自然语言标题）对三臂一致，不能依赖 C 不具备的隐藏 block metadata 来评分。闭环三臂的历史会自然分化，因此成本/质量比较反映端到端方案差异；受控 A/B 序列化比较另外使用相同输入历史的 FROZEN-REPLAY 子集。

### 7.3 闭环状态、恢复与交接

- 实验 reducer 只根据语法/引用有效的模型提案更新 **tentative ledger**，即使语义错误也保留并带入后续轮次。它不读 oracle；不把“合法”改成“正确”。
- 无效整轮标记不更新 ledger，原始正文仍作为已发生的模型输出保留。下一轮看到 metadata_invalid 及上一次有效提案状态；这种 fallback 的成绩单列。
- 主轨上下文包含所有可容纳的历史正文、提案来源标识和当前候选目录；固定截断策略及最大窗口，关键证据不可静默丢弃。预算不足是实验条件错误；专门证据缺失样本则是合法 UNRESOLVED 条件。
- 同 Session 恢复使用真实新进程，从持久化记录恢复到已提交 turn 边界；比较恢复输入 hash、UUID、顺序和 source refs。新 Session/Agent 仅获得预登记交接包，不能读对方隔离目录。
- 交接包由确定性算法提取先前原始正文、任务目录和带 `model_proposed` 标识的提案，不由 LLM 写摘要，不使用正确真值状态补丁。
- 进程中断在已完成 turn 后进行。流中取消是单独故障测试：保留 partial response、拒绝提交，不重发相同 turn；断线后重新生成不能算原生成的“恢复”。
- closed-loop 对原始事件真值评分，另外计算“相对于模型自身错误状态的内部一致性”。后者只用于诊断，不能让前一轮错误成为下一轮的新真值。

### 7.4 原始证据目录

运行证据新建于 `E:/codex-prj/ACMI/verification/phase-0.9.19/<run_id>/`，路径不复用旧阶段：

```text
manifest.json                 冻结 hash、模型版本、参数、环境、顺序、预算
inputs/<attempt>.json         实际完整 system/user/context/history 请求，不含认证头
transport/<attempt>.jsonl     原始增量顺序、字节/文本、单调时间、结束原因
outputs/<attempt>.raw         未经修复的原始模型输出
parsed/<attempt>.json         解析结果、校验错误、可见正文、提案
ledger/events.jsonl           实验提案及因果来源，不覆盖旧行
checkpoints/                  断点、恢复票据和 hash
usage/attempts.jsonl           全部调用/错误/取消/Token/时间账本
evaluation/                   逐题评分、难度/场景统计、区间、决定
integrity/                    文件摘要、前后隔离检查、离线重放证明
```

完整研究输入输出必须保留；API secret 不是研究输入，不写入归档。归档只含合成数据并受限访问，公开包可以脱敏机器/路由标识，但原始受控归档不能被公开包替代。写入采用新文件/追加，存在同名 run 时拒绝覆盖。

## 8. 实验执行计划与批准关卡

### Gate 0 当前交付与暂停

- [x] 只读核对当前仓库 Contracts、相关研究边界和工作区约定。
- [x] 提交本研究设计及待审条件。
- [ ] Owner 审核协议、真值语义、闭环冻结定义、阈值和阶段预算。

**到此暂停。后续所有步骤均未执行。**

### Gate 1 获批后的离线实现

建立新工作树，只实现研究 Harness。先写协议/评分反例测试，再实现解析、ledger 和 runner。使用人工 fixture、fake transport，不调用模型。以最小测试先验证：一次请求限制、A/B 等价语义、身份映射、全弃权不能过门槛、重启可重放、非法提案不能写正式 Graph。

交付离线测试报告、实现 diff、精确文件清单。是否安排独立代码评审由 Owner 决定；默认由实施者自查，不未经授权启动评审代理。

### Gate 2 开发集与协议选择

Owner 单独批准一个模型快照、后端、路由、Token/时间/费用上限后，才运行开发集。最多 2 轮 prompt revision，每个协议相同调试额度；最多 600 次开发生成调用，包含失败。prompt 修改原因、前后文本及全部失败输出归档。

开发范围允许修协议实现错误，但不能查看验证内容。若两次修订仍不稳定，停止并报开发条件 NO-GO，不无限堆提示词。保管者冻结验证材料；研究者冻结两协议的最终 prompt、parser、evaluator、上下文策略、模型参数与门槛。开发样本不进入最终成绩。

### Gate 3 小批机制验证

从专用开发场景预选 18 turn，每臂 A/B/C 各一次，共 54 次，计入上述 600 次额度。必须有真实流、截断 fixture、至少一次进程恢复与一次交接。

进入确认批次的硬条件：A/B 36/36 同请求对账、无修复/重试、无控制标记泄漏、零正式写入、完整证据、关键协议测试通过。语义低分必须报告，但不能借机查看验证题或降低门槛。机制不通过则停止，修复回开发并重新冻结。

### Gate 4 单独授权确认性评测

拟议上限：

- CLOSED-LOOP：864 turn × 3 臂 A/B/C × 3 重复 = 7,776 次。
- FROZEN-REPLAY：144 turn × A/B × 3 重复 = 864 次。
- 确认性合计最多 8,640 次；加开发最多 600 次，全阶段最多 9,240 次生成。不可观察失败不追加次数。
- 每次预登记最大输入 8,192 token、最大输出 2,048 token，实际模型须支持相应总窗口；确认批次理论保守上限 88,473,600 token，不能把这当作已批准开销。
- 冻结模型/后端后由开发测量推算实际 Token、总时长和费用，提交 Owner 批准更紧的全局预算。**若 Owner 未批准，确认批次不启动。** 缩小样本须在解封前发布新设计，并接受统计支持可能不足。
- 单并发；每次超时 120 秒、运行总墙钟上限 72 小时、累计预算达到批准值即停。具体模型如不适合该时限，须在解封前修订，不在看到成绩后延长。
- 主比较保持相同模型、采样、tokenizer、上下文预算；语义说明相同，只替换序列化说明。禁止按臂设置更高推理预算或只给一臂额外候选。

不可变停机条件：完整性 hash 不符、额外生成、真实数据混入、写入越界、oracle 泄漏、模型版本变动、失去原始记录、批准预算耗尽。保留已运行记录，结果标记 partial/invalid；不得用一个“更干净”的重跑覆盖。

### Gate 5 离线评分与报告

关闭模型访问后执行确定性评分和重放。生成分层成绩、失败例、A/B 配对比较、成本和置信区间、GO 决定及归因证据。原始研究问题不能由执行日志或测试通过数代答。

只有 Owner 再次批准，才能设计下一轮全新保管集、增加模型、开启受约束解码臂或研究正式集成。研究 GO 不是允许接入生产的授权。

## 9. 失败分类与归因

| 编码 | 类别 | 例子与判断证据 |
| --- | --- | --- |
| E-* | 实验条件/证据 | request 缺失、版本漂移、预算截断、不可观察重试、真值泄漏；对应批次不支持能力判断 |
| P-* | 协议/序列化 | 重复键、帧错误、JSON escape、字段缺失、commit 不完整、marker 泄漏 |
| C-* | 上下文/连续性 | 输入未包含必要证据、交接来源丢失、UUID 截断、错误提案累积、恢复读取错误 |
| M-ID | 身份归属 | 证据存在且协议有效，却选错/漏选已有任务 |
| M-SW | 切换 | 被提及任务误当当前任务、漏切换或错误恢复旧任务 |
| M-NEW | 新建/碎片化 | 普通步骤误 CREATE、独立目标被吸收、重复创建同一任务 |
| M-REL | 分支/汇合 | parent/source/target 错、错误跨任务合并、将引用关系当汇合 |
| M-U | 弃权 | 缺证据仍选 UUID，或证据充分却持续 UNRESOLVED |
| M-STATE | 状态 | 无证据声明 completed、来源状态不一致 |
| A-* | 回答行为 | 标签正确但正文缺失、事实串任务、遗漏用户工作或违背固定断言 |
| S-* | 流式/运行 | 服务断流、chunk 解析错误、结束事件缺失、完成但并非真 streaming |
| G-* | 真值/评分缺陷 | oracle 矛盾、模板泄漏、断言误伤、匹配器错误 |

归因顺序：先 E/G，再 S/P，再检查实际输入 C，最后才讨论 M/A。每个错误可多标签，主因必须附原始输入/输出位置及最早失败边界。

预注册诊断，不事后用失败题调提示词：

1. 同一完整原始输出离线改 chunk 边界仍失败/成功，可定位 parser，而不是模型。
2. FROZEN-REPLAY 通过、同故事 CLOSED-LOOP 失败，提示连续性/错误累积因素；仍需查输入，不能直接断言模型记忆能力不足。
3. 事前构造“证据存在/证据缺失”配对，观察 CONTINUE/SWITCH 与 UNRESOLVED 是否随证据改变；不临时为失败题加答案线索。
4. A 有效、B 语法失败而语义相近，支持协议敏感性；两臂有效却都错，支持当前模型/上下文条件下语义不足，不证明所有协议或所有 LLM 不可行。
5. 若发现冻结 oracle/evaluator 实质缺陷，发布版本化勘误，原结果保留。修正后的结果只作探索性重评分；确认结论须新保管集，不能悄悄把失败变通过。

## 10. GO / NO-GO 判定标准

以下阈值是本研究的拟议工程门槛，不是从既有结果推导的统计事实。Owner 必须在验证解封前批准。A/B 各自判定；一个通过只支持该协议/模型/条件，不以另一臂失败拖低它，也不挑选单次重复作为最佳成绩。

### 10.1 完整性硬门槛

单次生成对账、零额外归属生成、零事后修复、零正式 Graph/Binding 写入、零真实数据、零 oracle 泄漏、完整原始证据，均为 100% 要求。控制标记/UUID 元数据意外显示给用户为 0。任一违反则当前执行路径 NO-GO 或批次 INVALID，不讨论用平均分抵消。

### 10.2 语义与连续性门槛

下表须 CLOSED-LOOP 的简单、中等、困难三个分层**各自**达到；User 与 Assistant attribution 分别达标，不只看合并平均值。

| 指标 | 每难度拟议门槛 |
| --- | --- |
| Attribution Precision / Recall / F1 | ≥0.95 / ≥0.90 / ≥0.92 |
| Task Switch Accuracy；误切换率 | ≥0.90；≤0.02 |
| New Task F1，含各 birth 类型分报 | ≥0.90 |
| Unresolved Precision / Recall | 均 ≥0.90 |
| Task Fragmentation Rate | ≤0.05，且不是通过丢失归属降低 |
| Cross-task Contamination Rate | ≤0.01；显式禁止归属的观测错误数必须为 0 |
| BRANCH / MERGE 关系 F1 | 分别 ≥0.90；任何无证据高风险 MERGE 为 NO-GO |
| 状态提案 exact | ≥0.90；无证据宣告 verified/accepted 为 0 |
| 重启/交接后身份 exact | ≥0.95，信息不足组按正确 UNRESOLVED 计 |
| 故事全部轮次双角色/操作正确 | ≥0.75 |
| Marker Schema Validity | ≥0.99，重复执行中的每次整体均 ≥0.98 |
| Streaming Completion Rate | ≥0.99；不得用 buffered 替代 |

每个 18 格 Attribution F1 另需 ≥0.85，防止同难度其他场景遮盖单一场景崩溃。对表中指标未达到第 5.3 节最低配额或区间不可估的分层，不宣称该分层通过。

不只看点估计：三个难度的 Attribution F1 单侧 95% 聚类下界还应 ≥0.85；A/B 的正文通过率相对 C 差值下界不得低于 −0.05。罕见污染事件同时报告故事层风险上界；本研究零观测高风险错误不构成生产安全证明。

### 10.3 正文与成本门槛

- 正文固定断言通过率每难度 ≥0.90，相对 C 的点估计下降 ≤3 个百分点，且满足上述非劣界。C 本身不过 0.90 则实验任务/模型正文能力不足，不可用低基线放宽 A/B。
- 总 Token 配对平均开销 ≤35%，输入/输出分别报告；首可见正文 p95 延迟相对 C 增幅 ≤25% 且绝对增加 ≤1 秒；端到端 p95 增幅 ≤35%。短回复同时报告绝对新增 Token，避免百分比掩盖固定包装成本。
- 所有延迟都以相同硬件/后端和缓存策略测量；缺可信 usage 或真实 streaming 时相应维度为未验证，不得声称完整 GO。
- 三次重复分别报告；任何一次 Attribution F1 比其他重复均值低超过 0.05，标记稳定性不通过，不能只汇总掩盖。

### 10.4 判定输出

- **RESEARCH GO：** 至少一个协议通过完整性、三难度语义、闭环、正文、流式和成本门槛，证据足够。只允许提出下一阶段研究，不授权正式 Task Graph 写入。
- **SCOPED FEASIBILITY / NO-GO FOR FULL CLAIM：** 只在简单/中等、单轮或 buffered 条件通过，或语义通过但成本/流式失败。必须写明能做什么和不能声称什么，不能作为完整 GO。
- **NO-GO UNDER TESTED CONDITIONS：** 完整有效实验中语义、持续性、正文或稳定性不达标。按失败体系区分因素，不通过调提示词重测原验证集改判。
- **INCONCLUSIVE / INVALID：** 样本或区间不足、预算中止、完整性/真值缺陷、usage 不可核对等导致必要证据缺失。明确区分“不支持假设”与“尚未测清”。

## 11. 报告结构与 Owner 待审事项

最终实验报告先回答核心问题，再给证据：研究范围与冻结版本；A/B 每难度指标及区间；六类场景 18 格；闭环与 replay 差异；恢复与交接；正文、流式、Token、延迟；所有失败与负例；协议/模型/上下文/实验条件的归因；GO 决定和未验证边界。完整原始记录通过 manifest 可追溯，不能只交一张平均分表。

Owner 本轮需要审定：

1. 接受本协议的 Task 边界、并行归属粒度及 UUID 出生重命名评分，或要求修改。
2. 接受“参考对话事前冻结 + 闭环实际请求调用前存档”的区别；否则只做冻结 replay，并放弃持续性结论。
3. 指定验证集保管/人工审定责任人，批准各层阈值与样本配额。
4. 是否批准下一步**仅离线 Harness 与合成数据准备**。模型选择、路由和开发预算另批；确认性规模再单独批准。

当前结论是 `DESIGN_READY_FOR_REVIEW`，不是机制 GO，也不是模型 NO-GO。设计提交后暂停等待 Owner 审核。
