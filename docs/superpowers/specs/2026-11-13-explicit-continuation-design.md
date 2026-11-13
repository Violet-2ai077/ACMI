# Phase 0.9.17：显式任务续接设计

状态：已通过独立设计完整性复审，用户已批准实施；尚未发布，不改变现有资格结论。

## 1. 目标与交付边界

用户已同意将研发主线从模型归属达标转向可靠的显式任务续接。
最终目标是：选择任务，在新会话恢复工作，冲突时确认，不依赖模型猜测任务身份。

本阶段先交付一个可操作、可重启的本地 CLI Host，把已存在的确定性能力接成闭环：

`创建任务 -> 显式选择 -> 确认绑定 -> 查看限定历史 -> 退出 -> 新进程/新会话续接同一 UUID`

必须分别验收两种“恢复”：

- **身份与历史恢复（本阶段）**：恢复 UUID、用户确认回执、任务目标与验收条件、已归属的原生事件元数据。
- **模型工作背景恢复（后续独立设计）**：将获准的任务内容送入真实模型请求，并证明对回答有用。

当前 Alpha 历史不提供完整聊天正文，Graph 动态上下文与摄取仍显式要求 `synthetic: true`。
本阶段不删除或绕过该条件，不将真实用户对话标成 synthetic，不声称已减少真实模型的背景重述。
CLI 可保存操作者直接输入的任务目标，但原生事件链路仅运行明确标注的、无 Provider 的脚本会话。
这是可使用的身份控制台与集成验证入口，不是完整聊天客户端或生产恢复服务。

## 2. 已核查的基础与缺口

基点：`2032c96e7714669332279ec93ae51c0cdc0b268a`。
工作分支：`acmi/phase-0.9.17`；本地路径：`E:/codex-prj/ACMI/acmi-phase-0.9.17`。

| 能力 | 当前事实 | 本阶段处理 |
| --- | --- | --- |
| Task 生命周期 | `task-lifecycle.ts` 已有 create/switch/bind/unbind、独立 operator grant、CAS、事务回执和重试去重 | 复用，不另造 UUID 或绑定账本 |
| 确认来源 | 现有 `confirm()` 是 Host 信任边界，不证明实际发生了用户确认 | 在 CLI 控制器中绑定预览、明确回答和命令摘要 |
| Graph 持久化 | SQLite 保存图与生命周期回执；原生 binding 与 Host binding 禁止混用 | 使用单一 Host lifecycle 路径 |
| 原生摄取 | 要求隔离 Journal、显式 Session 允许列表和 synthetic 模式 | 保留约束，验证真实 dsh 生命周期但使用脚本内容 |
| WorkAnchor | 0.9.14 中是进程内实验注册表 | 不直接移植；用户确认与持久回执承担首版入口职责 |
| 可操作入口 | Quick Start 是临时演示，退出后清理 | 新增独立持久控制台，不修改原演示行为 |
| 任务发现 | Graph Store 尚无适合 CLI 的受限任务列表 API | 增加限定 Workspace 的有界目录，不扫描用户目录 |
| Observer | Alpha 的独立只读历史服务 | 本阶段不增加写操作，也不伪称其能读取新的 Graph 绑定 |

复验记录见 [主线基线](../../verification/2026-11-13-continuation-baseline.md)。

## 3. 方案选择

1. **复用 Graph Host lifecycle，新增薄 CLI 控制器（推荐）**：已有持久确认回执、独立授权和序列边界；需补目录与受管 Session 注册。适合后续接入上下文恢复。
2. 包装 Alpha 的 `acmi_task_*` 工具：演示最短，但会沿用另一套 registry/native Binding，且模型可见工具不是可靠的人类确认入口。
3. 直接把 WorkAnchor 与模型侧车产品化：仍缺持久化与真实入口，且让语义门槛重新阻塞续接。

选择 1。首版不同时装载 Alpha 写入工具，不迁移旧 registry，不混用两套 Task 身份或 Binding。

## 4. 使用方式

新增独立 example workspace，暂定 `examples/task-console`。交互由启动 CLI 的本机操作者控制。
没有 HTTP 服务、模型可调用的管理工具、后台任务或自动发现既有 dsh profile。

启动时显式传入 Workspace、Journal Root 和 Graph Root；全部 canonical、互不重叠，不在既有 dsh Home 内。
首次初始化只能使用新的空 Journal/Graph Root，并需要确认；重开必须验证现有标记，绝不自动清空或覆盖。

拟定命令：

| 命令 | 作用 |
| --- | --- |
| `tasks` | 分页列出本 Workspace 的 UUID、目标、open/closed 状态；同名不合并 |
| `create` | 输入目标和非空验收条件，预览后确认创建；不自动选择或绑定 |
| `session new` | 创建并持久化新的受管原生 Session，不继承旧 Session 的 Binding |
| `continue <uuid>` | 展示目标、条件、当前 Session 和现有 Binding；确认后显式绑定，并展示限定历史 |
| `leave` | 确认后解除本 Session 的 Binding，不关闭 Task，不删除历史 |
| `status` | 分别显示当前绑定、历史恢复状态和待摄取数量 |
| `history <uuid>` | 只读、有界任务历史；不改变 Binding |
| `sample` | 显式生成固定脚本回合以验证原生事件摄取，输出标记 `synthetic`，不调用模型或任意工具 |
| `exit` | 有界排空并报告保存状态，保留所有已确认的任务和历史 |

`session new` 先停止旧 Session 接受回合，完成 checkpoint 与 Graph 排空，再关闭旧 Session。失败时保留旧的 current Session 标识并进入受阻状态，不创建或切到新 Session。没有在途回合或工具调用才允许此命令；`continue` 改变当前 Session 的任务，不能用它偷偷创建 Session。

首版只接受完整 UUID，不做自然语言任务解析或唯一标题自动选择。
缺失、同名、取消、无目标等情况进入明确的 CLI 询问或错误，不通过模型补齐。
普通对话中的“换一个任务”等自然语言不是本阶段支持的控制命令。

## 5. 确认、绑定与并发语义

- CLI 维护单条在途操作队列；无模型执行时才允许生命周期写入。
- 每次预览包含命令类型、精确 Task、Session incarnation、Binding revision 和原生序列。
- 用户明确确认当前预览后，控制器才调用 Host `confirm` / `execute`；输入取消、EOF、空输入均不执行。
- 预览令牌仅在当前进程和当前待确认操作中有效，最长 120 秒；不可导出为普通 JSON 权限凭据。
- 目标或状态变化使预览失效，重新预览并确认；不自动更新 expectedRevision 后重试。
- `continue` 的权威状态是 `binding.taskId`。不先执行 lifecycle `switch` 再执行 `bind`，避免产生“已选中但未绑定”的双写部分成功。预览中的选择仅为临时 UI 状态。
- 在 native checkpoint 完成且 Graph cursor 到达原生下一序列后才允许首个 Host Binding。不能只等待 Journal flush。
- 相同已确认 operationId 与相同命令，在相同 Session incarnation 内返回原回执；参数变化报 conflict。
- 新 Session 续接必须产生新的确认事件与 operationId；只复用 Task UUID，不复用旧确认权限。
- 重开后旧回执只证明历史事实，不授予新 Session 权限。进程丢失未提交预览时必须重新确认。
- 回执已提交但 CLI 未显示的重启场景：通过受管 Session 的生命周期历史显示原回执，不重新执行 create 或 bind。
- 现有 lifecycle `history()` 要求 live Session，不适合读取已经退出的来源。新增独立 scoped 只读回执接口，接受受管注册表中的精确 Session 引用与分页参数，只要求当前 read grant；复用回执哈希、序号和 before/after 链校验。不得伪造 `currentSession`，不得为历史读取重新激活 Session 或取得写权限。
- 重启后先分页显示登记 Session 的回执索引（Session、ordinal、operationId、操作和 Task UUID），操作者可以打开精确回执确认上次结果；这只是历史查询，不自动重放命令。每页重新校验 read grant，缺失或断链即报错。
- Task 身份、元数据读取、持久写入和工具执行是不同权限；本控制台不签发通用工具执行许可。

## 6. 持久化、允许列表与恢复

Graph Store 是任务和绑定的唯一事实源；目录从已验证图状态读取，不维护第二套可写任务 registry。
新增有界目录接口按稳定 UUID 顺序分页，每页最多 64 项；closed 任务可查历史、不可绑定。
首版保留现有 Store 上限：64 个 Task、256 个 runtime Session，不提高容量。登记前也检查对应容量，达到上限明确拒绝新增，不删除旧记录或静默截断。
分页使用 UUID keyset；游标绑定 Workspace、排序位置与目录修订，每页重新授权。目录变化时拒绝旧游标，要求从首页重读。目标缺失或损坏不从列表中静默省略。

新增同 Graph 数据库内的受管 Session 注册表，只记录 Workspace、原生 Session ID/incarnation 与登记回执。
登记只能来自本 Host 创建并已完成 durable checkpoint 的 Session 对象，不接受任意路径或模型文本。
同一持久允许列表必须同时约束在线 attach/drain、离线 reconciliation 和旧回执读取；每次入口与异步恢复后重新核对精确身份及当前权限。不能仅在 CLI 启动时检查，也不能以摄取 API 的可选 `allowed` 回调默认放行。
先完成原生持久化，再事务提交登记；两步间崩溃可能留下未登记 Journal，该文件不自动发现或摄取。
登记失败时停止使用该 Session，报告未登记状态；不得以扫描目录补回。

重启时：

1. 检查根目录标记与单写者占用；不支持两个控制台同时写同一套数据。
2. 由本机操作者重新授予此 Workspace 的 read/write/operator grants，不从回执还原权限。
3. 仅对注册表列出的精确 Session/incarnation 做有界离线 reconciliation。
4. 遇到任一登记来源缺失、损坏、权限变化或截断，整个控制台进入恢复受阻状态，禁止 create/continue/sample；允许 status、可验证的只读历史和 exit。首版不猜测损坏来源影响哪些 Task，也不提供删除登记项来跳过错误的命令。
5. 恢复完成后创建新的原生 Session；用户重新选择同一 Task，产生该 Session 的 Binding revision 1。

单写者约束在 Graph Root 和 Journal Root 分别使用独立的 `continuation-owner.sqlite`，不与业务事务共享连接；必须测试新增 sidecar 不干扰 stock writer 和只读 Journal 投影。
验证根标记后、打开业务写入路径前，按 canonical 根路径的稳定顺序取得两个 SQLite rollback-journal 排他事务，busy timeout 为零；任一冲突即释放本次已取得的连接并拒绝启动。相同 Journal 搭配另一 Graph 或相反组合也不能并行写。锁持有至停止摄取并关闭业务 Store 后才由持有连接释放。
不以 PID、时间戳或删除锁文件抢占。进程崩溃由操作系统释放文件锁；保留下来的 owner 数据库文件不是仍占用的证明，也不应删除。
首次初始化若发生并发，由空根 provision 的排他创建失败关闭，不覆盖另一初始化者的标记或数据。
该互斥契约适用于本控制台组合，不承诺阻止另一个绕过控制台、持有特权的外部 Graph 写入者；这种共享根部署不受支持。

首次初始化在两根分别排他写入相同的不可变 `continuation-pair.json`，绑定版本、Workspace canonical 路径/partitionId、Journal 与 Graph canonical 路径及 compression。不得修改现有原生根标记。后续打开必须校验两份配对记录与实际配置一致，禁止用同一注册表改读另一套 Journal。
两个配对记录不是跨文件事务；初始化中断导致缺失或不一致时报告 `initialization_incomplete` 并拒绝使用，不自动补齐、删除或修复。现存数据迁移与中断初始化修复不属于首版。

只读预览与历史查询不写原生 Journal。同步/恢复写入的是 Graph 派生事实，不重写已有 Journal 内容。
退出时等待有界排空；超时显示 pending 与失败原因，不输出“全部已保存”。
原始 Tool Call / Result 的因果规则不变：A 的晚到结果仍归 A，不随当前绑定切到 B。

## 7. 历史展示与诚实的恢复状态

展示：Task UUID、用户输入的目标与验收条件、来源 Session、事件序列、绑定回执、原调用关联、缺口状态。
不展示原始工具参数/结果、完整聊天正文、无权限候选或其他 Workspace 的记录。
终端渲染必须转义控制字符，目标或样本内容不能成为终端控制序列或控制台指令。

恢复状态分开显示：

- `identity_ready`：目标存在且当前确认绑定已提交。
- `history_ready`：获准来源已对账且限定历史可读；空历史允许但明确显示“无历史事件”。
- `history_incomplete`：存在未对账来源或读取错误，不宣称恢复完成。
- `model_context_not_enabled`：本阶段固定显示，不把元数据预览视为模型上下文恢复。

不增加通用摘要、向量检索、长期记忆或任务图自动推导。

## 8. 模块与改动范围

以下路径均相对于本阶段 worktree，名称为计划目标，不表示文件已经存在。

- `integrations/dsh/src/continuation-host.ts`：确认状态机、串行操作、Binding 边界和恢复状态；不处理终端 I/O。
- `integrations/dsh/src/continuation-catalog.ts`：任务分页与受管 Session 登记的内部持久化模块；不暴露 SQLite 连接。
- `integrations/dsh/src/continuation-lock.ts`：独立 SQLite 单写者占用与释放；不包含业务事务或 PID 抢占逻辑。
- `integrations/dsh/src/graph-store.ts`：暴露最小 scoped 目录/登记/历史回执接口，复用现有事务、授权、校验和错误码。
- `integrations/dsh/src/task-lifecycle.ts`：优先不改语义；只有测试证明无法满足所述原子性时才提出小范围改动。
- `examples/task-console/`：命令解析、确认输入、终端渲染、隔离 stock dsh 组合和使用文档。
- `integrations/dsh/tests/continuation-host.test.mjs`：确认、作用域、版本变化、去重、失败与恢复测试。
- `examples/task-console/tests/`：跨进程 CLI 与原生 Session 验收，测试脚本不得自动确认真实工作区。

不修改旧实验冻结数据、模型评分、已安装 dsh、既有用户 Journal、Core 因果规则或 Observer 写权限。

## 9. 验收门槛

全部使用新建隔离目录，不调用真实 Provider，不读取原用户会话或凭据。

| 场景 | 必须观察到的结果 |
| --- | --- |
| create 后不确认 / 取消 / EOF | 无新任务、无绑定、无执行回执 |
| create 确认并重启 | UUID 和目标保留，只有一条创建事实；新 Session 未自动绑定 |
| S1 绑定 A，脚本回合完成，退出；S2 续接 A | 同一 Task UUID、不同 Session、新确认回执、可见 S1 元数据 |
| 同名 A/B | 只有精确 UUID 确认才绑定，不按标题猜测 |
| A -> B -> A | 不创建重复任务，绑定修订递增，不回写旧事件 |
| 已开始的 A 工具在切换 B 后返回 | 结果仍归原 A 调用；不能给 B 混入历史 |
| 预览后 revision/序列/权限改变 | 拒绝旧预览，不能自动确认替代命令 |
| 同 operationId 改参数 / 伪造确认对象 | 拒绝；相同命令重试无重复写入 |
| Journal flush 但 Graph 未追平 | 不绑定，不谎报准备完成 |
| checkpoint 后登记前崩溃 | 不扫描补登记，不读取孤立 Journal |
| 提交回执后显示前崩溃 | 重开可查原回执，不再次创建 UUID |
| 缺文件、损坏、跨 Workspace、closed Task | 拒绝续接或明确显示历史不完整，无静默回退 |
| 两个写进程 | 第二个拒绝启动，无并行写入 |
| 关闭超时 | 报告 pending，不丢弃数据、不声称全量保存 |
| 撤读权限 | 下一次读取拒绝；不宣称能擦除已显示的终端内容 |
| 普通用户输入包含命令/转义序列 | 作为数据转义显示，不能触发生命周期操作 |

Source、Built dsh、离线实验回归均须通过。Windows、Ubuntu 均验证新入口。
关键跨进程测试至少重复三次；使用状态条件等待，不依赖固定 sleep。
记录人工确认次数、启动/恢复耗时、对账数量、错误与 pending；本阶段不产生模型 token/回答质量指标。

## 10. 顺序与停止条件

1. 固定并复验主线基线，记录能力边界。
2. 用户批准本设计后，写可执行实施计划；先做最小闭环测试，再实现 Host 和 CLI。
3. 完成跨进程与故障验收后，展示可重复操作的控制台；只发布本阶段实际覆盖的能力说明。
4. 另开“显式本地真实会话摄取与上下文恢复”设计：规定来源授权、内容选择、快照撤销语义、模型请求隔离和真实使用评价，之后才允许真实模型试用。

任何根目录误配、跨范围读取、混用 Binding、回执不一致、无法区分历史事实与当前授权的问题均停止推进。
不能以新增模型标签、放宽 scorer 或关闭 synthetic guard 代替解决这些问题。
本阶段不自动 Push、Release 或进入下一阶段；设计批准前不修改产品运行路径。

## 11. 本轮进度

- [x] 核查现有代码边界与近期研究证据。
- [x] 建立独立 worktree，保持 main 不变。
- [x] 完成 Source、Built dsh、离线测试及持久化重复复验，并核对基点远端 CI。
- [x] 对比三条实现路线并形成设计。
- [x] 独立审阅，修复离线回执、双根互斥与允许列表契约问题；复审通过。
- [x] 用户批准按此范围开始实施。
- [ ] 分批执行[实施计划](2026-11-13-explicit-continuation-plan.md)并完成整体验收。
