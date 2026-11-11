# 真实模型评测授权准备

**BLOCKED: explicit authorization required**。实际请求 0、读取凭据 0、费用 0；本阶段没有真实调用入口、不会使用当前登录态或安装配置。脚本 receipt 的真实 token/成本均为 null。

未来运行前需单独取得书面批准并锁定：

- Provider、固定模型 ID/版本、API 路由、处理/存储地域、数据处理方及 retention、训练 opt-out、删除/访问审计。
- 只允许批准过的合成输入；禁止真实 Session/邮件/用户文件/项目私有数据。明确输入输出分离、静态加密、输出脱敏、保存期、查看人、到期销毁。
- 各臂调用和 token 上限、包括重试的总费用 hard cap、币种、并发、超时、允许重试类别和次数；超额、未授权字段、数据地域不符、异常输出、凭据泄漏或安全失败立即熔断。
- 固定 prompt/policy、model/schema/evaluator/commit digest、输出 hash 和计费回执、凭据由授权 Host 临时提供且不得进入日志；不得修改默认 Profile。
- 用户批准记录含版本、时间、范围、签批人、撤回方式；独立 custodian 和完整人标另行签收。批准前不要询问/读取任何 API Key，不开启评测调度。

准备表未填写即禁用。离线适配器只有本地 JSON callback；接入真实模型需要另案实现权限、数据、账单与隔离审查。
