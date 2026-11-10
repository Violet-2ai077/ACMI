# Phase 0.9.2: Future real-model evaluation protocol

**仅为未来协议，本阶段真实 Provider 评测请求数 = 0。** 本文件不是授权、配置或可运行适配器。不得读取/探测凭据、用 Codex/ChatGPT 或其他账户额度评测、改默认 Model/Provider/Profile、创建自动运行任务，或向模型发送真实用户 Session。后续必须有用户独立、明确、可审计的授权；缺一项均不启动。

## 独立授权单（当前全部待批）

| 审批项 | 必填决定 |
| --- | --- |
| 授权与责任 | 用户批准记录和范围、运行负责人、外部数据保管人、数据/费用责任人、授权期限、撤回路径；写明批次 ID 及允许的阶段（探路/验证/资格）。 |
| Provider 与 endpoint | Provider、固定 Model ID/版本（若无法锁版本，登记实际回执和漂移即停）、API route/区域/租户、仅本实验可用的隔离身份；不得回退到默认账户或未批准模型。 |
| 数据范围与位置 | 批准输入 split 和 hashes、来源（默认仅独立合成），处理/落盘区域、传输及访问列表。真实数据需要另批来源、同意/法律依据、字段 allowlist 和清洗；真实 Session 原件不进入本协议。 |
| 隐私 | 固定服务留存、训练使用、子处理方与删除条款；只发去标识且必要的有界内容，禁止密钥、个人标识、原始日志/路径、可执行工具、标签或调参反馈。清洗版本和扫描检查应先在隔离环境通过。 |
| 预算 | 固定总 token 数、每案每臂跨调用输入/输出 token 上限、请求总数、总金额/币种、费率快照、并发、timeout、限流与 retry。流量明细缺失或单价不确定时，不启动或保守预留再审批。 |
| 可复现参数 | 每臂 system/developer/user prompt 模板和 hash、schema/structured output mode、运行代码/路由器/状态与 evaluator hash，temperature/top-p、seed（不支持则标明）、输出长度与字段上限。 |
| 存储与审计 | 分离旧 mock 与新真实输出的根目录、访问权限、落盘加密、redaction、原始响应保留期/删除方式、hash 和发布字段；拒绝把原始响应放入公开 ZIP。 |
| 停止条件 | 阈值写明：预算/请求数、连续瞬态失败率、泄漏或越权、数据/版本/hash 漂移、审批过期/撤回、输出保留政策变化。任何异常先停后审，不静默切换 Provider、route 或模型。 |

离线预检先完成 schema/预算/取消/禁用写操作的模拟演练。未来获准时，可先申请小批纯合成 Dev 兼容性探测（不是资格集）；数据保管人收到已冻结 Validation 对比及单次消费承诺后，资格授权仍另签。任何批准字段变化都要重新签字，不推定批准。

## 比较臂与匹配消融

| 臂 | 唯一主要差异 | 固定条件下观察 |
| --- | --- | --- |
| A: single-pass structured reasoning | 每焦点一个无跨焦点私有状态的模型调用，生成统一最终结构 | 最短路线，观察分层失败是否混淆 |
| B: hierarchical reasoning | 分层生成 turn act/work intent、target resolution、proposal；同一模型在预算内拆多调用 | 定位候选、证据和结构错误，记阶段传播 |
| C: stateful incremental reasoning | B + 对同一可见事件序列生成可丢弃、带来源的 Session 状态；只按当时信息推进 | A/B/A、纠正、窗口遗漏与过期状态恢复 |
| D: event-triggered hybrid | C + 冻结的确定性 gate；跳过无须推理的事件，必要时进入分层模型或弃权 | 触发召回、弃权覆盖、预算/延迟差异 |

主比较预登记 A↔B（拆阶段）、B↔C（状态增量）、C↔D（事件门禁），各对只改表中差异。额外组件消融（例如 D 去掉 trigger 或 C 重置跨轮状态）仅在相同冻结 Dev/Validation 进行；除非预注册为同一次资格批次的一部分，不在终测追加运行。实际数据集、候选集和输入规范化不得随模型臂改变；单臂 raw/prompt 策略不得知道 gold，外部保管人隔离。

- **同一因果输入与候选**：逐焦点使用同一冻结的可见前缀、焦点、角色、Session/Graph/候选版本、ID/顺序及缺失标志。各臂看到相同授权的历史和可用候选，不能接触截断之外的原始历史；C/D 只能把同一前缀计算成局部状态，携带证据 ID，跨轨迹清空，严禁看未来或前臂输出。固定候选的观察模式隔离理解性能；改变检索器、额外内容或真实闭环状态流属另行批准的实验，不混入公平比较。
- **同一预算、schema 和 evaluator**：按同一轨迹/焦点分配相同输入+输出 token 总额度与统一计量/超限规则；B/C/D 的调用拆分、重送上下文、持久状态生成、重试均计入本臂，不从别臂借额度。状态处理开始前固定跨焦点 token 归属，防止把前缀处理当免费。A/B/C/D 同一最终结构/证据语义、Guard 和冻结 evaluator/hash；B/C/D 内部中间记录不作为模型正确输出。预算上限相同不强行凑实际用量，D 跳过的推理照样进入分母，区分 skip、显式 abstain、错误和超时。
- **同一模型和运行政策**：模型版本、route、结构化模式、采样、split、tokenizer、随机种子政策、并发/重试规则相同。独立请求避免对话污染；按轨迹顺序处理 C/D、跨臂交错运行以降低时间/服务状态偏差。Provider 不保证确定性时如实记录；未来若在 Dev/Validation 重复，预定 seeds 和次数，不给同一终测重复挑最好成绩。

## 计量、停止、报告

- 请求前原子预留：请求数、最大 token 数和金额（输入、输出、可能的 cached/reasoning tokens、税费按批准口径；以保守上界核算），响应按 Provider 使用回执结算。所有实际网络发送和已批准瞬态重试均计数；用量未知保留全额，绝不释放为零。重试只限明示瞬态、重新通过预算门槛并满足幂等/不重复执行；未取消成功的超时请求不并发重发，禁止以 semantic failure、schema failure 或低质量为由重试。
- 报 raw pre-Guard 分母（含 parse、schema、语义和证据失败）和 post-Guard 政策分母/误拦截；Guard 拦截不补计模型正确。预注册按 intent/target 分层，报候选覆盖与 conditional target exact match、false merge/split/wrong existing target、生命周期/Graph 变更一致性、no-task/uncertain 混淆、证据覆盖、abstention precision/coverage 和 selective risk、注入失败与不可逆变更的错误建议。单列未完成/超时/无效/缺标签数和拒绝原因。按轨迹/分组做配对差值与区间，分别报语言、长对话、跨 Session、高风险层的分母。延迟、调用、tokens 和成本按全批与有效覆盖同时报，不把高弃权伪装成准确。
- 一旦发现未经批准的数据发送、凭据暴露、版本/数据/hash 变更、超过预算风险或外部保管人取消，则停止，保留只读审计记录。若终测已消费，写 `consumed_invalid`；不能通过重试/修订凑完整结果，下一轮另构独立语料。
- 未来真实输出隔离到新批次目录（例如 `evaluations/real-provider/<authorized-run-id>/`；目前不创建）。按案/臂/请求保存可控原始字节 SHA-256（原文仅在获准加密区保留）、清洗后的响应及独立 hash、解析和 Guard receipts、版本/状态/预算收据；有界不可存的原文保留失败原因和可审计收据。批次 manifest 汇总文件 SHA-256、UTC、冻结/消费收据、操作者与权限；不会覆盖规则/mock、历史 benchmark 或旧终测的任何记录。

生产写路径、Session journal、Task Binding、Graph apply、Subagent acceptance/Join/关闭全部隔离且不可调用；模型仅输出建议。资格样本的来源、盲标及消费规则见 [语料设计](phase-0.9.2-benchmark-redesign.md)。
