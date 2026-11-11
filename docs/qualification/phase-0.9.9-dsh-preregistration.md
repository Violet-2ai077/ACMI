# Phase 0.9.9：dsh 首个真实接入验收

基点 `4669e3eb10e211262875e37e49196c16ab2925ea`。冻结在实现和真实生成之前。依据用户已批准的 dsh-first 路线，本轮只在隔离的 stock dsh `0.2.2-rc.1` Agent Loop 验证，不改已安装实例、用户 Profile 或原始 Session Journal。

## 合同与部署

- Host 选定并授权一个 dsh Session。ACMI 从原生已接纳 `user/message` 取得焦点，在 dsh 形成 LLM request 后、其 LlmAdapter 发给后端前，只投影受限候选、当前 Binding handle、经 Host 明确允许的另一 Session 的完成 User 原文。由 dsh 接收真实响应并形成 `assistant/message`、`turn/end`；Host 从原生输出再验证。上下文走专用请求侧车，不把旧会话文本写入当前 Journal，也不注册到默认插件。适配器不挂载任务写工具。
- 历史只从 Host 拥有、在同隔离 Workspace 的原生 Session 事件读取，核对身份、坐标、用户来源、完成 turn、ACL、版本及预算；输出前重新取授权和版本。模型只收到包内 handle，不见内部身份、预期答案和不获准的前文。先要求精确引用，Host 在原文唯一定位 UTF-16 坐标；证据与目标不一致、别名冲突、语气不明确、越权、失效一律不给身份。只读建议，不自动 Binding、Graph、Apply、Result、Join 或关闭任务。
- 后端：dsh 隔离配置中的实际 `Qwen3-14B-GGUF Q4_K_M`，Qwen 官方 revision `530227a7d994db8eca5ab5ced2fb692b614357fd`，SHA-256 `500a8806e85ee9c83f3ae08420295592451379b4f8cf2d0f41c15dffeb6b81f0`。llama.cpp b12283 / `f3b407ca1`，RTX 3060 Vulkan，27 层 offload，ctx 2048，非思考、温度 0、seed 9901、schema 约束、单槽。服务绑定 127.0.0.1 并用一次性本机 token，不继承任何现有凭据。公网只下载公开文件，不上传任何评测数据。外部 Provider 和费用均 0。

## 设计与验收

- 12 个新合成故事：4 跨 Session（每个前文关/开形成配对）、4 当前 Binding 冲突、4 证据不足（含同名、越权历史、无指代或引用），共 16 次最多各一个真实 dsh 请求；每案 input <=1024、output <=160、总保留 token <=18,944，单并发、每案 120 秒、零重试；连线、权限或预算异常停止。两个配对臂候选、Binding、当前话语相同，不把 16 次当 16 个独立故事。不用历史 Holdout 或真人数据。
- 连接验收：16 个焦点进入真实 dsh Agent Loop，16 个由原生响应结束，前文关或禁止时不可见；任务身份和允许历史的授权、负控、过期检查通过；原始会话不可访问，测试隔离 Graph、Binding 和历史 Journal 保持不变，无工具和自动持久操作。焦点 Session 的正常 User/Assistant 写入是 dsh 原生行为，不是 Graph 或 Binding 变更。
- 语义门槛独立：跨 Session 可解对至少 3/4，Binding 冲突至少 3/4，8 个无身份条件中零错误身份发布；另报告模型原始选择、可解正确、回退和误选。证据不足时安全澄清不算正例成功。连接通过不等于语义通过；不把一个 dsh 配置的结果外推至其他 Agent，仍不授权生产自动路由。
