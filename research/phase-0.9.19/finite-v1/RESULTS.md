# FM1 有限机制验证：结果与停止记录

日期：2026-11-16，Asia/Shanghai。状态：**研究闭环完成，停止调用；条件性可行，非可靠状态维护 GO**。

## 一句话结论

在明确状态政策、显式目标措辞、引用锚点和完整历史的受控条件下，模型能够在
同一次生成中回答并建立/延续任务身份，C2/C3 已有真实连续证据；但正确的正文
和身份不保证正确的工作状态，已观察到错误决策、UUID 漂移及错误工作项持续保留，
因此不支持可靠的完整状态维护，更不支持无提示支架的自然对话或产品级 GO。

## 1. 授权、冻结与实际执行

- 本轮是 Owner 2026-11-16 明确授权的**新有限机制研究路径**，不是旧 G1/P-G
  已通过，不是旧工程失败已修复。原门槛、FAIL、历史代码/分数/归档不变。
- Owner 随后明确允许对网络、服务商等环境异常重试。冻结方案采用每坐标最多一次、
  全批最多 12 次环境重试，48 个研究 turn、最多 60 次实际生成，未用满不追加。
  超时原因仍标未知；状态/标记/答案失败不允许重试。实际没有触发任何重试。
- 新协议 `FM1-20261116`，批次 `fm1-20261116`。A 是 JSON Structured Sidecar；
  B 是正文后原生 `<|fm1:state|>…<|fm1:end|>` 标记。它们是**独立的简化协议**，
  不冒充历史 ENVELOPE/inline 协议，不与旧 exact 分数作提高幅度比较。
- 冻结提交：`e2247ec6795b789c1c49b07c8abe4e6cd42aef46`，在首次调用前完成。
- 冻结 manifest SHA-256：
  `8c4f1285bcbe367682eca7a231f6c8f5c059902e32ae0491f032bc48bfaef2ec`。
- 作者与冻结前审定者均为本次 Codex，依据 Owner 委托自查；**没有独立评审**。
  冻结前发现并修改一处 `cold check` 引用不唯一，初次测试 40/41、修正后 41/41。
  之后又明确了“请求提及两个任务”的归属规则和显式工作项范围，重新测试、生成
  唯一冻结，再开始实际调用。没有观察输出后修改 prompt、oracle、阈值或规则。
- 本地/远程起点均核对为 main `d854c36…`、研究归档 `c38abf6…`，均干净。
  指定 `RESEARCH-ARCHIVE.md` 不存在，实际归档说明在
  `evidence-archive/2026-11-16/README.md`；没有解压或执行历史归档。
- 执行时间：**2026-11-16 01:04:29.714—01:24:17.723 UTC+08:00**。
  原始文件时间为 UTC，未改写原始时间戳。
- DSH `0.2.1-rc.2` 所选 `opencode-go/deepseek-v4.1-flash`，实际响应身份逐请求保留。
  通过已有 DSH 配置/凭据引用与研究传输适配器调用，**不是启动 DSH Host 会话**。
  服务别名可变，未证明权重快照不变；未切换 provider 或配置账户。
- Node `v24.16.0`；thinking enabled、reasoning effort max、max_tokens 16384；
  180000 ms、1 MiB raw Fetch body admission limit 均保持，未因结果调整。

## 2. 实际实验清单

两个叙事：`amber-filter`、`jade-kit`，每条 4 轮。二者共享部分转移骨架，
不是从总体随机抽取的独立样本。跨条件/臂复用同一叙事，不把 48 turn 当 48
个独立实验，也不把 12 条执行轨迹叫作 12 个独立故事。

C1 有初始目录、状态与历史；C2 只有带已有 UUID 的工作历史，没有活动状态投影；
C3 历史没有旧 UUID、目录或参考 assistant，由模型自行选择可见空闲 UUID 建立身份。
各条件/臂隔离上下文。每次完整的实际模型正文与 reasoning 都原样进入该轨迹下一轮；
没有修正标记、摘要、参考状态、oracle 注入或丢弃错误历史。

| 条件 | 臂 | 故事 / 完整轨迹 | 研究 turn / 实际调用 | 完成 | 失败 / 证据不完整 / 未发送 | 请求均值秒 / 最大秒 | provider total tokens |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: |
| C1 | A | 2 / 2 | 8 / 8 | 8 | 0 / 0 / 0 | 21.157 / 53.844 | 26,359 |
| C1 | B | 2 / 2 | 8 / 8 | 8 | 0 / 0 / 0 | 23.455 / 43.647 | 30,162 |
| C2 | A | 2 / 2 | 8 / 8 | 8 | 0 / 0 / 0 | 17.248 / 24.682 | 24,198 |
| C2 | B | 2 / 2 | 8 / 8 | 8 | 0 / 0 / 0 | 26.928 / 52.901 | 31,577 |
| C3 | A | 2 / 2 | 8 / 8 | 8 | 0 / 0 / 0 | 22.064 / 51.850 | 28,039 |
| C3 | B | 2 / 2 | 8 / 8 | 8 | 0 / 0 / 0 | 37.616 / 131.258 | 35,985 |

- **48 次完成、0 失败、0 未发送、0 重试、0 工程修复批次**，尚有调用预算不使用。
- 全为 CLOSED-LOOP。FROZEN-REPLAY、D、C0、跨 Session/handoff 均为 0。
- 每个条件/臂的难度为 simple 2、medium 2、hard 4；难度是设计标签，
  不是已校准的自然任务难度。只有四轮短对话，不能外推长会话稳定性。
- 48 次都有 usage：prompt 84,329、completion 91,991、total 176,320，
  reasoning 73,015 已包含在 completion 中，不能重复加总。
- Provider 的 `usage.cost` 每次报告 0；`opencode.list_cost` 合计
  0.06310239、`allowance` 合计 0.03786129，`billing_source=go`。
  **这些是原始 provider 字段，不是已核验账单；币种和实际扣费未知**。
  没有把未知实际费用记作零，也没有假定美元。
- 客户端请求时长合计 1,187.730 秒，均值 24.744 秒，范围 6.990—131.258 秒。
  含客户端采集开销，不是纯模型计算时长；content 首片段不等于用户可见正文 TTFT。
- raw Fetch body 共 6,111,797 字节，单次最大 652,761 字节，未触及 1 MiB。
  因而本轮的机制结论没有被容量限制截断，也不需要容量优化或放宽上限。

## 3. 冻结分层评分：不能用一种成功代替另一种

所有分母为该格 8 个 turn；括号中的轨迹指标另以 2 条完整轨迹为分母。
结构有效不等于 canonical 引用符合政策。`facts` 只去掉引用 source_id 和证据列表，
仍要求相同目标/项目锚点、状态、依据、决策、冲突及生命周期；它不是自由语义 Judge。
完整 exact 同时要求事实与引用。完整状态列不含当前归属/UNRESOLVED，二者分列。

| 条件/臂 | 协议 schema | 归属 exact | 出生 created exact | 身份记忆 exact | State facts | 引用 exact | 完整 State exact | 基本回答词法 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| C1/A | 8/8 | 7/8 | 8/8 | 7/8 | 5/8 | 5/8 | 5/8 | 7/8 |
| C1/B | 8/8 | 6/8 | 7/8 | 6/8 | 3/8 | 3/8 | 3/8 | 5/8 |
| C2/A | 8/8 | 7/8 | 8/8 | 8/8 | 7/8 | 8/8 | 7/8 | 6/8 |
| C2/B | 8/8 | 7/8 | 8/8 | 8/8 | 4/8 | 4/8 | 4/8 | 7/8 |
| C3/A | 8/8 | 7/8 | 8/8 | 8/8 | 6/8 | 6/8 | 6/8 | 7/8 |
| C3/B | 8/8 | 7/8 | 8/8 | 8/8 | 6/8 | 5/8 | 5/8 | 6/8 |

所有格 grounded 均为 8/8：模型引用的文字都在可见 source 中唯一出现，
但有些不是冻结政策要求的首定义锚点/事件标签，故 grounded 不替代引用 exact。
字段级原分保留在 `scores.json` 的 `field_exact`，未改权重或增设补救分数。

| 条件/臂 | 四轮身份全部正确的轨迹 | 四轮 State facts 全正确 | 四轮完整 State exact 全正确 |
| --- | ---: | ---: | ---: |
| C1/A | 1/2 | 0/2 | 0/2 |
| C1/B | 1/2 | 0/2 | 0/2 |
| C2/A | 2/2 | 1/2 | 1/2 |
| C2/B | 2/2 | 1/2 | 1/2 |
| C3/A | 2/2 | 0/2 | 0/2 |
| C3/B | 2/2 | 0/2 | 0/2 |

C2 两个通过的状态轨迹都是 **同一个 jade-kit 故事的 A/B 执行**，不是两份
独立叙事证实。它们最后一轮仍有归属 exact 失分，不能据此宣称全协议闭环通过。
没有一个条件/臂在两个故事上都满足冻结的“所有轨迹全部状态通过”要求。
不计算混合 C1/C2/C3 总成绩，不据这个小样本给 A/B 作统计优劣或因果排名。

## 4. 失败解释与原始字段定位

下面是对冻结错误的案例解释，不是新增评分、第二个 Judge 或放宽后的成绩。
编号是 `plan.schedule.index`，对应 `scores.rows[index-1]`。原始 `result.json`
的 `/content` 经冻结 A/B 解析后，按表中 pointer 定位；输入 `request.json`
保留所有实际上下文。`analysis/supplement.json` 包含案例原文、原分与原文件摘要。

### 4.1 可证实的实质状态错误

**正文选绿，状态选蓝。** jade-kit t4 的 C1/B #43、C1/A #44、C3/B #47、
C3/A #48，正文均正确说明 Owner 选择 green tape，但
`/state/tasks/0/decision/ref/quote` 为 `use blue tape`，oracle 是 `use green tape`。
原 u4 明确要求绿、u3 明确给出两种选项，所以不是同义引用或不可见依据。
这直接否定“正文理解正确即可依赖 sidecar 正确记录决策”的强假设。
上下文逐字核验通过；错误生成的内部原因未知，不推断必然是某种记忆机制。

**已有身份被换为新槽位。**

- C1/B amber #14 t2 已建立铜色说明任务 UUID 尾号 `102`；#26 t3 改成
  当轮新槽位 `103` 并错误写入 created。#38 t4 继续使用 `103`，污染归属。
- C1/A jade #20 t2 已建立标签任务 `202`；#32 t3 记成 `203`，没有相应 created。
  #44 t4 又恢复 `202`。这是可观察的漂移后恢复，不是单调恶化。
- 两者原 assistant 标记都完整存在于后续输入，没有 UUID 被工具截掉的证据。
  C1 初始目录与后续历史的关系是否增加了混淆，本设计不能作因果区分。

**额外工作项持续保留。** C1/B amber #2 与 C2/B amber #3 在首轮把
“plan the patch and tests…”另建为工作项；违反公开的“仅显式命名工作锚点”规则。
该项分别在 #14/#26/#38 和 #15/#27/#39 保留到第四轮，仍是 planned；与此同时
末轮主任务 lifecycle 已是 completed。这不只是换了引用 source，也暴露出
模型自己输出的“completed 任务仍含 planned 工作项”的内部不一致。
它证明错误可以持续，不能据四轮就声称错误会无限增长。

### 4.2 表示、引用与政策可辨识性

- C3/B amber #18：State facts=true，但 evidence 引用 `patch filter is done`
  而非规定事件标签 `filter patch claimed`。二者 grounded，但 reference exact
  失败；t3 #30 恢复到 full exact。这里不能说它误把 reported 当 observed。
- jade t4 的六个输出都用 `archive the old item` 作为 unresolved 范围，而冻结
  oracle 是 `Also archive the old item`。二者都在当前原文中唯一出现，公开协议
  要求 exact scope，但没有充分排除省略连接词的有效跨度。**归属 exact 失分
  存在评分可辨识性限制，不能直接解释为模型没有发现歧义。** 原分保留。
  其中 #43/#45/#47/#48 还把 label 加入 task_ids；究竟是把候选任务误作 assignment，
  还是把澄清请求看作对两个任务的提及，当前简化协议不能完全区分。
- amber t4 六个输出对 `fix third case` 都用 completed/observed，而 oracle
  是 completed/accepted。u4 同时说 Owner 观察执行并接受任务，公开协议又要求
  不因任务验收升级未变工作项；虽然这一项是新完成，任务验收是否等于该工作项
  acceptance 的层级语义仍有解释空间。**这是冻结政策分类差异，不是 reported
  被错误升级 completed 的证据，也不能单独用来否定语义维护能力。**
  #40 只有这个 basis 字段不同，其他引用与状态全部相同。

### 4.3 也必须报告的正面观察

- 本轮 planned、reported-only、observed 和 task accepted 的核心区分有直接观察：
  自报未验证的工作保留 ready/reported；原始观察完成后才改 completed/observed。
  没有从本轮原字段发现历史那类 reported-only 工作直接 completed 的同型反例。
  这是这两个受控故事的观察，不是新增错误率评分或对历史失败的撤销。
- jade t4 并未把 Owner 的胶带决策当作任务验收；任务保持 ready。即使其中决策
  选项写错，也不能说它完全丧失了 observed 与 task accepted 的区别。
- C2/C3 A/B 的身份记忆每轮均通过；C3 没有借用参考 assistant 的出生 UUID，
  是模型在 t1 建立主任务、t2 建立另一任务，之后切回并保留两者。
  这填补了历史 C3 仅 replay 不能覆盖的连续出生/维护缺口。
- 目标更改、验收 superseded、明确失败冲突与解决均真正进入本轮轨迹，非仅凭
  故事名字宣称覆盖。具体字段原分和四轮顺序见 supplement 的 trajectories。

### 4.4 基本回答、协议与采集不可混同

基本回答冻结指标是严格词法断言，不是语言质量评分。例如 jade t3 要求出现
`disputed`，输出的 `tape dispute remains open` 仍失分；jade t4 有直接问
“kit or label?”的回答，因没有 `clarify` 仍失分。amber #2 给出正确总数与
测试计划下一步，但未出现 `patch`，也失分。不能把表中这些失败全称为未完成
用户基本任务，亦不在事后补同义词提高分数。无 C0，无法回答“不牺牲答案质量”。

本轮协议结构和采集均有效，没有协议缺失或采集错误可解释上述状态反例。
这只说明本次运行没有环境阻塞，不证明环境永远稳定，且有限重试分支没有 live
覆盖。服务条件、模型权重变化和长上下文效应均未被实验隔离。

## 5. 证据、核验与复现

研究根为 `research/phase-0.9.19/finite-v1/`：

| 材料 | 路径 | 内容 |
| --- | --- | --- |
| 冻结方案 | `PLAN.md` | 问题、条件、规则、停止/重试边界 |
| 冻结包 | `frozen/manifest.json` 及同目录文件 | public、oracle、A/B prompt、48 槽位、route、自查及递归本地代码摘要 |
| 每次真实输入 | `evidence/NN-story-Cx-arm-tN-a1/request.json`、`input.json` | 实际 JSON 请求字节、路由非秘密 header、source 映射及前序输出 |
| 每次原始采集 | 同目录 `events.jsonl` | request、fetch_invoked、HTTP metadata、各原始 Fetch chunk/base64、解码 delta、真实 terminal |
| 原始返回 | 同目录 `result.json` | 原始 content/reasoning、返回模型身份、usage、finish、摘要、时延、完整性 |
| 运行账本 | `evidence/start.json`、`attempts.jsonl`、`end.json` | 冻结 commit、48 实际调用、0 retry、0 halt、0 未发送 |
| 冻结评分 | `analysis/scores.json` | 逐格、逐行、逐字段分数和 expected/actual pointer |
| 核验 | `analysis/verification.json` | 输入/逐轮 lineage/原始流重解码/terminal 检查及证据文件 SHA-256 |
| 案例与描述统计 | `analysis/supplement.json` | 再现一致性、延迟/usage、轨迹矩阵、原字段摘录；不产生新评分 |
| 回归 | `analysis/final-tests.txt` | 41/41，含新协议与已有传输/路由相关测试 |

核验结果：所有 48 请求与预定消息构造字节相同；每次恰好一个实际 fetch invocation；
所有原始 chunk 重解码所得 content/reasoning/finish/usage/model/id/DONE 与原结果一致；
delta 拼接一致；真实 terminal 存在；下一轮使用前次未经修改的 content 和 reasoning。
所有冻结摘要保持，48 份确定性评分在另一进程重新执行后与存储结果完全一致。

`scores.json` SHA-256：
`3546152b3af8a6bf4e2c4441e46e5285cdd6d718191fca949772ae13ed9839b4`。

未发生恢复：没有重建缺失 terminal、覆盖失败、拼接 partial、替换旧结果或执行
历史 batch。`wire` 是 Fetch 交付的响应体字节，不是 TLS/TCP 抓包。保留 read
边界；未声称掉电持久化、全域 native 错误处理或硬 RSS 保证。

安全检查：选定真实凭据字节未出现在新产物中，强密钥/私钥签名未命中；发布前另
检查 base64 解码后的原始 wire。只有合成场景，无真实用户数据。通用 security
scanner 对本目录报告 files_scanned=0，**不把这个空扫描称为安全覆盖**。

## 6. 结论适用域与停止

FM1 是显式 goal/acceptance/work 措辞、backtick 引用锚点、简化 schema、4 轮、
单 provider/alias、两叙事、单次采样的受控机制实验。尤其 C3 仍有目标边界提示
和 UUID 槽位，不是完全无标注自由对话；没有证明自动发现任意粒度的真实任务。
新协议与旧协议同时有多处差异，不能归因“某一提示改动修好了状态维护”。

本轮最强的新证据不是容量或工程通过，而是：**C2/C3 连续出生/身份保持可以在
受控条件下实现；即便正文明确正确，输出的决策状态仍可错误。** 对观察/验收层级
及范围引用的若干失分，现协议仍不足以区分能力失败和评分政策歧义。

已完成本轮有限闭环，停止模型调用和工程扩展。没有进入第二研究阶段，没有使用
剩余额度，没有合并 main，没有续做 ME/S2/MC/SC。后续若另行研究，最有限且直接
相关的方向是：先澄清工作项 acceptance 与歧义 scope 的公共契约，再用新冻结、
更少目标标签的短轨迹复核“正文正确但决策标记错误”，而非继续容量优化。本轮不执行。

研究分支 `codex/finite-mechanism-20261116`；基于归档分支，不改 main。
冻结提交如上，结果提交与远程核验见同目录 `DELIVERY.md`。
