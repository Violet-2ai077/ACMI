# ACMI Phase 0.9.10 执行报告

**结论：`NO_GO`，仅针对当前冻结的 Qwen3-14B + buffered JSON + 严格整包校验路径。** 模型在 24/24 次同一 completion 中同时生成了回答与归属字段，但 0/24 得到可用的 Host Proposal 和原生 dsh 回答。Pilot 未通过；按门槛未执行主 A/B、排列复测或 C。更广泛的模型语义可行性及 A/B/C 相对效果为 `INCONCLUSIVE`，不是模型不可用或被替换。

## A. 核心问题与证据

六个新故事各 4 轮，通过 stock dsh 0.2.2-rc.1 Agent Loop 调用原 Qwen3-14B Q4_K_M。24 条 transport receipt、24 个 llama.cpp 后端 generation starts、24 份原生 Turn 记录一一对应。每条 raw reply 都含 Answer、Envelope、同一 Host generation ref 和来源 Turn ref；请求、回复摘要与唯一 usage receipt 通过确定性对账。后端没有公开可跨请求使用的 generation ID，证据是同一条有票据的请求和回复。**没有另一次归属生成。**

原生 loop 保持工作：24 个输入均到达 adapter，并以 dsh 正常错误结算结束；没有原生成功 Assistant。不能把错误结算当成正常回答/工具可用。先前启动尝试的 NVML 子进程环境不足，未启动后端、未生成；只给 NVML 子进程加入 `ProgramFiles` 后用新隔离目录执行，未更改 prompt、候选、预算或门槛。

## B. 机制与限制

选择 Adapter 内部 buffered JSON Schema；严格验证后才发 dsh text/tool/usage/finish。模型原始响应只保留在合成评测侧车。stock dsh 的通用请求合同无 JSON Schema 参数；普通文本/工具参数会进入 Session；`finish.replayState` 也是持久化字段，不是 Journal 外私有 Sidecar。

模型 token streaming 不支持：只在完整校验后发安全 text delta，不冒充逐 token。未实测本协议的 Compact 或 GUI 渲染。Source/Built scripted replay 在真实 dsh Loop 通过两条 native lookup：终止工具一次，普通工具自然续步两次。真实 Pilot 的工具轮虽 raw 两条动作归属均正确，因整个 Envelope 被拒绝，没有执行工具，因此不宣称真实工具兼容通过。

## C. 归属和回答

24 条均能解析 JSON；拒绝：未知 Task Handle 20，Task/WorkNode 不配对 3，严格 schema 1。raw User/Assistant 既有 Task 精确分别 1/20、0/20，raw WorkNode 18/20；raw 回答名称断言 18/19，原生回答断言 0/19。多数回复在 User 字段用 `-`，而该值仅在无既有任务时允许出现在 WorkNode 字段。**这说明失败集中于字段协议与模型遵循性；没有足够对照把失败归咎于模型不理解任务、位置偏差或 Core 数据模型。**

可发布 User/Assistant 覆盖率 0/20，selective accuracy 无分母；零已发布 false merge/split 不代表语义准确。两个 A/B/A、一个跨 Session 故事均无通过的原生归属。模糊、no-task 和多任务相关集合没有有效 Host 输出。位置 1/2/3/4/8 各四个正例，但没有足够有效选择评估位置偏差；Handle 重命名和主样本变换未运行。late Result/retry/Subagent 归属仅有独立因果 fixture；没有真实模型子代理结论。

## D. Token 与延迟

| 条件 | 真实生成 | 输入 / 输出 / 总 Token | 生成 p50 / p95 | 原生 Turn p50 / p95 |
| --- | ---: | --- | --- | --- |
| Pilot B | 24 | 13,787 / 2,473 / 16,260 | 11,900 / 17,734 ms | 11,916 / 17,744 ms（错误结算） |
| Main A、B；对照 C；附加排列 | 0 | 未运行 | 未测 | 未测 |

每轮一次请求，零重试、零截断，峰值输入 638 tokens，预留 21,467 tokens；总 wall clock 330,332 ms。GPU 请求前采样峰值 10,567 MiB、39°C（不是持续高水位）。没有完成用户轮次的时延、B 对 A 增量或 C 实测成本，不能由 Pilot 外推。

## E. 安全与边界

真实 Pilot 观察到 0/24 metadata 泄漏、0/24 越界 Graph/Binding/隔离旧 Journal 修改。真实批次所有回答被拦截，故非空响应隔离另由 scripted dsh 成功路径验证。适配器不挂 Graph/Binding 写接口，不创建权威 Task UUID，不接受子结果，不满足 Join。Tool Result 以来源 Call ID 获取原 Task/WorkNode，不读取到达时 Binding。模型只见已授权 opaque Handle；非法字段/候选不执行。未读取原始用户 Journal、现有凭据；没有外部 Provider 或费用。自有 loopback 14597 已退出，3080/13080 原监听未动。

## F. 资格和下一步

不部署当前协议，不修改 Core contracts。可供下一轮重新预注册的假设：用请求级受限枚举把 Task/WorkNode 选择的语法错误与语义错误分开，再评估可隔离但不能归属时是否能安全展示回答；另设工具与 Streaming 实验。不要在本批上放宽门槛或再次消费 Pilot；不自动进入 Phase 1.0。

## G. Git、环境和回归

- 外层主检出 HEAD `052c0ceee7bb3a72867cafbc53cb48b65e98215d` 保持不变。独立工作树 `E:\codex-prj\ACMI\acmi-phase-0.9.10`，本地分支 `acmi/phase-0.9.10`，精确基点 `1d616022b752806cc33fd24e04e027c5e6a3e028`。
- 预注册提交 `bd622414edfff2d8ebddfa7b9bae38726d28be50`，预注册文件 SHA-256 `0b31ba77e222b8899dda8e0a1943cee4db838f2055cb45e1b2b7eb37e961f286`。实际 Pilot 冻结入口提交 `73022e52839273cf9e273298e4f74016d10d76f5`。完整提交清单见 ZIP 的 `source/git-commits.txt`。
- Windows 19045、Node 24.16.0、离线 pnpm 11.28.5、stock dsh 0.2.2-rc.1、RTX 3060 Vulkan、llama.cpp b12283；模型及关键运行时 SHA-256 见 `evaluation/run-summary.json`。安装版 dsh 0.2.1-rc.2 未用。三份历史材料均与指定 SHA-256 一致；历史 ZIP 校验 21 个内层文件，旧评分仅离线复放且字节一致。
- Workspace Source 200/200、dsh Built 89/89、独立 node offline suites 52/52，build/typecheck/lint 与依赖边界通过。旧基线、clean clone 和重放详见 ZIP 的 `tests/`。本地提交，无 Push、Release、main/Alpha tag 修改。

## H. 交付

目录：`E:\codex-prj\ACMI\deliverables\phase-0.9.10\`。ZIP：`E:\codex-prj\ACMI\deliverables\phase-0.9.10\ACMI-Phase-0.9.10-Deliverables.zip`。原始结果、账本、评分、运行摘要和 Pilot 门槛见 `evaluation/`；冻结输入和真值分列在 `corpus/`。ZIP 逐文件 SHA-256 位于 `integrity/payload.sha256`，归档外层完整哈希与字节数在同目录 `SHA256SUMS.txt`、`verification.txt`。ZIP 自身哈希不写入 ZIP 内，避免自引用。
