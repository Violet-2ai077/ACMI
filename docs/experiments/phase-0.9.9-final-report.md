# ACMI Phase 0.9.9：dsh 首个真实接入验收

**连接通过（`PASS_ISOLATED_NATIVE_DSH`），语义未通过（`FAIL_BOUNDED_CASES`）。生产自动路由仍为 `NO_GO`。** ACMI 首次在隔离的 stock dsh `0.2.2-rc.1` Agent Loop 中，把受权任务证据交给真实模型，并从 dsh 原生完成事件取回结果，由 Host 决定是否发布只读建议。不是已安装 CLI、用户 Profile 或生产插件验收。

## 冻结与执行

- 基点 `4669e3eb10e211262875e37e49196c16ab2925ea`；[预注册](../qualification/phase-0.9.9-dsh-preregistration.md)提交 `bcedb1fb5413c6d08f152e581f97f9b12b6a59a1`，文件 SHA-256 `89e0ecab1550038d81e158ca067f863dd4840d6730ddaab561c358bfab2b112b`；冻结实施提交 `efee04c8d0ffa9d3d58d0c8bc800795df75002e1`，在实际推理前。冻结数据为 12 个新合成故事、16 个条件；没有复用历史 Holdout，没有真人或正式独立盲测。
- 唯一实验环境是 dsh。专用本地 adapter 由 dsh 原生 turn 调用并返回真实结果，不绕过 dsh 单独跑模型评测。后端是 [Qwen 官方 Qwen3-14B GGUF Q4_K_M](https://huggingface.co/Qwen/Qwen3-14B-GGUF) 与 [llama.cpp b12283](https://github.com/ggml-org/llama.cpp/releases/tag/b12283)，RTX 3060 Vulkan，27 层 GPU 配置。二进制、权重、用例摘要在启动前校验；生成配置及复现步骤见[手册](../runbooks/phase-0.9.9-dsh-reproduction.md)。
- 16 次真实生成、16 次 native adapter 调用、16 条原生 Assistant 响应和 completed turn，与后端独立运行日志计数一致；无重试、无截断。3,864 输入 + 186 输出 = **4,050 实际 tokens**，预留 6,424，低于冻结总上限 18,944。只用一次性本机认证，未读取现有 API Key，外部 Provider 调用和外部 API 费用均为 0，拥有的监听进程已退出。

## 结果

| 冻结条件 | 模型原始选择正确 | Host 建议/弃权正确 | Host 误发身份 |
| --- | ---: | ---: | ---: |
| 跨 Session，有授权前文 | 1/4 | 1/4 | 0 |
| 当前话语与 Binding 冲突 | 4/4 | 4/4 | 0 |
| 不应给身份（前文关闭 4 例、证据不足 4 例） | 8/8 | 8/8 | 0 |

跨 Session 配对中，关闭前文时 4/4 澄清；授权开启后，屋顶门闩案例发布正确建议，另外 3 例仍原样澄清（别名、双语别名、中文原名各一）。这 3 例不是 JSON、引文或 Host 校验失败：模型根本没返回候选。没有对照可把原因归结为模型大小、语言或别名。Binding 冲突的 4 例均基于当前话语，而非沿用既有 Binding；证据不足时为 3 次澄清、1 次无建议。全批 5 次建议、10 次澄清、1 次无建议，未观察到模型原始误选，也没有 Host 误发身份。跨 Session 的 1/4 低于预定 3/4 门槛；4/4 显式切换不能抵消。

## 边界与后续

- dsh 的焦点 `user/message` 是唯一可信当前输入。历史合成 turn 是由 Host 先写入隔离原生 Session 的固定夹具，不是从用户实际 Journal 读取。模型只收到已获准的侧车和候选 handle；原生事件证明授权关闭和拒绝时历史不出现在包内。请求侧车不写 Journal；dsh 正常保存当前 User/Assistant 消息，模型响应本身可能包含获准引用。Host 从完成事件重新校验请求摘要、授权、来源与唯一摘录，自行计算 UTF-16 坐标。
- 每个回合核对隔离旧 Journal、Graph 文件、既有 Binding 和提案数前后不变；无工具调用、自动 Binding、模型写 Graph、Result 接受、Join 或关闭操作。已安装 dsh、原始 Session Journal、生产默认插件未改。功能默认关闭。仅连接和只读行为被验证；固定的两条候选都预先提供，所有正例都是第二候选，本轮不测候选召回、广泛意图理解或生产安全率。
- 下一步仍只在 dsh：先在新样本上比较「Host 直接解析受权、唯一的显式名称」与「模型先选、Host 校验」，把跨会话回指拆成“识别用户要回到哪段历史”和“在那段历史中识别任务”。随机化候选位置和 Binding 位置，分层覆盖直接命名、别名、双语和自然改述。保持同一 dsh 路径、权限与弃权规则；不重复消费本批。其他 Agent 可以复用接口，不能复用这次资格判定。

完整检查、Built dsh 回归、离线评分重放和 ZIP 独立验证见交付包。评分重放只读记录，不再生成。未 Push、未发布 Release、未进入 Phase 1.0。
