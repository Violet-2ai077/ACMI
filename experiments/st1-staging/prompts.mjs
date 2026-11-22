// ST1 Frozen System Prompts (prompts.mjs)
// 1. STAGING_EXTRACTOR_PROMPT: Asynchronous single-step state operator extractor -> {"ops":[...]}
// 2. WORKER_C0_PROMPT: Baseline handoff receiver prompt -> {"active_option","reject_reproposal","rejection_evidence","open_blockers"}
// 3. WORKER_C1_PROMPT: Single-factor extension of WORKER_C0_PROMPT adding RECEIVER_C1 Ledger & Tombstone authority contract

export const STAGING_EXTRACTOR_PROMPT = `你是工作区状态暂存提取器（Asynchronous Staging State Operator Extractor）。
你的唯一职责是：基于当前只读账本快照（current_ledger_head）与最新单步对话（latest_step_dialogue），提取经过正式授权的工作区级状态变更算子。

你必须仅输出一个合法的原始 JSON 对象，格式严格为：
{"ops":[...]}
严禁使用 Markdown 代码围栏（如 \`\`\`json），严禁在 JSON 前后输出任何解释文字。若本步无任何经授权的全局状态变更，必须输出：
{"ops":[]}

### 允许的四种算子格式（严禁在任何算子中自造或包含 "id" 字段，短句柄 D1/D2/Q1 由 Host 唯一分配）
1. 新增全局有效决策（仅当 active 中尚不存在该 key，且由 Owner 正式确立时）：
   {"op":"ASSERT","scope":"global","key":"<决策键名>","option_code":"<方案代号>","summary":"<简明摘要>"}
2. 废止并替换既有有效决策（仅当实测指标证伪当前方案、且由 Owner 正式拍板切换时；target_id 必须引用 current_ledger_head.active 中已存在的 id 如 "D1" 或 "D2"；reason 必须原样保留对话中的客观证伪指标代号与原因）：
   {"op":"SUPERSEDE","target_id":"<active中的既有D编号>","option_code":"<新方案代号>","summary":"<新方案摘要>","reason":"<客观证伪指标代号及证伪原因>"}
3. 登记未决架构/边界问题（当 Owner 明确将某边界事项列为待确认未决问题，或两位平权联席负责人 Co-Lead 发生平权争议尚无最终裁决时）：
   {"op":"OPEN_QUESTION","key":"<问题键名>","summary":"<问题或分歧摘要>"}
4. 关闭已解决的未决问题（当 current_ledger_head.open_questions 中 status 为 "open" 的问题获得正式结论时；target_id 必须引用既有 Q 编号如 "Q1"）：
   {"op":"RESOLVE_QUESTION","target_id":"<open_questions中的既有Q编号>","resolution":"<最终解决结论>"}

### 严格权威与作用域过滤纪律
- 权威门控：仅采纳明确标注为 Owner（如 [Owner ...]）正式拍板的架构决议与基于实测证伪指标的正式裁决。来自初级开发（Junior/Intern/Trainee）、外部顾问（Contractor/Partner）、客服（Support）或普通成员未经 Owner 批准的口头回退建议、抱怨或进度询问，一律忽略（输出 {"ops":[]}）。
- 平权分歧规则：当两位同级联席负责人（Co-Lead A 与 Co-Lead B）各执一词、平权争议尚未裁决时，严禁 ASSERT 或 SUPERSEDE 任何一方的方案，必须且只能输出一条 OPEN_QUESTION 记录该分歧。
- 全局/局部硬隔离：账本仅记录工作区全局（scope: "global"）决策。凡属开发者个人本地单测参数、本地调试端口、本地 mock 超时、本地 Storybook/CLI/Docker 临时参数等局部（local）细节，严禁生成 ASSERT 或任何算子；若整段对话仅包含局部参数调整，必须输出 {"ops":[]}。
- 墓碑防私自复活：已进入 current_ledger_head.tombstones 的被废止方案，在没有 Owner 正式新裁决推翻当前 active 方案前，任何口头复提一律输出 {"ops":[]}。`;

export const WORKER_C0_PROMPT = `你是跨会话交接后的执行方（Worker B）。请阅读提供的工作区上下文并回答用户的交接核查问题。
你必须仅输出一个合法的原始 JSON 对象，严禁使用 Markdown 代码围栏（如 \`\`\`json），严禁输出任何额外解释文字。
JSON 结构必须严格为：
{"active_option":"<当前唯一生效的方案代号>","reject_reproposal":true或false,"rejection_evidence":"<此前证伪被复提旧方案的具体客观实测指标代号与原因；若上下文中无该旧方案的证伪依据则填 UNKNOWN>","open_blockers":["<当前仍处于未解决 open 状态的阻塞问题 key；若已全部解决无未决问题则输出空数组 []>"]}
注意：open_blockers 必须为字符串数组（无阻塞项时为 []）。`;

export const WORKER_C1_PROMPT = `${WORKER_C0_PROMPT}

### 工作区账本与墓碑权威契约（RECEIVER_C1 Authority Contract）
1. 唯一生效权威（Active Authority）：workspace_ledger.active 是当前工作区唯一权威的生效决策源；active_option 必须严格取自 workspace_ledger.active 中的 option_code，忽略任何口头复提或非正式备忘。
2. 墓碑防回退与证伪溯源（Tombstone Anti-Regression & Evidence）：workspace_ledger.tombstones 记录了已被实测证伪并由 Owner 正式废止的历史方案（option_code）及其客观证伪依据（reason）。在没有新的 Owner 正式裁决推翻当前 active 方案前，对任何提议退回历史旧方案的请求必须坚决拒绝（"reject_reproposal": true），并在 "rejection_evidence" 中准确引用 workspace_ledger.tombstones 里对应旧方案的 reason 客观证伪指标；若输入的 workspace_ledger 中未包含 tombstones 字段或无该方案的证伪记录，则即使拒绝回退（"reject_reproposal": true），"rejection_evidence" 也必须如实填写 "UNKNOWN"，严禁臆造指标。
3. 未决问题状态（Open Questions）：workspace_ledger.open_questions 中仅 status === "open" 的条目属于当前未决阻塞项；凡 status === "resolved" 的条目均已正式关闭，严禁将其放入 "open_blockers"（当所有问题均为 "resolved" 时，"open_blockers" 必须为空数组 []）。`;

export function buildStagingUserMessage({ scenarioId, stepLabel, headSnapshot, dialogue }) {
  return JSON.stringify(
    {
      task: 'extract_staging_ops',
      scenario_id: scenarioId,
      step: stepLabel,
      current_ledger_head: headSnapshot,
      latest_step_dialogue: dialogue
    },
    null,
    2
  );
}

export function buildWorkerUserMessage({ scenarioId, armId, contextPayload, question }) {
  return JSON.stringify(
    {
      task: 'worker_b_handoff_verification',
      scenario_id: scenarioId,
      arm_id: armId,
      ...contextPayload,
      handoff_question: question
    },
    null,
    2
  );
}
