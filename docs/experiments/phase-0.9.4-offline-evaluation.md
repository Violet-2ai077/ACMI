# 离线对照结果

六个主臂使用完全相同的焦点包 digest、候选、合同与预算，状态臂仅增加本地同 Session 前缀 replay 缓存；不向 scorer 之外的代码传 Gold。provider-neutral callback 只收包与取消信号、输出 JSON。输出带 policy、prompt version、packet/output SHA、预算、尝试次数、真实 tokens/费用 null。只重试超时一次；同步阻塞不能被 JS 计时器强行中止，未来真实适配器须实现进程/传输级取消。当前没有网络实现。

| Validation 臂 | L2 exact | 在榜 L3 exact | L3 coverage | 已覆盖 L3 exact |
| --- | ---: | ---: | ---: | ---: |
| 字面名确定性 | 3/59 | 10/45 | 10/47 | 10/10 |
| 0.9.3 分层规则 | 20/59 | 9/45 | 10/47 | 9/10 |
| 分层脚本 | 20/59 | 9/45 | 10/47 | 9/10 |
| 增量脚本 | 20/59 | 10/45 | 11/47 | 10/11 |
| 事件混合脚本 | 20/59 | 10/45 | 11/47 | 10/11 |
| 优先弃权 | 3/59 | 7/45 | 7/47 | 7/7 |

后三个架构脚本为 `scripted_not_model_output`；优先弃权的 7/7 不是语义质量证据。规则 L1 act F1 0.214、exact span F1 0.089（provisional span），L2 覆盖 37/56、covered exact 19/37，L5 语义 exact 37/59，执行 0。单轮不分层对照 L2 17/59、L3 在榜 10/45，没有一致收益。前缀分析 201 vs 199（混合略过 2 个可信 metadata，没有跳过焦点），身份结果一致。无 typed facts 的消融在本语料未显示收益；事实多是历史元数据而非当轮可认证结果正文。

自然语言开放语料中的结构语法脚本没有产生有效 Graph Claim；支持类型匹配为 Dev 0/17、Validation 0/13。Protected precision 无分母，0 条具备完整可信拓扑的 protected eligible，2000 次簇 bootstrap 无可定义区间。单独结构正控验证可产生一项只读 objective draft；负控验证错误来源/摘录、scope/handle、输出与 Graph revision、预算超限均拒绝。不能用正控替代开放自然语言效果，或把不产生输出当作高 precision。

测试无 Graph writer、无绑定/应用/接受/Join/关闭路径；在合成输入下未发现越权任务句柄暴露。进程内组包计时见 performance.json，仅本机局部计时，不是 SLA。
