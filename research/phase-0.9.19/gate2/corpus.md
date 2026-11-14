# Gate 2 语料结构与支持数预检

本模块检查已由作者提供的语料声明及其内部一致性，不推断、生成或修正正式标签。它不是 LLM Judge，也不能通过几项机械检查替代语义审定。

## 入口

`validateCorpus({ planManifest, publicCorpus, oracleCorpus })` 为无文件写入、无网络的确定性入口。

冻结包入口：

```powershell
node research/phase-0.9.19/gate2/cli.mjs verify-corpus '<manifest.json>' '<事前封存的SHA-256>'
```

该命令先完整执行 verify-freeze 的字节/摘要/审定绑定检查，再从同一批已核验字节读取公有输入和 oracle，不能换成另一个未固定版本。

- exit 0：本模块实现的结构与 SM 支持数检查通过，不代表整个语料审定完成或允许模型运行。
- exit 2：材料完整性通过，但语料结构错误或 SM 支持数不足；输出可定位的报告。
- exit 1：参数、冻结材料完整性或 JSON 读取失败。

原 verify-freeze 不会自动要求完整语料包装，仍只做其既有完整性检查。

## 数据包装

public 文件使用 `{version: "gate2-public-corpus-v1", split: "dev", families: [...]}`。

每个 family 使用现有 publicScenario 字段：family_id、split、catalog、initial_active、initial、turns；另加 reference_history，按 C1/C2/C3 分别列出八轮参考 assistant 消息。每条参考消息有 turn_id、source_id、role、content。turns 中的每轮须有 agent_id 和 session_id，以及与冻结计划一致的类别和难度。

oracle 文件使用 `{version: "gate2-oracle-corpus-v1", split: "dev", families: [...]}`。每个 family 包含：

| 字段 | 内容 |
| --- | --- |
| family_id | 与计划和公有 family 一一对应 |
| canonical_tasks | task_id、objective、acceptance、initial_status；每故事最多 8 个 UUID，必须由作者定义 |
| oracle | C1/C2/C3 各自的完整逐轮真值，不能共享一份未经条件区分的标签 |
| state_opportunities | 下述变化/保持机会，包含具体 task、turn 和字段族 |
| recovery_points | none 故事为空；其他故事恰好一个对应恢复点，含 turn_id、kind |

允许多个 public/oracle 文件分别存放不同 family，校验器合并后检查重复、遗漏及计划对应；每个文件都必须使用上述完整包装。

逐轮 oracle 复用既有评分器的数据字段：identity_visibility、decisions、task_memory、proposed_active_task_ids、focus_task_id、status_updates、births、prior_births、forbidden、answer、changed、dormant、known_tasks。

## 已实现的检查

- 六个计划 family、每个八轮、三个条件均完整；拒绝额外或缺失的条件、轮次、用户 unit 或回答义务。
- 决策、操作、状态快照按冻结 Contracts 类型检查；身份在该故事 canonical registry 内，active/focus 与目标一致。
- task_memory 必须覆盖所有 known_tasks；仍在完整上下文内的旧任务不能消失。C1 目录已有任务不能作为新出生任务。
- 每个 unit 都有冻结 answer 断言；正向归属与 forbidden UUID 不重叠。此版本尚未验证完整负例分类及禁止操作/关系的语义覆盖。
- birth 与 CREATE/BRANCH/新目标 MERGE 声明一致；历史 birth 坐标对应此前轮次和参考 assistant source，而不是未来消息。
- evidence 的 source/quote 必须在当前条件可见的输入前缀内唯一出现；不借用另一条件或未来轮次。
- 实际完成项须声明 observed/accepted 且有非空证据；整个 completed 任务不能仍有待验收、未完成项或未解冲突。证据的真实性和权威性仍需人工审定。
- 相邻轮次的完整 memory 比较须与 changed 一致；字段/集合的顺序变化不计语义变化。status_updates 的 from/to 须与相邻快照一致。
- 相同状态原子不能重复用于增加支持数；同一 unit 的 resolved/unresolved 范围必须可唯一定位且互不重叠。
- 会话/逻辑 Agent 变化必须发生在声明的 handoff 点；same-session 恢复不允许偷偷换 session/agent。

## State Maintenance 支持数

每条机会至少包含 condition、theme、kind、task_id、previous_turn_id、turn_id；kind 为 change 或 retain。previous_turn_id 必须是紧邻的前一轮，不能跳过中间变化后重复计数。

| 主题 | 机械比较字段 |
| --- | --- |
| SM1 | work_items、lifecycle_status |
| SM2 | objective_refs、criteria |
| SM3 | decisions、open_conflicts |
| SM4 | work_items，包含 completion_basis 与 evidence |
| SM5 | 七类状态载荷对应的整个任务快照 |
| SM6 | open_conflicts、lifecycle_status、criteria |

SM5 额外提供 last_active_turn_id；按冻结 gold 的 task attribution 检查两端确实归属该任务，中间至少五个完整评分 turn 均未归属该任务。它不是墙钟时间、真实模型历史或自然语言语义上的自动判定。

每个条件的每个 SM 主题分别需要至少 2 个 change 和 2 个 retain。缺项逐一列出，不跨条件凑数。报告还按 simple/medium/hard 输出支持数，不用整体计数遮盖困难层为空。该阈值仅检查开发计划覆盖，不能提供低错误率统计保证。

changed 表示相邻完整 task_memory 的结构化状态变化，不是当前 active/focus 改动，也不是“用户本轮说了新话”。dormant 与声明归属中的返回间隔一致。初轮没有前一快照，因此不凭空构造前态来验证 changed。

## 不能由本模块证明的事项

即使 corpus_preflight_passed=true，以下仍为 false：corpus_completeness_verified、semantic_truth_verified、family_independence_verified、identity_provenance_verified、negative_case_taxonomy_verified、live_execution_ready。

具体未验证项包括：

- 六个故事是否真的覆盖不同语义场景、是否有共同事件骨架或同义改写；
- 引文虽然存在，但是否支持对应归属/决策/完成结论，来源是否具备权威性；
- 历史标记正文是否确实编码了声明的 UUID 出生映射；当前仅验证坐标和前后声明一致；
- 所有否定候选、部分未决、禁止误建/汇合等负例子类型以及有限等价表是否齐备；
- 真实 CLOSED-LOOP 在错误累积后仍能否维护状态，以及模型回复本身的质量。

参考历史只用于冻结回放和预检。实际闭环仍必须保存各臂自己生成的历史，不能用这里的参考回答或 oracle 回填。

## 测试向量与实际发现

tests/support/corpus-fixture.mjs 只生成工程向量，复用同一骨架并显式标记为非独立研究场景；不进入正式语料。另有故意保持错误叙述/状态对应关系的测试，证明结构与计数通过不能自动把 semantic_truth_verified 置 true。

预检发现原 Gate 1 工程 fixture 第三轮新增了任务快照，但 changed=false。只在新派生测试输入中明确修正该声明；没有改动原封存 fixture 或历史证据。这进一步说明旧工程 fixture 不能直接升格为正式 Ground Truth。

## Provider 接入调查

已只读检查现有 `C:/Users/SiChuchen/.codex/worktrees/model-native-attribution-research/acmi/examples/task-console/model-transport.mjs`：它仅接受两条 system/user 消息、输出上限 512 Token、stream=false，并限制 loopback HTTP endpoint。因此不能原样复用来声称已验证连续对话和真实流式；本轮没有修改该正式示例接口，也没有尝试连接服务。
