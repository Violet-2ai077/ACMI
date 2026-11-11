# 模型原生归属生命周期（实验）

1. Host 捕获原生 `user/message` 身份和 Session 事件序号，并提供当轮别名。
2. 每次模型请求由 Host 生成新的 generation ref，绑定授权目录快照；传输账本记录请求摘要、票据和 usage。
3. Adapter 完整验证 buffered 回复；只有安全文本及允许动作成为 dsh blocks。成功的归属是 `model_attribution_proposed`，不是已接受归属。
4. 实验 Host 将原生完成事件与同一请求的回复摘要和 usage 对账；Sidecar 不写到 Journal。校验失败用安全的失败码，原始合成输出仅在隔离证据目录。

原型的目录是静态冻结合成数据；验证 Workspace/目录版本不是生产授权热更新，也未实现持久化提案、授权重查、跨进程去重和人工修订 API。Core Model 保持冻结，不修改 Session、Task、Segment、Outcome 或 Join 合同。
