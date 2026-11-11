# Phase 0.9.10 预注册：同次生成回答与任务归属

基点 `1d616022b752806cc33fd24e04e027c5e6a3e028`。这是可证伪实验，不是生产资格。H1：一次 completion 包含独立的 User/Assistant 归属与回答。H2：适配器先隔离归属，再把安全内容送进 stock dsh；实际 Tool Call ID 与归属可关联。H3：同次标记在冻结合成样本上提供有用的只读建议，优于只继承 Binding，并避免 C 的额外归属生成。

## 固定实现与环境

- 唯一模型为历史 Qwen3-14B Q4_K_M 官方 revision `530227a7d994db8eca5ab5ced2fb692b614357fd`。RTX 3060 Vulkan、27 层、单槽、2048 context、关闭思考和缓存、temperature 0、seed 9901。权重、launcher 和关键 DLL 摘要见冻结的 `scripts/phase-0.9.10/config.json`。锁文件中的 dsh 0.2.2-rc.1 和 Cordis 4.1.0；不启用机器安装版。
- 冻结适配器协议 v1，精确提示词与 schema 见 `scripts/phase-0.9.10/wire.mjs`。经 `/apply-template` 和 `/tokenize` 精确预检，再用一次 buffered `/completion` 及 JSON Schema；两个预检不是生成。只在完整验证后发出 dsh content blocks，不做增量透传。生成账本与原生记录用 Host generation ref、回复摘要和 usage 交叉核验；后端若无全局 ID，以单次有票据的 HTTP 请求为证，不声称后端公开了不存在的 ID。
- 不把 Sidecar、replayState 或授权历史写入 Journal；请求只使用当轮原生 User 文本及预先授权的合成候选/显式 handoff，不把全部历史喂给模型。Session 连续性与模型看见完整历史是不同命题。目标、断言和内部 UUID 单独冻结；Host 允许目录在发送前筛选。UTF-16 span 由 Host 通过唯一的模型引文定位。
- 工具只能是只读合成 lookup（amber/indigo），两次同 generation 的 action 独立映射为 dsh 原生 ToolCallId，不使用顺序猜测。正式 Pilot 用 stock `concludeTurn()` 终止成功的工具批，以满足每轮一次生成；普通非终止工具会原生追加模型步，另用脚本验证，不能把它算成单 completion 最终答案。子代理乱序、取消/失败及晚到归属是离线因果验证，不把脚本结果当作真实模型子代理行为；本轮不授予模型启动任意子代理的权限。

## 样本、顺序与预算

- 生成器 `acmi-0910-20261111-v1`，输入 SHA-256 `a7f9004f0ae260ab594aec0695dcea04ca9fe5b29521d37797fba1a7fe575a0d`、真值 `e0677c2388072a9bbd261dc4cd2a57eecc5d4aa8aa9e3904112c91be9dc40fce`。6 个独立 Pilot 故事各 4 轮（只 B）；20 个主故事各 4 轮（80 配对）。执行包第 16 节的 30–40 与 200 次硬上限冲突，采用第 9/10 节 20–24 的范围。Pilot 不纳入主语义成绩；不复用旧题。
- 每个匹配主故事独立 A/B Session，故事内按原顺序，同一轮候选顺序一致，A/B 起始顺序按固定 seed 打散。A 无标记，Host 只继承 Binding；为了公平比较，A/B 使用同一 action 传输适配器，A 的 wire 包装只有回答/合成动作，不是 CLI 默认 provider 的基线。B 同次回答和归属。C 对各主故事固定一轮：重新生成 A 式回答，再用同一模型及授权上下文做一次归属，不作为生产依赖。
- 每批正例目标轮换到 1/2/3/4/8，轮内顺序与 opaque Handle 以种子打散，Binding 独立（强制冲突族例外，预先记录）。8 个主轮各再跑两次：只移位，以及移位加改名。按故事聚类，三个排列不当作三个独立样本；改名与第二种移位有混淆，不单独归因。
- Pilot 24、主 200（基础 160 + 16 排列 + 最多 24 原生续步）、C 40，总 264。每次输入 <=1,400、输出 <=320、总预留 <=454,080；单并发、120 秒/次、零重试、总 4 小时。GPU >=80°C、完整性不符、dsh 版本不符、监听冲突、不能隔离泄漏、原生调用/Turn 被破坏、写入越界、发现真实用户数据或需外部 Provider 则立即停止。失败不删账本；不得根据 Pilot 成绩修改主集或门槛。缺历史模型不下载不替换，记录 BLOCKED。

## 验收

Pilot 硬门槛：24/24 同 generation、24/24 schema/Host validation 和原生 turn completion；末轮两条 lookup 均成功且因果关联完整；零泄漏、零越界写入、零额外归属调用。语义分不作 Pilot 调参门槛。若失败，只保留失败证据并停止扩大实验。

机制 GO：配对记录中 generation ref 一致 100%，元数据泄漏、非预期 Journal/Graph/Binding 写入为零；parse/map 错误逐条记录；原生行为正常且可重放。语义候选 GO：covered exact >=80%，coverage >=70%，高风险错合并 0，跨 Session 返回 >=80%，排列不变 >=95%，每动作归属 >=95%，结果因果继承 100%。原生完成率和冻结回答断言通过率相对 A 降幅各不超过 5 个百分点，合成工具成功率不下降；分母不足不宣称通过。报告无任务精确率/召回率、弃权、错误 Task、false merge/split、位置直方图、支持度分层、Token 与 p50/p95；自然语言流畅度无自动真值，不评。无额外样本则 INCONCLUSIVE，不得从协议 fixture 推断模型泛化；硬机制失败可以对当前路径 NO_GO。归属永远不产生自动 Binding、Graph 写入、Result 接受或 Join 满足。
