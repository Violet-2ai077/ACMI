# ACMI Phase 0.9.11：受限工作位置 Pilot

**机制与工具通过，语义门槛未通过（`PILOT_GATE_NOT_MET`）。** 保留同次生成的方案作为实验路径，不扩大样本、不接自动 Binding 或任务图。

## 实验

从 `180cfaa002b44cea70743b005d2bc3d673626ffd` 创建本地分支 `acmi/phase-0.9.11`。预注册提交 `d7a3461f97d92920457f99177638cd0ae071a479`，预注册文件 SHA-256 `e67321c1f4d96cca62eef97812a4dbaa5be6ba638fed0d24644aa42219ad8d23`；真实运行冻结实现 `a1d232063d25e938c40cc8496eec3ff4c02908d2`。6 个未消费合成故事、12 个基准轮、4 个预指定换位/改名轮；另外两次生成是原生工具完成后的总结，不是事后归属。无外部 Provider、无另一个 Judge、无历史模型复跑、无 A/B 模型回答基线。

同一个原 Qwen3-14B Q4_K_M，经本机 llama.cpp b12283 和隔离 stock dsh 0.2.2-rc.1 Agent Loop。模型见请求级短引用、任务名和 WorkNode 描述，不见 Host UUID 或真值。Host 单独验证正文、User/Assistant 归属和动作，按原生 `tool/call` ID 记账。结果只查来源，不读到达时的 Binding。模型的输出始终是提案。

## 三项门槛

| 门槛 | 实测 | 判定 |
| --- | --- | --- |
| 同次生成与隔离 | 16/16 初始请求、18/18 含原生续步的请求可对账；12/12 基准轮正常完成，11/11 冻结回答断言命中；泄漏、越界写入、未预期工具为零 | 通过 |
| 受限工作位置 | User 9/12，对比 Binding 继承 3/12；既有任务覆盖 6/9（要求 ≥8/9）；Assistant 7/12（要求 ≥9/12）；换位/改名 3/4（要求 4/4） | 未通过 |
| 工具归属 | 两组原生 lookup 各发两条；动作归属 4/4，工具体返回观察关联 4/4、原生结果因果继承 4/4；两组均观测到第二条工具体先完成 | 通过 |

基准轮 6 个既有身份建议均精确，没有基准错指既有身份。另一个改名轮把 User 指向相似但错误的任务，不能据此宣称不受 Handle 影响。基准中仅 5/12 的整个 sidecar 无校验警告；其余 7 个带了不应出现的 `new_goal`（包括空字符串），Host 忽略该字段而保留独立可验证的选择与安全正文。坏 Handle 保留安全正文的例子来自 Source/Built scripted 原生测试，不冒充真实模型产生了越界 Handle。另有恶意正文 echo、重复键、越界动作和截断负例；不可可靠分割的回复不会透传。

两组工具模型调用顺序分别为 amber → indigo、indigo → amber；通过同一进程的门闩分别观测到相反工具体返回顺序。stock dsh **依然按调用顺序提交原生 Journal**。两种观测按真实 Call ID 和原生来源序号关联，均得到发起时的 Task / WorkNode。未实测跨 Session 异步交付、真实子代理或 Token 级 streaming。默认不挂载该适配器。

## 失败在哪里

- 三个既有任务漏标：一个 task-only 请求被标为 unresolved；两个“只说明即将做哪个任务、暂不执行”的请求被标为 unresolved 或新目标。正文仍写出了正确名称。
- 两个工具轮的第一条回复都提到两项工作；模型的 User 主归属及动作归属正确，但 Assistant 都选择了次要 Task，不满足冻结的主归属断言。该协议还没有显式 `primary + related`。
- 在一组相似任务的仅改名复测里，回答仍给出正确名称，但 User 选择了被排除的候选。4 个配对变换不足以估计一般位置偏差。

因此，继续保留正文/归属分离与 Call ID 因果传播。下一轮若重新预注册，优先单独检验：明确 task-only 的显示标签；将“选择既有工作”和“提出新目标”用互斥的结构表达；允许 Assistant 明确一个主归属和多个相关工作。不要用本批重新定义金标准，或把 0.9.10 不同语料的分数当成严格对照。

## 成本与复验

18 次真实生成、5,258 输入 + 1,305 输出 = **6,563 tokens**。生成 p50/p95 **8,314 / 16,076 ms**，基准 Turn p50/p95 **7,290 / 24,792 ms**（含工具续步）。零重试，独立 llama.cpp 日志确认 18 次生成；独占 loopback 3298 已退出，原监听 3080/13080 未动。权重、launcher 和关键 DLL 的 SHA-256 在运行摘要内。未访问原始用户 Journal，未修改已安装 dsh、Graph、Binding、子结果接受或 Join；未 Push、未发布 Release。

Source 208/208、Built dsh 97/97、离线 node suites 55/55，构建、lint 和依赖边界通过。交付的 `evaluation/` 包含原始合成原生记录、生成账本、运行摘要、可确定重放的评分；`corpus/` 将模型输入、Host 映射和评分真值分开。

从交付根目录复核，不会启动模型：

```powershell
node scripts/phase-0.9.11/score.mjs corpus evaluation replay.json
(Get-FileHash replay.json).Hash -eq (Get-FileHash evaluation/scored-results.json).Hash
```
