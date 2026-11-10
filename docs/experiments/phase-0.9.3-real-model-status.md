# W7 真实模型评测：BLOCKED

`BLOCKED: explicit authorization required`。实际 Provider 请求数 **0**。本阶段未实现联网 adapter、未触碰真实 API Key、未读/传真实用户 Session、未修改默认 Profile，也没有自动运行任务。离线 `LayeredProposalAnalyzer` 仅接收只读包和语义输出，回传受限 JSON；后续若独立批准真实模型，Adapter 仍不得获取 Host writer。

启动须由用户另行明确批准 Provider、模型及固定版本、endpoint/地区、账号隔离、数据及 split SHA、隐私/留存、最大请求/输入输出/费用/时限、重试和停止条件。还需真人双标、仲裁、独立保管资格 Holdout、冻结 evaluator 和可审计的单次消费步骤。沿用前阶段配对协议，阈值与停止条件见本阶段[预注册](phase-0.9.3-preregistration.md)。人工标注不可由程序或 Agent 代替；当前只报告 scripted mock。
