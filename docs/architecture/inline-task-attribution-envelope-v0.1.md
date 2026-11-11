# 同次生成 Envelope v1（实验）

一个模型 completion 包含 `assistant_response`、`acmi_attribution`，有工具时还包含 `actions`。User 与 Assistant 分别标记。候选引用是请求级 opaque Handle，不是任务身份或权限。无任务、歧义、创建建议分别用 `no_task`、`unresolved`、`new`；后者必须携带临时 ref 和目标，不创建 UUID。WorkNode 必须与 Task 配对。关联 Task 是集合；本原型不实现可评分的多任务 span 标签。

Wire 见 `scripts/phase-0.9.10/wire.mjs`，独立验证见 `integrations/dsh/src/inline-attribution.ts`。唯一引文由 Host 计算当前或授权 handoff 的 UTF-16 半开区间；验证来源与范围不证明该引文支持语义。support 不是校准概率。

协议缓冲至 completion 结束，不提供真实首 Token streaming。截断、不合法的顶层 JSON、重复键、未知字段或作用域/代际不匹配时，不发原始内容、不执行动作。严格拒绝会影响正常回答的可用性，不能把 raw 答案正确等同于用户成功看到答案。
