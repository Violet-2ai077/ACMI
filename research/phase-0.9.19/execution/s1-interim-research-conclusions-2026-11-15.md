# S1 中期研究结论：身份归属、状态维护与覆盖缺口

日期：2026-11-15。授权：仅 S1，只读综合已有证据。状态：**S1 COMPLETE / S2 NOT AUTHORIZED**。
原研究结论保留 **EXPLORATORY_NOT_GO**；完整主张为 **INCONCLUSIVE**。

## 1. 核心结论

现有真实输出支持一个有限命题：模型可以在回答用户的同一次生成中给出有效归属
标记，并在一个有任务目录的单任务闭环中连续保持正确归属。**尚不支持“自主发现、
跨条件持续准确维护工作任务”的完整命题。**

本次综合进一步区分了状态失败的来源：

1. **表示与引用不一致**：原状态指标比较结构化原子及字面证据。可见原文中不同的
   合法片段、额外 evidence、工作项/决策的额外拆分都会伴随 exact 失败；这不等于
   模型完全不理解工作。但本次不估计这些因素各自贡献了多少失分，不改原成绩。
2. **不只是格式问题**：r4 在 reported 证据下标 completed、遗漏独立 checksum 工作项、
   延后一轮提出生命周期变化等差异可以定位到原始字段。不能把所有失败归咎于严格 exact。
3. **错误会进入后续上下文**：r4 C1/A 的七次后续请求确实包含前一轮原始输出，
   新引用和额外拆分在之后继续出现。但首轮已失败，不能只用多轮累积解释初因；
   没有匹配反事实，不能证明“旧状态导致后续错误”的因果关系。
4. **C2/C3 的缺口主要是未观察，不是零分**：已有稀疏 replay，尚无 A/B 闭环，
   不能从 C1/A 推出 C3 身份出生与持续维护，也不能据缺失否定 C2/C3 能力。

P-G FAIL 仍是工程候选失败，不是模型研究 NO-GO。R-C 未闭合仍限制未来采集。
本次不恢复工程优化、不改变准入范围、不启动 S2。

## 2. 方法、来源与分母

### 2.1 本次做了什么

- 读取 r1-r4 原 `report.json`，逐行复制既有 score/transport 字段并建立坐标索引。
- 根据冻结 schedule 的故事、轮次、probe 和 R2 臂定义列出完整覆盖表；仅计数，
  不生成或调用新评分函数，不导入 evaluator，不运行旧 report/summarize 脚本。
- 解码 r4 原账本的 reserve、pre_send 和 model 通道，保留事件 seq 与原文件摘要。
  35 个 reserve 请求摘要均匹配；35 个实际请求的消息尾部均与 pre_send 原消息一致。
- 对已有效的 C1/A JSON 做字段展示，与原 oracle 并列；不修复模型 JSON、不重新解析
  B 协议、不作新的通过/失败裁决。案例解释不是另一个 LLM Judge 或人工逐条评分。
- 检查七个闭环边：t2-t8 输入中最后一个 assistant 消息，均逐字等于前一轮模型输出。
  这是输入传递事实，不是状态正确性评分。

授权边界裁定：S1 是分析任务，适用原证据目录与只读操作，不新增实现/TDD/独立评审
代理，不执行实现计划中的提交、集成或工作区清理流程。既有未提交变更原样保留。

### 2.2 证据地址约定

下文 R1/R2/R3/R4 指各原始报告，不是重算报告：

| 标识 | 原文件（绝对路径） | 冻结 SHA-256 |
| --- | --- | --- |
| R1 | E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/live-20261114-r1/report.json | 4a892986a5eaf553c35920e8d7b68ac68e7864d2c91f3ec7990a5a20ba65f153 |
| R2 | E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/live-20261114-r2/report.json | 312d07a46eca6430045571756dc962762d6b0dc55c17cb8d4ed3cc78d0e3acb7 |
| R3 | E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/live-20261115-r3/report.json | a335bd5c340249021e534a3a8de23f079e504308cae41bd8350ea6c07470d168 |
| R4 | E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/live-20261115-r4/report.json | 9be9d99829e457b01f68578f652d6e4847b29a8503bc335bfc9580057608fac4 |

冻结摘要不是 report 文件摘要。后者及其他直接来源摘要记录在本次派生证据根
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-s1-research-synthesis-20261115/`
的 `source-catalog.json`；`live-before.json` 另记录本轮读取前全部 live 文件摘要。

原始 r4 账本 J4：E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/live-20261115-r4/development/events.jsonl。
冻结 O4/P4/S4 分别是同批 development-r4 下 oracle/corpus.json、public/corpus.json、
plan/schedule.json。下文 JSON pointer 从原文件根开始；账本引用使用 seq，不假定行号。

### 2.3 批次漏斗（不是跨条件成绩）

| 批次 | 原计划 | 已发送 | 传输完成 | 有存储 score | 其中有 marker schema 字段 | marker schema=true | 未发送 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| r1 | 576 | 1 | 0 | 0 | 0 | 0 | 575 |
| r2 | 576 | 3 | 2 | 2 | 2 | 2 | 573 |
| r3 | 576 | 29 | 28 | 25 | 17 | 10 | 547 |
| r4 | 576 | 35 | 34 | 29 | 21 | 17 | 541 |

这是存储字段的数量核对，不是同次生成成功率。r4 的 21 个 marker score 包括
16 个 A/B 和 5 个 D2；另外 8 个 score 是 C0。D1 没有任务标记 score，不能记为失败。
“可评分”不等于“协议有效”：已完成但 schema 无效的响应仍有冻结失败分数。
上表四个计划互不拼接，不把未发送槽位视为调用余额或模型零分。

`coverage-by-batch-family-condition-arm-track-difficulty.csv` 有 1,512 个覆盖格，包含
四批次、六故事、三条件、七种臂/轨道/阶段组合、三难度；逐批 planned 合计核对为
576，sent 合计核对原报告。D/replay 的 medium 格 planned=0，不能说成漏跑。

## 3. C1/A：归属正确但状态失败

主要依据 R4 `/rows/0` 至 `/rows/7`，均为 manifest-continuity / C1 / A / CLOSED-LOOP。
schema、用户/assistant 归属均正确；active/focus 正确。只是一条故事，不是八个
独立样本。简单 2、中等 2、困难 4 轮的完整 snapshot exact 分别为 0/2、0/2、0/4。

### 3.1 七字段与状态转移：原存储指标

表中数值是 `score.state.by_field.*.f1` 的逐行展示，四舍五入至四位；完整精度见
`state-fields-stored.csv` 和原报告。N/A 是原 null，不补成 0 或 1。

| turn / 难度 | objective | criteria | work | completion | decisions | conflicts | lifecycle | macro F1 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| t1 / simple | 0 | 0 | 0 | 0 | N/A | N/A | 0 | 0 |
| t2 / simple | 0 | 0 | 0 | 0 | N/A | N/A | 1 | 0.2000 |
| t3 / medium | 0 | 0 | 0.3333 | 0 | 0 | N/A | 1 | 0.2222 |
| t4 / medium | 0 | 0 | 0.2857 | 0 | 0 | N/A | 1 | 0.2143 |
| t5 / hard | 0 | 0 | 0.2857 | 0 | 0 | N/A | 1 | 0.2143 |
| t6 / hard | 0 | 0 | 0 | 0 | 0 | N/A | 1 | 0.1667 |
| t7 / hard | 0 | 0 | 0.2500 | 0 | 0 | N/A | 1 | 0.2083 |
| t8 / hard | 0 | 0 | 0.2222 | 0 | 0 | N/A | 1 | 0.2037 |

八轮 `state_given_correct_identity=0`；transition 在 t1-t4、t6-t7 均为 0，
其余为 null；retention 在 t5/t8 为 0，其余 null。不能用 t2-t8 lifecycle=1
替代整个 State Maintenance 成功，也不能将 conflicts 的 null 解释为冲突测试通过。

### 3.2 原始字段解释：不是新增语义评分

案例原文和 oracle 并排存于 `r4-state-case-excerpts.json`。每项都能回到 R4 行号、
J4 model capture seq 和 O4 `/families/0/oracle/C1/tN`。

| 位置 | 可直接核对的差异 | 可以解释什么 / 不能解释什么 |
| --- | --- | --- |
| t1，J4 pre_send seq=2 | objective 引用为 `Objective: migration manifest`，oracle 为 `migration manifest`；criteria 用 h0 的 acceptance，oracle 用 u1 的工作描述；work 引用多了 `plan to`，并带额外 evidence | 首轮已经存在引用/表示分歧；即使事实接近，冻结字面原子也不同。不能据此估计“放宽后得分”或宣布评分器缺陷 |
| t1 -> t2，seq=2/1084 | t1 lifecycle=planned 且无 status_updates，oracle 要求 running 与 planned->running；t2 才提出该迁移，oracle t2 已无需迁移 | 首次状态失败早于历史累积。任务生命周期与尚未执行的 work-item 生命周期不能混同；但首轮激活政策的可辨识性见争议清单，不强行归因为纯能力不足 |
| t2，seq=1084 | 模型和 oracle 都区分 first batch completed / second batch planned；模型 basis=reported，oracle=observed；引用跨度及 evidence 也不同 | 不能说模型完全没有区分已完成和待办；完成依据和稳定引用仍未达到冻结要求 |
| t3，seq=2501 | 模型确实将旧 criterion 标 superseded，新增 rollback criterion/work；额外增加“验收修订”decision，oracle 此轮 decisions=[] | 看到了目标修订，不等于完整状态 exact；额外结构不是 oracle 允许的同一快照 |
| t4，seq=5063 | 模型有 `two checksums per entry` criterion 和 selected decision，但没有对应独立 work-item；oracle 有该 planned work-item | 不仅是引用文字差异，还存在待办粒度/字段缺项；不能因 criterion 出现就认定 work 完整 |
| t5，seq=7707 | 模型仍保留 two-checksum 选择，另外增加 reviewer 提议的 decision 记录 | 原 decisions F1=0 不等于恢复了 one-checksum；额外记录及 ref/evidence 差异仍失败 |
| t6，seq=9512 | 仅有 operator report，模型将 second batch 和 rollback 标为 completed/reported；oracle 是 ready/reported，并保留 checksum planned；模型另加等待 Owner 的 work-item | 这是协议明确要求区分的 reported 与 completed 问题，不只是 exact 字面敏感；自然语言回答仍说任务等待验收，体现正文谨慎不保证结构状态正确 |
| t7，seq=12434 | Owner 接受后，模型 lifecycle=completed，与 oracle 一致；但仍缺独立 checksum work-item，保留额外等待验收工作项，accepted 引用跨度不同 | 不能把完成后所有 FP 都解释为无依据完成；总体状态表示依然不同 |
| t8，seq=14128 | 模型保持 completed，不让过时 checklist 重开；额外将旧 checklist 放入 superseded work-item | 未观察到“旧 checklist 强行重开”的行为；不能据 retention=0 单独断言模型忽略权威时间顺序 |

冻结 prompt A 第 7 行要求 exact visible refs、稳定已有引用；第 8 行明确
`completed work requires observed or accepted evidence`。t6 的 completed/reported
与该要求不一致，有原始输出依据。**本次没有创造第二套语义分数或更宽的通过条件。**

原 `false_actual_completions` 在 t1-t8 为 0,1,1,1,1,3,5,5。该计数保留；结合 t2
和 t7 原文，不能不加限定地称为“1 或 5 次虚构完成”。它受结构化完成原子及引用
匹配影响。本次不改名、不重算，只限制对此指标的自然语言推论。

### 3.3 连续性、可见上下文与主题分母

J4 t2-t8 的 pre_send seq 分别为 1084、2501、5063、7707、9512、12434、14128；
其最后 assistant 消息逐字等于前一输出，实际 reserve 请求也包含这些消息。
t1 的 objective 写法、t2 的 reported basis 在随后多轮保留；这是可观察的延续。
没有上下文截断证据，不支持“输入丢失”解释这条链；也没有实验对照将复制效应与
模型独立重复选择同一表示区分开来。

按 O4 冻结 state_opportunities，r4 C1/A 闭环中 SM1/SM2/SM3/SM4/SM6 各有 1 个
change 和 1 个 retain 机会的两端均有已存储评分；SM5 为 0。多个主题复用同一边，
不是十个独立实验。C2/C3 和 B 闭环的双端机会全为未观察。
具体配对见 `r4-closed-loop-state-opportunity-coverage.csv`。

t6 在冻结 themes 中是 []，虽然案例涉及 reported completion，本报告不将它新增为
一个 SM4 评分机会。SM6 t8 检查的是旧证据不应重开，不等于已覆盖新失败应重开。

r2 t1/t2 原 macro 为 0.2/0.4，r3 的同一八轮 exact 仍全失败；同故事、同材料的
重复不是独立叙事。r3/r4 的字段差异不能当作单因素协议改进的因果效果。

## 4. C2/C3、难度和恢复覆盖缺口

### 4.1 r4 已完成 A/B replay：逐格，不合总分

| 条件 | 臂 / 难度 / 故事-turn | 原报告行 | schema | user F1 | state macro | 完整 exact |
| --- | --- | --- | --- | ---: | ---: | --- |
| C1 | A / hard / release-accessibility-create-t8 | 33 | false | 0 | 0 | false |
| C1 | B / simple / delta-ambiguity-t2 | 23 | true | 1 | 见原行 | false |
| C1 | B / hard / telemetry-branch-merge-t8 | 21 | false | 0 | 0 | false |
| C2 | B / simple / release-accessibility-create-t2 | 22 | true | 1 | 0.3750 | false |
| C2 | B / hard / atlas-audio-parallel-t8 | 8 | true | 1 | 0.5000 | false |
| C3 | A / hard / icon-invoice-switch-t8 | 19 | true | 1 | 0.4167 | false |
| C3 | B / simple / telemetry-branch-merge-t2 | 20 | false | 0 | 0 | false |
| C3 | B / hard / release-accessibility-create-t8 | 24 | true | 1 | 1 | true |

C1/B/simple 另有 row34 传输失败，不能用 row23 的 1/1 表示两次发送全成功。
所有 A/B replay 的 medium 均未计划；C1/A 闭环之外的 A/B 闭环全部未发送。
r1/r2 没有 replay；r3 有上述 row8、19-24 七个同坐标输出，其中六个 B 按旧严格
协议全部 schema 失败，C3/A 也失败。保留旧分，不用新空白语法回头重解析。

### 4.2 能说与不能说

- **C2**：仅两份 B replay。row22 原 new_tasks 为 TP=1、FP=0、FN=0，支持一次
  新任务提案；其 lifecycle 字段 F1=0、整体 exact=false，身份出生成功不是状态成功。
  row8 的 objective/work/lifecycle F1=1，而 criteria/completion/decisions=0，
  不能把该次状态失败笼统称为“不知道做了什么”。C2/A 和所有 C2 闭环未观察。
- **C3**：row24 的完整 exact=true 是 release 任务回访。实际输入已有七条参考
  assistant 历史，含 t1 CREATE 和 UUID；不是从无身份历史开始的自主连续发现。
  row20 的出生 probe 因 action targets 失败；不能据此覆盖其他出生类型或难度。
  已完成 C3/C0 八轮没有 marker，不补足 C3/A/B 的身份建立证据。
- **切换/并行/分支合并/UNRESOLVED**：有少量对应故事 replay，但未覆盖每类每难度。
  不能把故事名当成目标操作已被测过：delta-t2 是普通明确任务，不是正例弃权探针。
  已完成 A/B 行没有正例 unresolved TP/FN；保留 undefined/null，不声称弃权能力通过。
- **SM5 与跨 Session**：C3/A icon-t8、C3/B release-t8 是参考历史回访，不能证明
  实际模型旧状态经过闲置仍保留。C1/B telemetry-t8 是 session s2 的 replay，
  schema 失败；唯一经过 s1->s2 的完整闭环是 C3/C0，不含标记。没有 A/B 跨 Session
  或 Agent handoff 闭环成功证据。不能用普通行的 identity_recovery=1 冒充恢复实验。

### 4.3 身份可见性需要双列，不能只读标签

O4 的 144 个 condition-turn 条目中 identity_present=124、identity_partial=14、
identity_absent=6；absent 全为 C3 t1。没有 identity_conflicting 标签。
这是冻结语料构成，不是已观察分数。不能要求 C3 恢复没有历史证据的不可见旧 UUID。

发现一个**分层口径差异**：P4 公有 turn/已捕获 input_packet 的声明为 identity_present，
但 O4 在 r4 row20、22 对应位置为 identity_partial。需同时列“输入声明”和“oracle
预期可见性”，不将二者默认为同一维度。没有据此改分或认定模型看到了 oracle。
原始实际消息仍是判断可见证据的依据；是否属于预期元数据分工，留待单独口径审议。

## 5. 对照、Token/延迟与错误定位

### 5.1 配对可用性

逐批按 family/condition/track/turn 查找已完成的跨臂坐标：没有 A/B 配对，没有
A/B 与 C0 的匹配闭环；只有 r4 C1 telemetry-t8 的 B（row21）与 D2（row30）。
两者 input_packet 原历史 messages 完全一致，但 D2 另有 D1 回答与不同生成协议。

该对 B 为 frame prefix 失败；D2 schema 有效但完整 state exact=false、macro=0.5944。
它只说明在该坐标，独立生成避免了这次 B 帧失败，**没有解决完整状态维护**。
不能据一次、不等预算的对照证明能力竞争。

原 usage：B=10,996 tokens；D1=7,575、D2=17,417，总计 24,992。原请求总时长：
B=17,644.0635 ms，D1+D2=88,772.0708 ms（仅两个请求时长之和，不含调用间开销）。
这些是诊断成本描述，不是匹配 C0 的 Token Overhead，也不是 p95/因果延迟估计。

r4 五对 D 中 D2 有效 4/5，完整 state exact 全失败；D 不进入 A/B 成绩或最终 GO。
r3 D2 超时保留，r4 新输出完成不撤销旧失败。旧截止时间和 B 语法同时修订，不能
隔离效应。C3/C0 八轮仅通过有限词法断言，不证明完整答案质量不劣于 A/B。

### 5.2 失败时间线及原因边界

| 批次/事件 | 直接证据 | 定位范围 |
| --- | --- | --- |
| r1 首请求 | HTTP 400，缺少会话路由头 | E/传输，没有模型归属输出 |
| r2 第三请求 | timeout；前两轮有效但状态 exact 失败；旧 sink 占时显著 | 工程混杂限制时间解释，不解释前两轮所有字段错误 |
| r3 六个 B replay | 原严格语法失败；原诊断记录帧间空白 | P/语法问题，旧失败保留；不能在本轮修复重新评分 |
| r3 最后 D2 | timeout、无完整 score | 预算/服务/传输因素未隔离，不判语义失败 |
| r4 row20/21/33 | action targets / frame prefix / targets | 协议或结构先于状态解释，不能直接当纯记忆能力失败 |
| r4 row0-7 | schema 有效、归属正确、状态失败；实际历史完整传入 | 状态表示与遵守要求的具体困难；上下文遗漏不支持，模型/契约可辨识性仍有混杂 |
| r4 row34 | 1 MiB response_byte_limit，content=0 | E/资源截尾；无任务归属结论，不补成零分 |

依原 E/G -> S/P -> 实际输入 C -> M/A 顺序解释。未发现评分调用异常不代表真值政策
没有歧义；也不因存在表示敏感性就宣布 evaluator 有 bug。
Token overhead、用户可见首正文 p95 和不劣效性仍不可得；first_content_ms 是 provider
content 起点，不自动等于序列化协议中首个用户可见正文。不得扣除 sink 后称纯生成时间。

## 6. H1-H7 中期证据判定

| 主张 | 支持与限制 | 中期结论 |
| --- | --- | --- |
| H1 同次生成 | C1/A 同一请求有 answer+work_state；其他有效 replay 也有标记；单次账本可定位 | 局部可行，不代表所有协议/条件通过 |
| H2 任务识别 | C1 单故事连续归属正确；C2/C3 稀疏 replay、出生/弃权/关系覆盖不足 | 完整有效性未证实 |
| H3 持续性 | C1/A 八轮身份保留、七条真实反馈边；无标记跨 Session/handoff 闭环 | 仅同 Session 单任务身份的局部证据 |
| H4 不牺牲回答 | 有有限词法断言，缺匹配 A/B-C0 对照；正文谨慎与状态冲突可并存 | 不可判定不劣效 |
| H5 协议成本 | 真实流与 usage 记录存在；响应上限停止、缺可见正文及配对成本统计 | 未证明达到研究成本/流式门槛 |
| H6 状态维护 | C1/A 各难度 full exact 为 0，字段级均未达到原要求；有可定位实质差异 | 已观察范围未达标；不能泛化为所有语义或模型均不可行 |
| H7 C3 自主发现 | 无 C3/A/B 从 t1 开始的闭环；成功 replay 使用参考出生历史 | 核心自主发现与身份持续建立仍未验证 |

所有样本都是已曝光开发材料，场景各只有一条叙事。逐轮、重复批次、复用主题边
都不是独立证据增量。工程错误率点估计不等于统计风险上界，不报告确认性 GO。

## 7. 争议/缺口清单与 S2 审议输入

以下是需要解释的事项，不是本轮已确认的评分器缺陷，更不构成自动改分授权：

1. **引用与表示可辨识性**：t1 objective 的两个可见引用都指向同一对象，oracle
   只选其中一种。当前结果衡量的是冻结表示协议下的能力，不能单独识别抽象语义
   能力；没有执行替代 canonicalization、宽松评分或反事实修复。
2. **首轮生命周期政策**：输入 h0 是 planned，当前用户只要求计划，oracle 将任务
   lifecycle 设 running，work 保持 planned。该政策是否足够可从公共指令识别，需
   单独语义契约审议；本次保留 t1 及延后迁移的失败，不以主观判断推翻真值。
3. **分层标签**：公有输入声明与 oracle 的 identity_partial 差异需澄清；未来不能
   只凭 input_packet 标签宣布 identity_absent/partial 覆盖完成。
4. **设计叙述与实际前缀**：R2 第 5.5 节附近的 Gate 2a 叙述要求首故事前两轮 ×
   三条件 × A/B/C0；实际已冻结执行首先走 C1/A 八轮。这不改动当前 schedule，
   也不在 S1 新增停止条件，但不能宣称已有三条件前缀资格。其授权/版本对应关系
   未在本次证据中完整追溯，作为后续准入口径问题保留，不直接判整批无效。

如 Owner 后续审议 S2，科学上最缺的是 C2/C3 的真实闭环、状态更新/保持的独立故事、
身份出生及有历史信息的跨 Session 恢复，还有匹配回答/成本对照。**这是缺口列表，
不是发送优先级或改动原计划的许可。**

S2 仍须先决定是否存在满足适用原门槛的采集路径；不得将 P-G 改判 N/A、回退旧路径
视为天然合格、增加上限或续用 541 个未发送槽位。若无合规路径，可停在上述有依据的
中期结论，避免为了验证而继续无效工程优化。

## 8. 交付与执行边界

本次派生证据包括：source-catalog/live-before/source-before、stored-score-projection、
完整 coverage CSV、state-fields-stored、frozen-identity-visibility、state-opportunity
coverage、r4 原始输入/输出摘录、request/closed-loop lineage、state-case-excerpts、
completed-coordinate-pairs，以及完整性验证。均为派生说明，不替换原始证据。

检查中有两个探索命令错误：访问不存在的 schedule.steps；首版摘录字典未按预期
排序，展示时误把非 JSON 臂当作 A。未运行 evaluator，未改变原成绩；首版摘录保留，
正式引用改用按原 report attemptId 唯一关联的 by-report-row 版本。详情见派生根
analysis-notes.md，不把分析命令错误误计为模型失败。

本轮只新增本报告和派生分析文件、更新 STATUS/README。零模型调用、零评分器执行、
零实现变更、零重冻结、零性能系列；live 1 MiB、P-G FAIL、原门槛及历史证据不变。
文档/完整性验证结果见派生根 review-verification.json。提交本中期结论后等待 Owner，
不自动开展 S2、合并 main 或 push。
