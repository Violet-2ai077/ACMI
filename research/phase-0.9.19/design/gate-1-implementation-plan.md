# ACMI Phase 0.9.19 Gate 1 Offline Harness Implementation Plan

> 执行约定：仅在 Owner 明确批准 Gate 1 后，使用 `superpowers:executing-plans` 逐任务实施。当前只交付计划，以下步骤全部未执行；不自动启动子代理或独立评审。

**Goal:** 在不调用任何模型、不连接正式 ACMI Host 的前提下，实现可验证的实验协议、条件隔离、状态维护评分与可重放 Harness。

**Architecture:** 公开合成输入经 C1/C2/C3 allowlist 构造请求，fake transport 产生预设原始字节流，A/B parser 生成可见正文和实验提案。独立 Evaluator 从原始归档与冻结 oracle 自动评分，不共享 runner 的解析/语义决策实现；D 只验证开发两阶段计数与隔离。

**Tech Stack:** 依据当前仓库 `package.json` 的 Node `>=24.16.0 <25`、pnpm `11.28.5`；新研究模块使用 ESM `.mjs`、Node 内置 `node:test`/`node:assert/strict`/文件与摘要 API。Contracts 仅语义/类型对照，不新增依赖、不改 package.json/lockfile、不接 provider SDK。

**Spec:** `E:/codex-prj/ACMI/deliverables/phase-0.9.19/model-native-task-attribution-research-design.md`，R2，第 2–10 节。执行前核对 Owner 审核版本与文件 hash；有修订则更新本计划再执行。

## Global Constraints

- 本次授权仅修订设计；创建工作树、实现代码、运行本计划测试，均等待 Gate 1 批准。
- 后续工作树固定建议路径 `E:/codex-prj/ACMI/worktrees/model-native-attribution-research`，不修改 `E:/codex-prj/ACMI/acmi` main，不复用历史实验分支。
- 新代码仅在新工作树的 `research/phase-0.9.19/`；测试证据写入新建的 `E:/codex-prj/ACMI/verification/phase-0.9.19/gate-1/<run_id>/`，已存在输出目录拒绝覆盖。
- Gate 1 只支持 `transport=fake`，任何 live/provider/credential 参数在发送前报错；不读取本机凭据，不安装模型，不启动服务，不向网络发送请求。
- A/B/C0 一个 turn 一次调用；D 仅 `split=dev, diagnostic=true` 可有 answer/marker 两阶段各一次。禁止重试、JSON 修复、补标签和 LLM Judge。
- C1/C2/C3 不合并总分；D 不进入主评分、闭环状态或 GO。用户可见正文与原始输出均保留。
- 研究状态只为提案。不能导入生产 Graph/Binding writer 或通过工具启动它们；无 main、正式 Journal/Registry 的写权限路径。
- 人工只制作/审定 fixture 与 oracle，以及预登记缺陷/抽样复核；正常评分无需人工逐条确认。
- Gate 1 的通过只说明实验程序符合离线合同，不证明模型归属、任务发现、状态维护或 Streaming 能力。

## Review Focus

1. **条件信息泄漏：** C2 隐含注入当前 active、C3 从 ledger 偷带目录或当前快照。任务 1、4、5 必须有 canary 负测试。
2. **身份掩盖状态失败：** UUID 正确但目标、验收、未完成项或决策已陈旧。任务 3 的评分 goldens 必须失败。
3. **同次生成被旁路破坏：** A/B 自动补调、D 输出混入主成绩。任务 5、6 必须拒绝且记账。
4. **原始协议被修复污染：** 重复键、转义和任意 chunk 边界、截断后“补完整”。任务 2、3 必须从 raw 验证且原始字节不变。
5. **恢复变成真值回填：** checkpoint 含隐藏 oracle 或恢复时把错误状态纠正。任务 4、5 必须保持原始错误提案，缺证据就未知。

以上为实施者自查重点，不代表已授权独立评审。

## 文件与接口边界

下文 `R` 表示新工作树中的绝对目录 `E:/codex-prj/ACMI/worktrees/model-native-attribution-research/research/phase-0.9.19`；所有表内文件均在 R 下新建，无现有生产文件修改。命令的工作目录为该新工作树根目录。

| 文件 | 职责 |
| --- | --- |
| `protocol/contracts.mjs` | 常量、字段定义、封闭联合、记录形状的 JSDoc；不得含 oracle 逻辑 |
| `corpus/fixtures.mjs` | 人工合成开发 fixture、独立 oracle、条件特定 birth/state 标签和固定预期计数 |
| `context/build.mjs` | 按条件 allowlist 构造完整请求，验证 source 可见性和身份恢复条件 |
| `protocol/wire.mjs` | A/B 增量解析、可见正文投影、schema/reference 验证，禁止修复 |
| `evaluator/read-raw.mjs` | 独立的完整 raw A/B/D 读取器，不调用 wire.mjs |
| `evaluator/score.mjs` | 出生映射、任务/状态指标、条件分层、失败分类与确定性分数 |
| `ledger/store.mjs` | 实验原始记录、提案、checkpoint、不可覆盖写入、摘要校验 |
| `runner/fake.mjs` | 固定流、截断/失败/计数 fake transport；无网络实现 |
| `runner/run.mjs` | 单次调用、D 两阶段开发限制、预算、中断恢复、原始记录 |
| `report/build.mjs` | 条件独立的 JSON/Markdown 报告、D 附表、支持数和未验证边界 |
| `cli.mjs` | 仅离线 verify/evaluate/report 入口，拒绝 live 模式 |
| `README.md`, `DESIGN.md` | 离线操作、授权边界、研究协议与生产接口不相容说明 |
| `tests/*.node-test.mjs` | 下列任务列明的专用回归文件 |

接口共用的 `AttemptRecord` 至少包含 `attempt_id, family_id, split, context_condition, arm, track, prompt_version, request_hash, raw_hash, finish_reason, stage?, pair_id?, usage, clocks`。state/oracle 形状对应 R2；只共享字段定义，不共享 runner/evaluator 的输出解释实现。

## Task 1 条件输入、身份可见性与人工 Goldens

**Files:** `protocol/contracts.mjs`、`corpus/fixtures.mjs`、`context/build.mjs`、`tests/context.node-test.mjs`、`README.md`、`DESIGN.md`。

**Interfaces:**

- `buildInput(publicScenario, history, {condition, arm, turnId}) -> InputPacket`，参数不能包含 oracle；返回完整消息、source map、opaque IDs 和空 UUID slots。
- `validateFixture(publicScenario, oracle) -> {valid, errors}` 仅离线使用，检查条件标签、来源引用和 family split。
- `getFixture(id) -> {publicScenario, oracle, expected}`，测试调用方负责分隔，runner 不可读取返回的 oracle。

- [ ] 写失败测试：C1 包含目录和 active；C2/C3 序列化请求不含隐藏目录/active canary；C3 只留原始角色/顺序与历史自写标记，不新增总结；4 个空 UUID slots 不含语义。
- [ ] 写失败测试：同一目标在 C1 已登记而 C3 首次出现，condition oracle 分别为 CONTINUE/CREATE；identity_absent 恢复必须 UNRESOLVED，猜中隐藏 UUID 也不能变正确。
- [ ] 运行 `node --test research/phase-0.9.19/tests/context.node-test.mjs`，确认在实现前因缺少预期接口/行为失败。
- [ ] 实现上述三个接口与人工 fixture，保留一个含目标修订、计划/结果、矛盾决策和隔离 canary 的完整短故事；所有期望手工声明，不通过被测 reducer 生成 gold。
- [ ] 运行同一测试，期望全部通过；自查 fixture 输入导出不包含 oracle，文档注明 Gate 1 仅 mock。

## Task 2 A/B 流式协议与状态载荷

**Files:** `protocol/wire.mjs`、`tests/wire.node-test.mjs`。

**Interfaces:** `createWireParser({arm, sourceMap, slots, limits}) -> {push(bytes), finish()}`；`push` 返回可见正文增量事件，`finish` 返回 `{valid, answer, workState, errors}`，保留 original bytes，不修复。

- [ ] 写失败测试：合法 A 与 B 在相同语义 fixture 上归一化相同 workState，含 task_memory；原始 framing v1、payload v2 版本分别校验。
- [ ] 写失败测试：遍历 fixture 每个单一字节切分点、逐字节流和固定随机多 chunk；最终结果一致，JSON escape、UTF-8、多段 marker 均不泄漏。
- [ ] 写失败测试：重复键/ID、未知 source、重复 commit、注入控制串、未闭合 JSON/帧、缺 task_memory 失败；禁止向 raw 加闭括号/补字段。普通正文不因长得像标记而被无条件 regex 删除。
- [ ] 运行 `node --test research/phase-0.9.19/tests/wire.node-test.mjs`，确认失败；实现增量解析与封闭字段/引用检查，不检查 hidden oracle 语义。
- [ ] 再运行同一测试，期望全部通过；有效字段但“wrong task / stale state”输出必须仍可被记录为模型提案，交给 Evaluator 判错。

## Task 3 独立确定性任务与 State Maintenance 评分

**Files:** `evaluator/read-raw.mjs`、`evaluator/score.mjs`、`tests/evaluator.node-test.mjs`、`tests/state.node-test.mjs`。

**Interfaces:**

- `readRaw(rawBytes, {arm, inputPacket}) -> RawPrediction`，不能导入 protocol/wire.mjs。
- `scoreAttempt({inputPacket, oracle, attempt, rawPrediction}) -> ScoreRow`，分开 identity/state/schema/answer。
- `aggregate(rows, {condition, arm, track, split}) -> Metrics`，没有 condition 或发现混合条件即报错；D 只能 diagnostic 输出。

- [ ] 写人工计数 golden：`G={A,B}, P={A,C}` 得 TP=1、FP=1、FN=1；全弃权不达标；重复预测计额外 FP；零分母为 null；格式无效不是正确 UNRESOLVED。
- [ ] 写 birth mapping 测试：不同任意新 UUID 同出生事件可一对一匹配；错 unit/操作不可匹配；后续换 UUID 必须碎片化；不可见旧 UUID 不作恢复成功。
- [ ] 写状态 goldens：七字段族完全正确得 snapshot exact；UUID 全对但过时 criterion 得 identity 正确、state 不 exact；计划→completed、旧决策复活、未完成项丢失、无证据解除冲突均失败；正确无变化必须保留状态。
- [ ] 写联合评分测试：错误身份下“内容正确”的状态仍有 FP/FN；conditional state_given_correct_identity 只诊断；缺整轮状态不可通过。D 标记不进入 A/B 或 GO。
- [ ] 运行 `node --test research/phase-0.9.19/tests/evaluator.node-test.mjs research/phase-0.9.19/tests/state.node-test.mjs`，确认失败；按 R2 公式实现，不使用另一个 LLM 或人工确认回调。
- [ ] 再运行同一测试，期望全部通过；运行同 raw+oracle 两次，规范化分数 JSON 字节相同；审查 import graph 无 wire.mjs、runner、模型 SDK 依赖。

## Task 4 提案账本与无真值恢复

**Files:** `ledger/store.mjs`、`tests/ledger.node-test.mjs`。

**Interfaces:** `openLedger({root, runId, allowedRoot}) -> {appendAttempt(record), appendProposal(proposal), checkpoint(), restore()}`。恢复结果仅为原始消息与 tentative state，写入返回 hash receipt；拒绝覆盖已有 run。

- [ ] 写失败测试：hash 链、重复 attempt、截断文件、跨 run/Session checkpoint、已有输出目录拒绝；无效整轮不更新提案状态，但 raw 始终保留。
- [ ] 写失败测试：语法有效但语义错误的 state 被原样持久化，恢复后不能变成 oracle 正确值；C2/C3 context 不读取最新快照，C1 投影必须保留 model_proposed 来源。
- [ ] 运行 `node --test research/phase-0.9.19/tests/ledger.node-test.mjs`，确认失败；实现原始归档、提案追加、持久化与 hash 校验，不导入正式 writer。
- [ ] 再运行同一测试，期望通过；使用独立 Node 子进程从 checkpoint 恢复，恢复原始 prefix 和输入 hash 与未中断路线一致。

## Task 5 单次调用与 D 开发诊断的离线编排

**Files:** `runner/fake.mjs`、`runner/run.mjs`、`tests/runner.node-test.mjs`。

**Interfaces:**

- `makeFakeTransport(script) -> {generate(request): AsyncIterable<Chunk>, calls()}`，支持预设 bytes/time/error；没有 live 实现。
- `runTurn({inputPacket, policy, transport, ledger}) -> AttemptRecord`，A/B/C0 调用计数上限 1。
- `runDiagnosticPair({inputPacket, policy, transport, ledger}) -> DiagnosticPair`，仅 dev+D 可用，stage 各最多 1；不写闭环 proposal。

- [ ] 写失败测试：A/B/C0 第二次请求被拒绝；超时/断流不补调；live 参数发送前拒绝；fake call count 与账本一致。
- [ ] 写失败测试：D 验证 split 拒绝、D1 截断后 D2 不调用、D1 成功后 D2 精确引用原文、两次总 usage/时间完整；D 不允许回写 A/B ledger；D2 原文范围重叠/越界失败。
- [ ] 写失败测试：前缀失效即停、预算用尽即停、已批准 cap 不因 D1 失败被挪作新题；C1/C2/C3 会话与历史完全隔离。
- [ ] 运行 `node --test research/phase-0.9.19/tests/runner.node-test.mjs`，确认失败；实现预算与离线编排，不实现真实 provider 请求。
- [ ] 再运行同一测试，期望全部通过；fake 运行一段 A/B 三条件闭环及 D replay，所有响应 raw 和失败证据可追溯。

## Task 6 报告、工程门槛与统计支持保护

**Files:** `report/build.mjs`、`cli.mjs`、`tests/report.node-test.mjs`、`README.md`、`DESIGN.md`。

**Interfaces:** `buildReport(metricsByCondition, diagnostics, manifest) -> {json, markdown}`；`evaluateArchive({archiveRoot, oraclePath})` 为纯离线入口，读取原始归档重算，不信任 parsed 文件中的预测标签。

- [ ] 写失败测试：输出三个条件独立表、18 格/SM 主题及支持数、identity_absent 的 N/A、D 独立附表；不得生成跨条件 overall F1 或 D-inclusive GO。
- [ ] 写失败测试：6 个故事零错误不能报告 ≤1% 风险；工程点估计与风险上界在不同字段；开发批次结果始终 exploratory，缺支持的区间标不可估。
- [ ] 写失败测试：UUID 成绩完美而 State Maintenance 失败，整体“持续维护”不得通过；C1 通过不能宣布 C3 任务发现成立。
- [ ] 运行 `node --test research/phase-0.9.19/tests/report.node-test.mjs`，确认失败；实现报告与仅离线 CLI，不向模型/人工请求判断。
- [ ] 再运行同一测试，期望通过；为 CLI 文档写清输入/输出路径、审批边界、失败处理和不可替代模型证据的限制。

## Task 7 Gate 1 全链路验收与停点

**Files:** `tests/offline.node-test.mjs`；只更新研究模块 README/DESIGN，不改根脚本。

- [ ] 写并运行 end-to-end 测试：从人工场景分离公开输入/隐藏 oracle，经 fake 原始流、协议、ledger、进程恢复，到独立 evaluator 和报告；模拟 8 turn 后返回旧任务，身份正确但状态陈旧的对照必须被检出。
- [ ] 最小全集命令：`node --test research/phase-0.9.19/tests/context.node-test.mjs research/phase-0.9.19/tests/wire.node-test.mjs research/phase-0.9.19/tests/evaluator.node-test.mjs research/phase-0.9.19/tests/state.node-test.mjs research/phase-0.9.19/tests/ledger.node-test.mjs research/phase-0.9.19/tests/runner.node-test.mjs research/phase-0.9.19/tests/report.node-test.mjs research/phase-0.9.19/tests/offline.node-test.mjs`。期望 exit 0，全部 case 通过，不预先虚构测试数量。
- [ ] 同一归档执行两次评分，分数/报告正文 byte-identical；固定 fixture 的每个单字节切分及随机 chunk 重放都一致。完整网络发送计数=0、生产 writer 调用数=0；fake 不能当真实 Streaming 成功证据。
- [ ] 运行 `git diff --check`，检查新增/修改路径只属于研究模块；对照前后 main HEAD/status 和指定生产状态哨兵未变，不扫描无关用户目录。
- [ ] 按实际改动范围扩展本地仓库回归；若触及共享 Contracts/生产入口，立即停下重新请 Owner 审核，不把扩大修改视为原授权。
- [ ] 提交文件清单、diff、自查与测试日志、协议 fixture、确定性分数和未验证项。是否创建本地提交按 Owner 当时指示执行，不自动 merge/push。
- [ ] 暂停。Gate 1 不执行第 5.5 节的 576 次实验，也不自动接入 live adapter；另行提交 Gate 2 的模型、路由和成本申请。

## Gate 1 退出条件

上述离线测试通过，且 C1/C2/C3、State Maintenance、D 限制、原始证据和无正式写入可复现，才记 `OFFLINE_HARNESS_READY_FOR_OWNER_REVIEW`。模型实际 schema 成功率、同次生成能力、任务发现/维护能力、真实流式、usage 和延迟仍全部未验证；不得以离线通过宣称研究 GO。
