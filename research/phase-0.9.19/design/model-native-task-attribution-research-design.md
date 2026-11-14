# ACMI Phase 0.9.19 Model-Native Task Attribution 研究设计

状态：`REVISED_DRAFT_FOR_OWNER_REVIEW`，修订版 R2。日期：2026-11-14，Asia/Shanghai。依据 Owner Research Design Review 定向修订；原设计保存为同目录 `model-native-task-attribution-research-design.v1.md`，不覆盖原稿。

本阶段验证：模型能否在正常回答用户问题的同一次生成中，自主识别、标记并持续维护自己的工作任务。分别测量有目录归属、从工作证据推断和从原始对话发现任务，不要求模型猜出没有历史身份依据的旧 UUID。UUID 正确不等于工作状态维护正确。

**本次仅获授权修订设计和编写 Gate 1 计划。** 未实现实验程序、生成正式数据集、冻结验证集、启动模型实验或取得机制可行性结论。下一步离线实施也等待 Owner 审核；有限开发实验、确认性评测、正式集成分别另批。原 8,640 次确认性调用没有获批，保留为远期候选而非本轮执行上限。

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

现有 `AttributionAction` 不包含本研究的完整 BRANCH/MERGE 语义；现有 `GraphProposal` 也不是本协议的直接编码。本阶段使用独立的 `ResearchWorkStateV2`，不向生产接口强行兼容。V2 仅是未实施的研究协议修订，新增状态维护字段；A/B 的传输方案不变。

### 1.2 禁止事项

- A/B 每个被评测的 assistant turn 只允许一次模型生成；不得在旁路、隐藏工具、修复器、摘要器或 Judge 中再调用 LLM。仅第 7.5 节开发诊断 D 明示使用两次生成，物理隔离账本，不计自主标记成绩或最终 GO。
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
| H6 工作状态维护有效 | 完成/未完成、目标/验收修订、决策冲突、恢复与新证据更新的独立 State Maintenance 指标 | UUID 正确但保留过时目标、把计划当完成、忘记未完成项或吞掉冲突；不能声称持续维护成功 |
| H7 原始对话任务发现有效 | C3 在没有目录/候选的情况下识别出生边界，建立并持续使用模型自建身份 | 只有 C1 通过，C3 持续错误新建或边界混淆；仅能支持有目录归属，不支持自主任务发现 |

“失败”不自动等于模型能力不足。只有同次请求、上下文可见性、原始记录及评分可信后，才能讨论语义能力。信息不足时输出 UNRESOLVED 是正确行为，不计为失败；在证据充分时滥用 UNRESOLVED 则损害召回率。

### 2.1 三个独立上下文条件

为避免名称冲突，原 answer-only C 臂改名 **C0**；C1/C2/C3 始终表示上下文条件，不是输出协议。每一条件都分别运行 A/B，C0 作相应条件下的正文/成本对照。条件间可以列配对差值，不合并为一个总分。

| 条件 | 模型可见输入 | 明确不提供 | 所验证的问题 |
| --- | --- | --- | --- |
| C1 Catalog-assisted | 任务目录、已知 UUID、目标/验收、必要历史；初始活动状态及之后实验提案状态的投影 | 未来状态、oracle 正确答案；闭环不把错误投影纠正为真值 | 在显式目录与状态支撑下能否正确归属和维护 |
| C2 Evidence-only | 带来源/顺序的历史工作证据，可包含当时形成的 UUID、目标和旧决策；完整必要历史 | 当前活动集合、focus、当前状态快照、Host 汇总目录/候选排序 | 能否从历史证据重建当前工作与状态 |
| C3 Raw-dialogue discovery | 从任务首次出现前开始的原始连续对话，按原角色/顺序；模型自己生成的历史回答和标记作为原始消息保留 | 预建目录、语义候选集、目标摘要、外加活动状态、Host 从模型输出生成的状态快照 | 能否发现任务边界、建立身份并维护自己的工作状态 |

三条件均允许非语义传输元数据：turn/source IDs、opaque request/base token、固定 4 个空 UUID 槽位、协议说明和完全相同的正文要求。空槽位不关联任务，不暴露数量或边界真值；C3 仍由模型决定是否以及何时 CREATE。C3 不是“没有协议提示”，也不是让模型无依据恢复旧身份。

C2 历史可保留模型当时写出的标记，包括当时的 active/state 字段；它们是原始历史，不是运行器注入的最新正确状态。C2/C3 不把 ledger 最新快照追加到下一轮，不用历史正确标签替换模型错误。报告这种历史自写状态的可见性，不能声称测试了无任何记忆的模型。

三个条件使用相同底层合成事件族，各自生成并冻结可见输入和 **condition-specific oracle**。例如 C1 已登记任务可能应 CONTINUE，C3 首次出现同一目标则应 CREATE；不能把 C1 的初始身份目录或 birth 标签强塞给 C3。身份不可观察的条件不计算旧 UUID exact，而非算作模型漏召回；其边界识别、UNRESOLVED 和状态证据指标仍单独评分。候选数量仅描述 C1 的目录大小，C2/C3 对应潜在任务数量。

### 2.2 跨 Session 身份恢复的最低证据

跨 Session 的状态恢复与身份恢复分开评测，按 `identity_visibility` 独立分层：

- `identity_present`：至少有历史 UUID、该 UUID 与目标/出生事件的对应关系、workspace/Session 来源、消息顺序及必要的后续变更证据。C1 可用带来源的目录；C2 用历史证据；C3 只能重放含这些信息的原始对话/模型自写标记，不能额外构造任务表。
- `identity_absent`：有旧工作内容但没有历史 UUID 对应关系。要求识别“已有工作但身份未知”并 UNRESOLVED unknown_task，不猜 UUID，也不为了拿分把旧工作误 CREATE 成新任务。旧 UUID exact 为 N/A，不以正确弃权冒充恢复成功。
- `identity_conflicting`：同名任务、互相矛盾的身份记录或缺少来源边界。要求保留冲突并弃权，不按最近出现的 UUID 强行选定。

C3 在连续对话中首次发现全新任务时的 CREATE 不同于 identity_absent 的旧任务恢复。该区分由事前冻结的对话证据决定。跨 Agent 复用沿用相同证据要求，不以 Agent 名称作为任务身份。

## 3. 任务语义与公共协议

### 3.1 归属单位与身份

1. Task 是具有独立目标与验收边界的工作；普通步骤、改措辞、同一交付物的修订不默认成为新 Task。
2. 输入消息按自然段/列表项形成 `unit_id`；分段器只看语法边界，不读取标签，也不按任务切分。一个 unit 可以涉及多个任务。输入、单元 ID 和源坐标在运行前冻结。
3. 每个输入 unit 必须恰有一个 decision。decision 的任务集合允许多元素；`focus_task_id` 只表示本轮主工作，不能把整个消息压成单一标签。无唯一主工作时 focus 为 null。
4. 回答为有序 blocks。每个 block 引用一个或多个 decision，并单独声明任务集合或 UNRESOLVED。这样可以发现 User 归属正确、Assistant 归属错误，不从 User 标签自动填 Assistant 标签。
5. 既有 Task 使用当前条件下历史证据中可见的、不透明 UUID：C1 可从目录获取，C2 从历史记录获取，C3 从原始对话内先前建立的身份获取。每轮额外提供固定 4 个未绑定 UUID 槽位，不论该轮是否需要新任务，避免槽位数泄露真值。
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

C2/C3 不由 Host 提供上一活动集合；模型根据可见历史推断 CONTINUE/SWITCH 的前态。解析器只验证语法、来源可见性和声明的内部一致性，不能用 hidden ledger 或 oracle 拒绝语义错误并替模型选对；前态正确性由 Evaluator 评分。`base_state_id` 在 C2/C3 是 opaque 请求链标识，不编码状态信息。

同一 unit 内“已确定部分 + 未决部分”通过 `resolved_scope_quotes` 与 `unresolved_scope_quotes` 表示；两组引文必须来自该 unit，禁止把未决部分分给已确定任务。主集冻结这类局部混合样本的范围；完整决策语法不能表达范围时判 schema/semantic failure，而不是忽略。

### 3.3 公共 work_state 数据结构

以下是协议的数据字段规范，不是对现有 TypeScript Contracts 的修改：

```text
ResearchWorkStateV2 {
  schema_version: "acmi-research-work-state-v2"
  turn_id: string
  base_state_id: string
  decisions: Decision[]
  proposed_active_task_ids: UUID[]
  focus_task_id: UUID | null
  status_updates: StatusProposal[]
  task_memory: TaskMemorySnapshot[]
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
TaskMemorySnapshot {
  task_id: UUID
  lifecycle_status: WorkState | "unresolved"
  objective_refs: EvidenceRef[]
  criteria: {ref: EvidenceRef, state: "pending"|"satisfied"|"failed"|"superseded"|"unresolved", evidence: EvidenceRef[]}[]
  work_items: {ref: EvidenceRef, state: WorkState|"unresolved", completion_basis: "none"|"reported"|"observed"|"accepted", evidence: EvidenceRef[]}[]
  decisions: {topic_ref: EvidenceRef, selected_ref: EvidenceRef|null, supersedes_refs: EvidenceRef[], state: "active"|"superseded"|"disputed", evidence: EvidenceRef[]}[]
  open_conflicts: {refs: EvidenceRef[], resolution_ref: EvidenceRef|null}[]
}
EvidenceRef { source_id: string, quote: string }
```

- `Action` 为按第 3.2 节区分的封闭联合类型，字段名使用表中名称；CREATE/BRANCH/新目标 MERGE 另有 `objective`、`acceptance: string[]`。UNRESOLVED action 仅含 `op`，细节在 decision.unresolved。CONTINUE 使用 `task_ids`。所有对象禁止额外字段、重复键和非有限数字。
- `Decision.task_ids` 是 actions 的当前工作目标并集：CONTINUE 的集合、SWITCH 的 to、CREATE/BRANCH 的新 UUID、MERGE 的 target。关系来源不是自动归属目标。纯 UNRESOLVED 必须为空。局部混合可包含 UNRESOLVED 与已确定 action，但每个范围分别有证据。
- `base_state_id` 由 Harness 给出并原样回显；只用于发现陈旧/串 Session 状态，不是权威任务真值。
- `proposed_active_task_ids` 与操作应用后的活动集必须一致。CREATE/BRANCH/MERGE 默认增加目标，不删除其他活动任务；只有 SWITCH 或有证据的显式状态提案移除活动任务。focus 必须在活动集中或为 null。
- `WorkState` 复用 `planned/ready/running/blocked/completed/failed/cancelled/superseded`。只允许输入证据支持的 from/to；“已经修好了”的模型正文不构成已验证完成证据。
- `status_updates` 是模型提出的变更，`task_memory` 是同次生成声明的完整工作状态，两者须一致；后者不能由 Host 根据前者补写。每轮快照覆盖此前已发现且证据仍可见的任务，包括不活动、已完成与未完成任务；纯 no_task 且没有历史任务时才可为空。遗漏旧任务计状态保持失败。
- `TaskMemorySnapshot` 引用原始证据，不输出 oracle 的隐藏 slot 名称、目标标签或 gold version ID。协议只提供通用字段；任务/工作项/决策由模型发现。匹配采用 source+quote 的确定性坐标和事前冻结等价表，不用 LLM 比较自由文本目标。
- `completion_basis=reported` 只表示输入中有人宣称完成，不足以把 work_item.state 或 lifecycle_status 置为 completed；`observed` 要有对应结果/测试证据；`accepted` 要有明确验收来源，仅为研究声明，不执行正式 Result 接受。计划、意图和模型自己的“已完成”不能成为实际完成证据。Task completed 还要求所有当前有效验收已满足且不存在阻断冲突；新验收条件未满足时不能沿用旧 completed。
- 状态更新不必 CREATE：同目标的范围/验收修订更新 objective/criteria，原决策可由明确新决策 supersede；缺少权威性或时间顺序证据的冲突保持 disputed/unresolved，不能机械“最新文本胜出”。证据优先级和冲突预期逐场景冻结。
- evidence 引用当前可见来源 ID 和原文引文，不要求模型计算字符 offset。确定性 resolver 验证引文与 source 一致，记录实际 offset；多次出现且无法唯一定位时证据无效，不按语义模糊匹配。
- 状态、关系、创建和切换均包在 `status=proposed`、`provenance=model_proposed` 的归档 envelope 内。该 envelope 由 Harness 添加，不充当模型生成证据。
- confidence 仅为自我报告；不作真实概率，不按它过滤主成绩，不用它调门槛。只做错误分布交叉表。
- 规格上限：每轮 8 个输入 units、每 unit 恰好 1 个 decision、全轮合计最多 16 个 actions、16 个 answer blocks；每故事累计最多 8 个可评 Task、task_memory 最多 8 项，C1 最多 8 个既有候选；每轮固定 4 个空 UUID 槽位。C2/C3 不显示候选表。精确字段数组/字节/Token 限额随执行清单冻结，候选和新建真值合计不能超过故事容量；溢出不截出“可用部分”冒充完整有效。

### 3.4 A 方案 Structured Sidecar

同一次生成输出一个完整 JSON 对象：

```json
{
  "answer": [{"block_id":"b1","decision_ids":["d1"],"task_ids":["11111111-1111-4111-8111-111111111111"],"unresolved_reason":null,"text":"超时值为 300 ms。"}],
  "work_state": {
    "schema_version":"acmi-research-work-state-v2",
    "turn_id":"t2",
    "base_state_id":"s1",
    "decisions":[{"decision_id":"d1","unit_id":"u2.1","actions":[{"op":"CONTINUE","task_ids":["11111111-1111-4111-8111-111111111111"]}],"task_ids":["11111111-1111-4111-8111-111111111111"],"resolved_scope_quotes":["继续网关超时修复，计算 3 次各 100 ms 的总时长。"],"unresolved_scope_quotes":[],"unresolved":null,"evidence":[{"source_id":"u2.1","quote":"继续网关超时修复"}],"self_reported_confidence":"high"}],
    "proposed_active_task_ids":["11111111-1111-4111-8111-111111111111"],
    "focus_task_id":"11111111-1111-4111-8111-111111111111",
    "status_updates":[],
    "task_memory":[{"task_id":"11111111-1111-4111-8111-111111111111","lifecycle_status":"running","objective_refs":[{"source_id":"u1.1","quote":"修复网关超时"}],"criteria":[{"ref":{"source_id":"u1.1","quote":"超时回归测试通过"},"state":"pending","evidence":[]}],"work_items":[{"ref":{"source_id":"u1.1","quote":"执行超时回归测试"},"state":"planned","completion_basis":"none","evidence":[]}],"decisions":[],"open_conflicts":[]}]
  }
}
```

上例的可见历史 `u1.1` 包含“修复网关超时”“超时回归测试通过”“执行超时回归测试”，且任务已处于 running；当前算术回答不构成修复完成，所以状态保持未完成。这些历史内容属于示例 fixture，不是运行时补入的 oracle。

主比较 A 使用普通文本生成 JSON，不开启 A 专有 constrained decoding，避免把协议与后端约束能力混淆。若 Owner 另批 native JSON Schema/grammar 臂，记为 A-constrained，独立报表，不能并入 A 成绩。

流式增量解析只在字符串 escape 和字段边界可确认时发出 answer.text 增量，不将 JSON key、UUID 或 sidecar 发给用户。最终完整对象未闭合/验证失败时，已显示正文保留并标为“元数据未完成”；提案不进入下一轮实验状态。整包等完再显示只能算 buffered，不算真实流式成功。

### 3.5 B 方案 Native Inline Marker

同一次生成输出专用应用层帧，标记可在正文块之间出现，而非最后由 Host 追加：

```text
<|acmi:decision:v1|>{完整 Decision JSON}<|acmi:end|>
<|acmi:answer:v1|>{AnswerBlock 元数据，不含 text}<|acmi:text|>用户可见正文<|acmi:end|>
<|acmi:decision:v1|>{下一条 Decision JSON}<|acmi:end|>
<|acmi:answer:v1|>{下一块元数据}<|acmi:text|>后续正文<|acmi:end|>
<|acmi:commit:v1|>{schema_version,turn_id,base_state_id,decision_ids,proposed_active_task_ids,focus_task_id,status_updates,task_memory}<|acmi:end|>
```

- 这里的 Native 指模型原生生成标记，不声称 tokenizer 中存在这些 special tokens。无需微调或修改 tokenizer。
- decision 必须先于引用它的 answer；完整 commit 恰好一个、位于末尾，枚举且仅枚举已出现的 decision IDs。任何帧外文本、重复 ID、未知引用、嵌套帧、额外 commit 或不完整帧均判协议失败。
- 在 text 帧内仅解释结束标记；字面反斜杠用 `\\`，字面 `<|acmi:` 前缀用 `\<|acmi:` 转义。解析器按 escape 状态识别，不在最终全文中用简单正则删除标记。
- marker JSON 内禁止未转义的原始 `<` 字符，必须用 JSON Unicode escape 编码，避免字符串中的控制前缀撞帧。
- 增量解析必须容忍 UTF-8 字节、JSON escape 和标记被任意网络 chunk 切开，缓冲可能成为控制前缀的最短后缀。用户只看到解码后的 text。
- B 的逐块提案可暂存，但最终 commit、引用和结构都通过前不进入闭环状态。截断不能把前半段成功当成整轮成功。
- B 与 A 使用同一 work_state 语义、候选、证据、正文要求与资源上限。两者输出顺序不同是协议的组成部分，不能把 A/B 差异完全归因为“模型能力”。
- 帧边界语法仍为 v1，commit 的 `schema_version` 为 work-state-v2；两种版本分属 framing 和 payload，不混为同一版本。

## 4. Ground Truth 生成、冻结与隔离

### 4.1 真值先于自然语言实现

先由人工制定场景事件脚本，包含初始任务目录、目标边界、当前活动集合、输入 units、证据可见性、分支/汇合和状态变化；再撰写自然对话。确定性生成器负责 UUID、位置排列、算术/表格事实和渲染，不由被测模型或另一个 LLM 生成主评分标签。

每个 scenario 必须包含：

```text
scenario_id, family_id, split, category, story_max_difficulty, turn_difficulty
context_condition: C1|C2|C3, identity_visibility, condition_specific_oracle
canonical_tasks: UUID + objective + acceptance + initial_status
initial_active_ids, sessions, logical_agents
frozen_reference_dialogue: 完整 system/context/user/reference-assistant 消息
turn_schedule: 用户输入、恢复点、交接点、可见来源、资源预算
oracle_by_turn: 每 unit 的任务集合、操作、focus、active 集、状态、关系
state_oracle_by_turn: objective/criteria/work/decision/conflict 的证据原子与完整快照
state_transition_points, maintenance_no_change_points, dormant_task_return_points
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
- **正式模型输出全部由确定性 Evaluator 自动评分，不设逐条人工判卷或人工确认后才能出分的流程。** 人工职责限于场景/真值定义、冻结前审定，以及预先登记的真值争议、评分器缺陷和抽样复核；不增设第二个 LLM Judge。
- 抽样复核在运行前固定 family/attempt 抽样种子和不超过 5% 的上限，可因完整性故障触发必要审计；它不改变单题分数、不作为正常评分步骤。发现实质缺陷走第 9 节版本化勘误，暂停相关结论，不能人工把模型错题改成对题。

### 4.3 “完整输入冻结”与真实闭环的区别

不能把尚未发生的模型回答提前冻结，也不能把逐轮注入正确历史误称为自主持续性。本设计分别记录两条轨道：

1. **FROZEN-REPLAY：** 每个被评测 turn 的完整输入字节事先冻结，包括参考 assistant 历史和初始状态。前一轮模型输出不进入后一轮。用于测单轮识别和协议的受控上限，不能单独支持持续性结论。
2. **CLOSED-LOOP：** 每个条件的初始完整对话、未来所有用户消息、合成事件、恢复/交接点、上下文选择算法和 oracle 事先冻结；以后输入包含该臂实际已生成的原始回答/提案消息。只有 C1 允许额外投影当前提案状态，C2/C3 不注入该快照。因此未来完整请求在生成时才确定。每次调用前存档实际完整请求和 SHA-256，再发出生成；不使用 oracle 修正历史。主 GO 必须依赖此轨道。

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

下面简写 UUID：A=`11111111-1111-4111-8111-111111111111` 为网关超时修复；B=`22222222-2222-4222-8222-222222222222` 为账单 CSV 导出；C=`33333333-3333-4333-8333-333333333333` 为 CSV 性能基准。该表按 C1 展示；C2/C3 仅通过各自允许的历史得知身份，首次发现的 birth 真值按条件另定，不显示“正确目标”。

| 类型 | 已知状态与当前输入 | 冻结期望 | 禁止归属/行为 |
| --- | --- | --- | --- |
| 连续 | active={A}；“继续网关超时修复，把 3 次各 100 ms 的总时长算出来。” | CONTINUE A；回答 300 ms | B；CREATE；把计划写成 verified completed |
| 切换 | active={A}；“超时先放下，回到账单 CSV，列名仍是 date 和 amount。” | SWITCH {A}→{B}；返回 A 时复用 A | 继续 A；给 B 换新 UUID |
| 并行 | active={A,B}；“网关取 3×100 ms；账单统计 2+5 行。分别给结果。” | 同 unit 两个 CONTINUE；A=300 ms，B=7 行；focus=null | 只标 A；将 7 行归给 A |
| 新建 | 已知 A/B；“另起一个独立交付：CSV 性能基准，验收 p95 小于 50 ms。” | CREATE 新槽位→canonical C；不虚构 parent | CONTINUE B；仅因 CSV 同名就合并 |
| 分支/汇合 | active={B}；“从账单导出分出独立性能基准，父任务继续。”随后明确“把基准与格式检查两个分支汇回账单交付。” | 首轮 BRANCH C branch_of B；后轮两来源 MERGE 到 B，保留来源身份 | 首轮无 parent CREATE；后轮自动关闭来源或 join accepted |
| 模糊 | 两个任务标题都是“导出修复”，无唯一证据；“继续那个导出修复。” | UNRESOLVED ambiguous_reference；澄清两个目标的区分 | 任意 UUID；CREATE；把 confidence 当作依据 |

并行/恢复数据中出现的工具结果只是冻结的合成输入事件；没有实际执行工具，不能宣称验证了生产工具路由。跨 Agent 场景测试记忆交接识别，不宣称验证并发 Agent 的共享存储一致性。

### 5.3 持续工作状态维护矩阵

以下六个状态主题是原六类场景上的纵向事件，不用第七类场景代替任务研究。每个主题都包含有变化与不应变化的对照，分别按条件、难度报告。

| 状态主题 | 冻结事件与正确维护 | 必须捕获的失败 |
| --- | --- | --- |
| SM1 完成与未完成 | 一个工作项有通过记录，另一个尚未执行；已完成项保持、未完成项仍开放 | 整个 Task 一律 completed，或恢复时丢失待办 |
| SM2 目标/验收变化 | 用户明确修订同一交付物目标或增加验收；保留 Task 身份，更新当前目标和有效 criteria | 只保 UUID 不改验收，或将普通修订错误 CREATE |
| SM3 决策更新与冲突 | 有明确 supersede 的新决策取代旧决策；无明确优先级的两个冲突决策标 disputed | 两个互斥决策同时 active，或无证据按时间覆盖 |
| SM4 计划与实际完成 | 先说“将运行测试”，再出现通过/失败/仅自报结果 | 把计划、模型承诺或未经证实的自报当 actual complete |
| SM5 久未触及后的恢复 | 切到其他工作至少 5 个评分 turn 后返回；保持旧未完成项，并采用期间合法变更 | UUID 对但目标/待办/决策退回旧版本 |
| SM6 旧状态与新证据冲突 | 旧 completed 后出现与原完成依据相关的新失败证据，按冻结规则 reopen/blocked；来源不足则 disputed | 无视反证继续 completed，或不相关失败污染该 Task |

SM5 记录 `gap_turns`、间隔输入 Token、逻辑事件时间差和证据是否仍在窗口内。初轮只支持 5–6 turn 的有限间隔证据；后续更长 Token 距离、压缩/截断与真实墙钟等待不能从这里外推。关键证据缺失时正确表示未知，比虚构旧状态更好，但不算状态完整恢复成功。

### 5.4 更新后的实验矩阵

| 维度 | 水平 | 是否可合并为主成绩 |
| --- | --- | --- |
| 上下文 | C1 / C2 / C3 | 否，分别给出结论；不做跨条件 pooled F1 |
| 自主标记协议 | A / B | 分别评分，条件内配对比较 |
| 对照/诊断 | C0 answer-only / D Separate Generation | C0 只测正文/成本；D 仅开发诊断，均不算自主标记成功 |
| 对话轨道 | CLOSED-LOOP / FROZEN-REPLAY | 分开；后者不证明持续性 |
| 内容 | 原六类 × 每 turn 简单/中等/困难 | 每条件展示 18 格；同故事内难度变化事前冻结 |
| 状态主题 | SM1–SM6 | 独立 State Maintenance 指标，不从身份成绩推导 |
| 连续性 | 无重启 / 同 Session 进程恢复 / 新 Session 或逻辑 Agent | 分层；identity_present/absent/conflicting 再分报 |

这不是授权一次运行完整笛卡尔积。初轮只做下节有限开发设计，所有空格明确 N/A。确认性矩阵及每格支持数由开发测量后重新审批。

### 5.5 初轮有限开发样本建议，尚未获批

- 6 个全新开发故事，每个主覆盖一类场景，每故事 8 个评分 turn，共 48 个底层 turn。每故事按 turn 预标简单 2、中等 2、困难 4；故事聚类标识不变，故事总体难度为最难 turn。这覆盖 18 格，但每类仅 1 个独立故事，不能支持确认性结论。
- 每故事主覆盖一个 SM 主题，全套至少为每个主题安排 2 个需要更新与 2 个不应错误更新的机会；允许一轮覆盖多个主题，机会及分母事前冻结。SM5 至少一个满足 5 个完整间隔 turn 的返回。
- 6 个故事中 2 个无重启、2 个同 Session 恢复、2 个新 Session/逻辑 Agent 交接；三种身份可见性通过固定交接 turn 覆盖，不能从这少量样本估计低概率风险。
- A/B/C0：48 turn × 3 条件 × 3 臂 × 1 次 = **432 次调用**。不跨条件共享运行历史。
- FROZEN-REPLAY：每故事预选 2 个 probe，共 12 turn × 3 条件 × A/B = **72 次调用**；包含状态变化与状态保持，不因闭环出错才挑 probe。
- D：相同预选的 12 个开发 probe × 3 条件 × 2 次生成 = **72 次调用**。D 使用自己的第一阶段回答，不复用 A/B/C0 的输出，不再增加 D-B 子臂。
- 全部计划合计 **576 次调用**，包含前缀机制检查，不额外加 smoke、自动重试、修复调用或补齐失败样本。单个冻结 prompt 版本；若需修订，停止当前版本，新的开发批次与预算另报，不循环跑到通过。
- 第一轮仅一次执行，不能估计跨重复稳定性。所有费用、时间和 calls 都是建议上限，当前授权仍为 0 次模型调用。

### 5.6 远期候选规模与重新估算

保留原候选：每个条件可考虑 108 个独立故事、864 个闭环 turn，A/B/C0 三臂三次重复，加 144 个 replay turn 的 A/B 三次重复，共 **8,640 次调用/条件**。它不包含 D，也不是初轮批准范围。直接复制到三条件将变成 25,920 次调用，**不能自动乘三执行**。

旧配额（每难度 CREATE/SWITCH/UNRESOLVED 至少 30 个，BRANCH/MERGE 至少 20 个，持续任务/禁止归属机会至少 30 个）仅作远期覆盖候选，不是已计算好的统计保证。新版还需为每个条件的 SM1–SM6 变化、保持、冲突及恢复事件提供独立故事支持。

有限开发后按协议失败分布、状态错误类型、故事内相关性、真实 Token/时间、每格有效机会重新提出最小/目标/上限三档方案。先明确要估计的错误事件及区间宽度，再计算所需独立故事数；稀有事件风险要求按第 10.5 节单独论证。开发数据不得并入新确认集，不能依据开发结果降低错误率门槛以制造通过。

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
| Token Overhead | 相对同条件 answer-only C0 臂的输入、输出、总 usage 的配对差值及百分比；另统计 marker/包装/协议提示词/task_memory token。推理 token 若 provider 报告单列；未报告则 unknown，不当成零 |
| Latency | 单调时钟记录 request→首传输字节、首可见正文、首完整 marker、完整 marker、正文完成、请求结束、端到端；各报 p50/p95 和相对同条件 C0 的配对差值 |

额外必须报告：六操作混淆矩阵；关系三元组 precision/recall/F1；状态更新 exact；活动集合/focus exact；forbidden assignment rate；User/Assistant 双角色联合正确率；恢复前后 UUID exact；每个故事所有 turn 正确的比例；首错 turn；首错后错误持续长度；正文断言通过率；控制标记泄漏率。

Assistant 分数检查的是模型声明的关联与固定响应义务，不声称它证明了任意自由文本每个句子的真实主题。正文的实际跨任务事实错误通过下述 answer probes 另测。

### 6.2.1 独立 State Maintenance 指标

评分对象是每个 `(task, turn)` 的 task_memory **原始完整声明**及 status_updates，不是 UUID 是否命中。oracle 用可见证据的来源坐标定义状态原子，例如 `(task, criterion-source, satisfied)`、`(task, decision-topic-source, active-choice-source)`；原子值、可接受引用范围、变化点及保持点在生成前冻结。七个字段族固定为 objective、criteria、work-item state、completion basis、decisions、conflicts、lifecycle；不是将整个 snapshot 当成一个 UUID 标签。

| 指标 | 确定性定义 |
| --- | --- |
| State Maintenance Precision / Recall / F1 | 对目标、有效验收、工作项状态/完成依据、有效决策/替代关系、冲突、生命周期七个字段族分别计算预测/真值原子 TP/FP/FN；报告各族及等权 macro F1，不以数量多的简单状态掩盖决策失败 |
| State Snapshot Exact | 七个字段族的原子多重集全部与真值一致的 task-turn / 应声明状态的 task-turn；任一缺项、过时项、额外项均不 exact |
| State Transition Accuracy | 冻结变化点上，本轮目标字段更新正确且未无依据改变其他字段的比例；同时核对 status_updates 与 snapshot 一致 |
| State Retention Accuracy | 冻结保持点上，当前仍有效的工作状态全部保留且无伪更新的 task-turn 比例；遗漏旧未完成任务失败 |
| Completion Evidence Precision / Recall | 将实际完成声明与有 observed/accepted 证据的实际完成真值匹配；reported 与 planned 不算实际完成 TP；另报 False Actual Completion Rate=无支持完成声明/全部实际完成声明及其绝对数 |
| Goal/Criteria Revision Exact | 明确修订后，当前目标、有效/失效验收及仍未满足条件全对的比例；旧 UUID 正确但旧验收仍 active 判失败 |
| Decision/Conflict Resolution Exact | 在更新/冲突点，选择、supersedes、disputed/unresolved 和证据均符合冻结规则的比例；同时保留互斥有效决策判失败 |
| Dormant-task State Recovery Exact | 满足 gap 定义且必要证据可见的返回点中，身份与七族状态全对的比例；缺证据组单独评正确未知，不算恢复成功 |

主状态分数采用 **identity+state 联合匹配**：任务漏建、身份错指或整轮 marker 无效会产生相应状态 FN，错误身份下的状态原子产生 FP。另报 `state_given_correct_identity` 作为诊断，不能用它替代主分数。完全无预测时 precision 为 N/A、recall 为 0，决策不可通过；无变化场景不能让空 status_updates 获得 State Maintenance 成功。

task_memory 中任何一个任务状态错，不自动抹掉其他结构有效任务的原子评分；但整轮 schema/reference 无效仍按第 6.1 节处理。研究 reducer 只存储提案，不用 oracle 决定是否采纳更新；state schema validity 与 state semantic accuracy 分开报。

### 6.3 正文质量与防止标签“替代工作”

为每轮预先定义可确定判断的正文任务：算术结果、精确列表/键值、给定事实的约束、不得出现的另一任务数值、必要输出项。多任务答案必须分别包含正确结果且不能互换；正确任务 ID 配错正文同样失败。

自然语言澄清接受事前登记的多种表达，不仅凭是否出现问号；否定语境、引用文本、全列候选刷命中必须有负测试。判断器只能保证这些受控任务的要求，不给开放式写作、文笔或整体帮助性打分。正常链路全部自动评分；人类仅按第 4.2 节预登记抽样/缺陷机制复核，不逐条审查输出，也不使用 LLM Judge。

### 6.4 聚合、区间与反作弊测试

- 每个 C1/C2/C3 分别输出 category × turn_difficulty 的 18 格结果、三个难度结果、SM1–SM6、恢复/交接与身份可见性分层、每次重复及条件内汇总；列分子、分母、缺失数。无跨条件总分，D 只在独立 diagnostic 报表出现。
- A/B/C0 在同条件、同故事、同一重复配对。随机化各故事臂执行顺序；同一故事内部严格时间顺序，不跨臂/条件共享缓存状态、会话或模型提案。同一事件族的跨条件变体和所有重复不是独立样本。
- 用固定种子的分层 story-cluster bootstrap，10,000 次，计算 95% 区间和配对差值区间；每次抽样整故事携带全部 turn 和重复。不把 turn 当独立样本。
- 极少/零错误时另给独立故事层面的单侧精确上界，避免 bootstrap 产生虚假的零宽度“零风险”。报告观察率与风险上界，不宣称总体错误率为零。
- 第一轮每类别仅一个独立故事；允许报告描述性分数和个例计数，按该类别聚类的泛化区间标为不可估，不能靠 bootstrap 制造统计支持。确认集有足够独立故事后才启用预注册区间判定。
- 验证集开封前固定测试：全弃权、全 CONTINUE、全 CREATE、固定首候选、所有任务全选、只复制 User 标签、重复 UUID、错源引用、伪造完成、漏 block、正确数字错任务、marker 注入、截断与重复键。Evaluator 必须对它们给出预期失败。
- 新增状态/条件反作弊：UUID 全对但状态全旧；全部工作 completed；所有冲突选最新；凭计划宣告验收；C2 偷渡当前 active；C3 偷渡目录；identity_absent 猜中隐藏 UUID；把 D 第二次调用拼入 A/B。前四类必须状态低分，后四类触发证据/隔离失败而非算模型成功。
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
| `research/phase-0.9.19/context/` | C1/C2/C3 明确 allowlist、来源表、条件特定输入预检；C2/C3 禁止当前状态投影；不使用 LLM 摘要 |
| `research/phase-0.9.19/runner/` | A/B/C0 单次预算、隔离会话、流采集、恢复；独立 D 两阶段开发模式，验证 split 禁用 D，无隐式重试 |
| `research/phase-0.9.19/ledger/` | append-only 身份与 task_memory 提案、checkpoint、校验和链；不实现生产 writer |
| `research/phase-0.9.19/evaluator/` | 原始协议读取、出生映射、身份/状态独立评分、按条件决策；不导入模型 adapter，无人工逐题钩子 |
| `research/phase-0.9.19/tests/` | 人工构造输出、mock transport、故障注入、评分 goldens |
| `research/phase-0.9.19/report/` | 按预注册模板生成机器 JSON 与人读报告，不改原始记录 |

优先使用现有 Node/TypeScript 工具链与测试风格，具体依赖及版本在实施时依据锁文件确定。这里只定义研究模块边界，不新增生产接口或默认启动服务。

### 7.2 同次生成证明

每条 scored response 归档唯一的 `attempt_id`、请求摘要、开始/结束时间、provider request/generation ID（存在时）、原始响应、流事件及 usage。答案与标记必须是该响应的可定位子串/JSON 字段，不能来自两条响应的拼接。

runner 有全局预算计数器，A/B/C0 每 turn `max_generation_calls=1`；仅 `split=dev && arm=D && diagnostic=true` 的独立入口允许两个固定 stage，各一次。禁用 SDK、代理和 runner 自动重试，记录实际请求数。连接失败也消耗 attempt，保留原始失败；不能补跑挑好结果。若服务端内部是否重试不可观察，报告证明边界为“一个客户端生成请求”，不得声称已经证明后端只做一次解码。需要端到端强证明的确认实验必须选可核对服务日志的环境。

独立 answer-only C0 臂只为测量正文、Token 和延迟；它不接收 A/B 输出、不补标签、不评判模型、不参与 A/B 生成。C0 不是被禁止的第二次归属调用。

C0 使用该条件允许的初始输入、外部用户消息、冻结事实与正文要求，只生成自然语言回答，不输出任何任务标记，也不运行提案 reducer。C0 的历史只含自己的正文，不能为对齐 A/B 而从 oracle 补入最新状态；C1 的 C0 只持有初始目录及可见原始更新。A/B 的标记提示、task_memory 和投影均算入开销。分任务呈现的自然语言要求对三臂一致，不能依赖 C0 不具备的隐藏 metadata 评分。闭环三臂历史自然分化，比较反映端到端方案差异；受控 A/B 序列化比较另外使用相同历史的 FROZEN-REPLAY 子集。

### 7.3 闭环状态、恢复与交接

- 实验 reducer 只根据语法/引用有效的模型提案更新 **tentative ledger**，即使语义错误也保留并带入后续轮次。它不读 oracle；不把“合法”改成“正确”。
- 无效整轮标记不更新 ledger，原始输出仍作为已发生的模型消息保留。C1 可显示 metadata_invalid 和上次有效提案投影；C2/C3 不增加新状态摘要，只保留原始历史和非语义传输状态。这种 fallback 单列，不能把最后正确快照注回 C3。
- 上下文严格按第 2.1 节条件构造；固定截断策略及最大窗口，关键证据不可静默丢弃。预算不足是实验条件错误；专门证据缺失样本则是合法 UNRESOLVED 条件。恢复旧 UUID 与恢复工作状态分别核对，不互相替代。
- 同 Session 恢复使用真实新进程，从持久化记录恢复到已提交 turn 边界；比较恢复输入 hash、UUID、顺序和 source refs。新 Session/Agent 仅获得预登记交接包，不能读对方隔离目录。
- 交接包按条件提取：C1 可投影目录与 model_proposed 状态；C2 仅历史工作证据；C3 仅原始对话片段及模型原始标记。均不由 LLM 写摘要，不补入 oracle，遵守第 2.2 节身份证据边界。
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

每条 evidence/usage/score 记录必须携带 `arm`、`context_condition`、`track`、`split`、`prompt_version`、`family_id`；D 另有 `pair_id` 和 `stage=answer|marker`。评分入口默认拒绝混合条件汇总以及 D 进入 confirmatory/GO，不能只靠报告作者手工排除。

### 7.5 D Separate Generation 开发诊断

仅在第 5.5 节预选的小规模开发 FROZEN-REPLAY probe 上运行，使用同一被测模型、固定参数，不引入 Judge：

1. D1：基于该条件的完整冻结输入生成正常回答，不要求标记。保存原始回答、流、请求和 usage。
2. D2：重新建立独立请求，提供同一冻结输入与 D1 完整回答，一次性输出与 A/B 等价的任务归属和 task_memory。只给 D2 标记输出指令，不提供 A/B 标签、gold、正确性反馈，也不让 D2 改写 D1。
3. D2 固定使用 JSON 标记编码，无 answer 文本；归属 answer blocks 以 `(start,end)` UTF-16 非重叠范围指向不可变 D1 原文，Evaluator 校验范围并取原文评分。UTF-16 仅用于 D 的回答定位诊断，不能成为 A/B 要模型算 offset 的新要求。
4. D1 失败/拒答/截断则该 pair 失败且不调 D2，未消耗预算不挪给别的题；D2 失败也不重试。两次 usage、延迟求和，D1+D2 整体成本与 A/B 比较，不只报 D2。

D2 的标记和状态由同一确定性 Evaluator 评分，字段为 diagnostic-only。D 不进入 A/B 原始输出、不进入闭环 ledger、不触发身份修正、不参与最终 GO。D 优于 A/B 只支持“分离生成可能缓解某些约束”的诊断；D2 看过完整回答、增加一次 prefill/解码且没有同时写正文，这些混杂必须一起报告，不能直接断言模型能力竞争是唯一原因。

初轮 D 每阶段使用与 A/B 相同单次 Token 上限，因此 pair 拥有最多两倍输出预算。报告实际预算使用及截断率，不能把 D 的优势简单归为序列化。若要 equal-total-budget 或额外 D-B 实验，须新开发预算和预登记，不在失败题上临时加跑。

## 8. 实验执行计划与批准关卡

### Gate 0 当前交付与暂停

- [x] 只读核对当前仓库 Contracts、相关研究边界和工作区约定。
- [x] 提交本研究设计及待审条件。
- [x] 根据 Owner 意见增加 C1/C2/C3、State Maintenance、自动评分边界、D 诊断和分阶段预算。
- [ ] Owner 审核修订设计与 Gate 1 计划；仅修订授权不等于离线实施授权。

**到此暂停。后续所有步骤均未执行。**

### Gate 1 获批后的离线实现

建立新工作树，只实现研究 Harness 与确定性 Evaluator。先写反例测试，再实现条件输入、A/B 协议、状态评分、ledger 和 fake runner。使用人工 fixture、fake transport，不调用模型、不接凭据；Gate 1 provider 只接受 fake，实现 D 的调用计数/隔离测试而不连接真实模型。

独立实施计划见 `E:/codex-prj/ACMI/deliverables/phase-0.9.19/gate-1-implementation-plan.md`。验收重点：C2/C3 无状态泄漏、C3 自建身份、UUID 对但状态错必须失败、A/B 第二次请求被拒绝、D 只允开发两阶段、评分可逐字节复现、正式仓库/Graph 无写入。

交付离线测试报告、实现 diff、精确文件清单。是否安排独立代码评审由 Owner 决定；默认由实施者自查，不未经授权启动评审代理。

### Gate 2 单独批准的有限开发实验

Gate 1 通过后，Owner 再批准模型快照、后端、隔离路由、输入/输出预算、墙钟和费用上限，才接入 live transport。批准请求采用第 5.5 节 **576 次**建议，不沿用原 600 次调参额度，也不执行 8,640 次确认批次。

- 先执行固定首个故事的前 2 turn × 3 条件 × A/B/C0，共 18 次，已包含在 432 次闭环预算内；A/B 共 12 次必须完整对账、零额外调用、零标记泄漏/越界、原始证据齐全。失败即停，不重跑“直到通过”。其余故事/恢复/状态能力仍需后续开发样本，前缀通过不代表整体机制资格。
- 通过前缀且仍在该批授权范围内才继续剩余计划；任何部分输出都保存。开发集可以暴露失败分布用于下一版设计，但不临时改本批 prompt、规则或分母。
- 单次输入上限建议 8,192 token、输出上限 2,048 token；state 快照、原始历史和 D2 的 D1 回答全部计入输入。若新状态字段使预算不合理，先在开发版记录溢出/截断，再提交修订预算；不能只为失败臂临时加长。
- 576 次理论保守输入/输出总上限为 **5,898,240 token**，不是实际消耗估计；若 provider 将 reasoning 另算，执行清单必须额外封顶并计费。费用上限根据批准时的选定路由确定，当前不选择模型、不估造价格。
- 单并发、每次 120 秒超时、整个开发批次最多 24 小时；到 calls/Token/费用/墙钟任一上限即停。不可观察失败不补跑，D1 失败节省的 D2 额度不转用。
- A/B 在同条件使用相同模型、采样、tokenizer、上下文预算和语义要求，只替换序列化说明；C0/D 的差别明确标注。跨 C1/C2/C3 的信息量差异是研究自变量，不为了对齐 Token 偷补状态。

### Gate 3 开发报告与确认性规模重估

关闭模型访问后自动评分，提交按条件的协议稳定性、State Maintenance、任务归属、Token、真实流式与延迟、失败分布、无效/缺失支持数、D 诊断差异。第一轮不是正式 GO，不要求人工逐条审查。

基于这些结果重估：每格独立故事数与事件数、类别覆盖、重复次数的价值、聚类相关性、区间宽度、稀有高风险错误的可支持上界，以及 input/output/推理 Token、失败占用时间、路由实际费用。提出最小/目标/上限三档预算；不将 576 次或 D 的诊断表现折算为确认性通过。

### Gate 4 再次审批与冻结后才运行确认性评测

原 8,640 次/条件仅为第 5.6 节远期候选。Owner 在 Gate 3 报告之后重新批准确认性矩阵、样本量、功效/精度依据、风险目标、模型与费用上限，保管者再冻结全新的验证集。最终 prompt、协议、evaluator、阈值与实际计划顺序在解封前锁定。

确认集仅含 A/B 与必要 C0 对照，不运行 D；任何验证结果用于修订后，该集退出确认性用途。没有 Owner 新批准则保持暂停，不能自动进入下一阶段。

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
| M-STATE | 状态 | UUID 正确但目标/验收陈旧、漏未完成工作、计划冒充完成、旧决策复活、冲突被吞、久未触及恢复错误；按 SM1–SM6 子码记录 |
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
6. C1 成功而 C2 失败支持状态重建的条件敏感性，C2 成功而 C3 失败支持目录外发现/输入呈现因素；三条件真值可见性不同，不能从总分差异直接断言单一因果。
7. D 优于 A/B 时核对协议有效率、正文长度、总预算、截断和状态错误，记录能力竞争/协议/预算的候选解释；没有 equal-total-budget 控制时不作唯一归因，D 不能挽救 A/B 的失败结论。

## 10. GO / NO-GO 判定标准

以下保留原拟议工程门槛并补充状态指标，均不是统计风险保证，也不用于把初轮开发结果宣布为研究 GO。确认集的支持数、区间目标及判定计划须 Gate 3 后由 Owner 在解封前批准。A/B × C1/C2/C3 各自判定，D 永不参与；不合并条件，不挑选最佳重复。

### 10.1 完整性硬门槛

A/B 单次生成对账、零额外归属生成、零事后修复、零正式 Graph/Binding 写入、零真实数据、零 oracle/条件信息泄漏、完整原始证据，均为 100% 要求。控制标记/UUID 元数据意外显示给用户为 0。任一违反则当前执行路径 NO-GO 或批次 INVALID，不讨论用平均分抵消。D 的两次生成是开发诊断例外，不出现在这些 A/B 分母内；任何 D→A/B 回填仍是硬违规。

### 10.2 语义与连续性门槛

下表须每个上下文条件内 CLOSED-LOOP 的简单、中等、困难三个分层**各自**达到；User 与 Assistant attribution、身份与状态维护分别达标，不只看合并平均值。

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
| State Maintenance macro F1 / State Snapshot Exact | ≥0.90 / ≥0.85；七个字段族与 SM1–SM6 分报，不能只以 UUID 通过 |
| State Transition / Retention Accuracy | 分别 ≥0.90 / ≥0.95 |
| Goal/Criteria Revision、Decision/Conflict Resolution Exact | 分别 ≥0.90 |
| Completion Evidence Precision / Recall | ≥0.95 / ≥0.90；计划冒充实际完成的观测数必须为 0 |
| Dormant-task State Recovery Exact | ≥0.90，只在必要证据可见组评恢复成功 |
| 重启/交接后身份 exact | ≥0.95，仅 identity_present；absent/conflicting 单独评 UNRESOLVED，不计身份恢复成功 |
| 故事全部轮次双角色/操作正确 | ≥0.75 |
| Marker Schema Validity | ≥0.99，重复执行中的每次整体均 ≥0.98 |
| Streaming Completion Rate | ≥0.99；不得用 buffered 替代 |

每条件的 18 格 Attribution F1 另需 ≥0.85，防止同难度其他场景遮盖单一场景崩溃。每个 SM 主题 State Maintenance F1 另需 ≥0.85。未达到 Gate 4 最终批准的独立故事/事件支持数，或区间不可估的分层，不宣称确认性通过；第一轮开发不能拿远期配额或重复 turn 充当支持数。

原候选统计要求保留为 Gate 3 估算目标：各条件/难度 Attribution F1 单侧 95% 聚类下界 ≥0.85；A/B 正文通过率相对同条件 C0 差值下界 ≥−0.05。它们不是初轮开发的通过依据。状态指标的区间精度、稀有错误上界目标及多条件推断的多重比较策略需在 Gate 4 冻结；未冻结/支持不足则 INCONCLUSIVE，不拿点估计代替。

### 10.3 正文与成本门槛

- 正文固定断言通过率每条件/难度 ≥0.90，相对 C0 的点估计下降 ≤3 个百分点，且满足上述非劣界。C0 本身不过 0.90 则实验任务/模型正文能力不足，不可用低基线放宽 A/B。
- 总 Token 配对平均开销 ≤35%，输入/输出分别报告；首可见正文 p95 延迟相对同条件 C0 增幅 ≤25% 且绝对增加 ≤1 秒；端到端 p95 增幅 ≤35%。短回复同时报告绝对新增 Token，避免百分比掩盖固定包装成本。新增 task_memory 的固定成本独立列出；达不到原预算如实报性能未通过，不删除状态维护要求来改善成绩。
- 所有延迟都以相同硬件/后端和缓存策略测量；缺可信 usage 或真实 streaming 时相应维度为未验证，不得声称完整 GO。
- 若后续确认性设计批准三次重复，则分别报告；任何一次 Attribution F1 比其他重复均值低超过 0.05，标记稳定性不通过。初轮一次执行的跨重复稳定性为未验证。

### 10.4 判定输出

- **CONDITION-SCOPED RESEARCH GO：** 在批准的确认实验中，某一协议在某一条件通过完整性、三难度归属、State Maintenance、闭环、正文、流式、成本及统计支持要求。只支持该条件，不授权正式 Task Graph 写入。
- **FULL-CLAIM SUPPORT：** 同一协议分别在 C1/C2/C3 达标，且 C3 的任务发现/身份建立与状态维护成立，才能支持本阶段完整研究问题在所测范围内成立。只有 C1/C2 通过不能代替 C3；不同条件挑不同协议只能报告组合可行性，不能声称单一协议整体成立。
- **SCOPED FEASIBILITY / NO-GO FOR FULL CLAIM：** 只在简单/中等、单轮或 buffered 条件通过，或语义通过但成本/流式失败。必须写明能做什么和不能声称什么，不能作为完整 GO。
- **NO-GO UNDER TESTED CONDITIONS：** 完整有效实验中语义、持续性、正文或稳定性不达标。按失败体系区分因素，不通过调提示词重测原验证集改判。
- **INCONCLUSIVE / INVALID：** 样本或区间不足、预算中止、完整性/真值缺陷、usage 不可核对等导致必要证据缺失。明确区分“不支持假设”与“尚未测清”。

### 10.5 工程门槛与统计风险上界必须分开

“观测污染率 ≤1%”是有限样本上的工程判定；“总体风险的单侧 95% 上界 ≤1%”是另一个需要足够独立样本的统计主张。前者不蕴含后者，零观测错误也不等于零风险。

若预先定义的事件为“一个独立故事至少出现一次高风险错误”，n 个独立故事零错误时，单侧 95% 精确上界为 `1 - 0.05^(1/n)`。例如 n=6 时约 39.3%，要上界 ≤1% 至少需 n=299 个独立故事。这只适用于故事级二项事件及相应抽样假设，不能直接作为逐 turn 污染率上界；同故事重复、三条件变体和多个 turn 不增加独立故事数。

确认性预算提案必须分别列：工程点估计目标、统计估计对象、独立单位、置信水平/期望区间宽度、每格事件支持数和多重比较处理。如果低风险上界成本不可承担，就明确“风险尚未界定”，不能把远期 108 故事/条件宣称为足以证明 1% 风险。状态指标亦然；缺统计支持不会因 UUID 成绩高而豁免。

## 11. 报告结构与 Owner 待审事项

最终实验报告先回答核心问题，再给证据：研究范围与冻结版本；C1/C2/C3 分开的 A/B 每难度和 18 格；SM1–SM6 独立成绩；闭环与 replay；身份可见性与恢复；正文、流式、Token、延迟；D 开发诊断附表；所有失败与负例；协议/模型/上下文/实验条件的归因；工程门槛与风险上界分开的决定。完整记录通过 manifest 追溯，正常评分全自动，无人工逐条判卷。

Owner 本轮需要审定：

1. 审核 C1/C2/C3 的信息边界、条件特定真值与跨 Session 身份证据要求；保留原出生映射及两轨分离。
2. 审核 task_memory、SM1–SM6 与独立 State Maintenance 定义，以及人工仅处理真值/缺陷/抽样、不逐条判卷的边界。
3. 审核 D 的开发专用两阶段例外，及不得回填 A/B 或参与 GO 的隔离规则。
4. 审核 **Gate 1 仅离线实施计划**。576 次有限开发只是后续预算建议；模型/路由/费用另批，确认性规模必须取得开发数据后重算再批。

当前结论是 `REVISED_DESIGN_READY_FOR_REVIEW`，不是机制 GO，也不是模型 NO-GO。修订交付包括完整设计、差异/矩阵/预算说明及 Gate 1 计划；提交后暂停等待 Owner 审核。
