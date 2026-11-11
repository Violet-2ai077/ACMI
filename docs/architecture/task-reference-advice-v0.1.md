# Task Reference Advice v0.1

`adviseTaskReference` 是一个默认关闭的同步读侧 API。它没有运行时入口、订阅、自动反馈采集或写接口。调用者必须是已核验 Host：将已认证 actor/cursor 的当轮事件、授权的候选视图、当前 cut、Scope capability、对象 ACL 和显式的启用开关送入。不能直接使用客户端或模型提供的 flag、`catalogComplete`、cut 或前序确认。

| 证据 | 结果 |
| --- | --- |
| 明确单句选择 + 发行的精确 Task ID，或完整授权目录中唯一精确 title / alias | 活跃候选 `suggest_active`，不是 Binding |
| 明确单句只读查阅 + 唯一已关闭目标 | `reference_history`，不可重开/切换/绑定 |
| “刚确认的那个任务” + 同一 Session 的前一 cursor 有 Host 认证用户选择、全部 revision fence 一致、候选仍发行且活跃 | `suggest_active`，绑定额外证据哈希 |
| 两个同名、缺证据、关闭任务被要求切换、名称视图不完整 | `clarify`，不返回任何 Task ID。Host 可询问交付物或显式引用，不从未授权目录补选项 |
| 非支持句式、Tool 或 Assistant 的文本、引用/条件/多句混合 | `no_suggestion`；不是已理解为“无工作” |
| 预算/ACL/cut 回调失败、过期或 Scope 拒绝 | `unavailable`，不返回 Task ID |

对名称唯一性的证明只涵盖 Host 认证的当前授权命名空间。若只提供 Top-k、无法证明目录完整、出现过期/无效/裁剪的候选，调用者不能以名称发出唯一建议。显式 ID 仍必须存在于包且通过 ACL。当前绑定、候选顺序和模型保留的猜测不算指代证据。认证的前序选择与当前包分开，回执的 predecessor digest 覆盖包 hash、前序事件、cursor、任务和 revision；hash 是完整性标记，不是签名。不会跨 Session 继承猜测。

输出为不可变的观察值。成功项包含本地 Task ID、当前原文 span/digest 与 packet digest，不带 apply/bind 操作。Core 在返回前重读 cut 并复查 Scope/目标 ACL。异步 UI 以后消费结果时仍须由 Host 重验 scope/cut/revision；不能把这次同步检查当长期能力令牌。

v0.1 只支持短的中/英/混合显式句式，不做语义解析；例如「切到终点饮水台维修」「Look up old courtyard grade notes」。若有自由改述、反语、叙事上下文、多个子句，不承诺识别。接口不是授权执行器，也不读取真实 Journal。
