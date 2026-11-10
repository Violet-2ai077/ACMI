# Phase 0.9.3 四臂离线比较

**只评估离线确定性脚本，不是模型测评。** 相同 60 个新场景、162 个事件、65 个焦点，open SHA-256 `1270ca0b508cd505babbcbd4cce18010c94ff273e9c9db51dc1aaffa2fe2aa02`。40 Dev/20 Validation（43/22 焦点）；旧 0.9.1 归档与内部 reserve 均不进入评分。A 按整轮一次解析；B 按证据 span 分层；C 增加隔离会话状态；D 再加可信 metadata 调度和 1/8 抽样。所有主臂用相同授权候选、事实、预算、输出 schema 与 guard；C/D 同一前缀允许携带受版本约束的近期指称，状态是显式实验因素。

| Validation | L1 acts F1 | L2 exact | L2 coverage | L3 exact | L3 可解析覆盖 | L4 P / R | 必要事件触发 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A 单次 | 0.400 | 1/20 | 12/20 | 3/19 | 2/14 | 4/4；4/8 | 22/22 |
| B 分层 | 0.411 | 2/20 | 13/20 | 4/19 | 3/14 | 4/4；4/8 | 22/22 |
| C 增量 | 0.411 | 2/20 | 13/20 | 4/19 | 3/14 | 4/4；4/8 | 22/22 |
| D 混合 | 0.411 | 2/20 | 13/20 | 4/19 | 3/14 | 4/4；4/8 | 22/22 |

D 的 Dev：L1 F1 0.319、L2 exact 6/39、可回答覆盖 18/38、L3 exact 1/34、可解析覆盖 1/26、L4 5/5 precision 和 5/18 recall、必要事件 41/41。D 跳过 1 个非必要 Dev metadata；把 skip 留在分母而非给正确分。安全审查发现三类独立反例（单引号转述、询问是否切换、保留式认可），以保守语用保护修复；Dev 覆盖不能据此说已解决自然语言泛化。没有观测到 L5 写操作或跨 Workspace 候选泄漏；少量直接分配的条件下，误合并/拆分零并不意味着模型安全或有足够覆盖。原始语义提案和 Guard 结果分别计量。

**检索不等于身份。** D 的 Dev active Recall@8 24/25，Validation 13/13；closed Recall@2 每个 split 均 1/1。把授权内标注目标加入显式检索请求的 oracle 对照没有提高上述精确身份计数；不具授权的目标不会绕过 ACL，也不算可恢复。身份差距主要体现为无法从已有候选消解自然语言指称。

**L4 输入资格限制：** 60 个 open 场景均未附完整 Graph 快照；决定引用和拓扑 Claim 缺少 Host 权威前提，即使正确识别也应被拒。4/8 是整个开放脚本链的 kind 匹配，不是证据充分场景上的纯语义召回。完整正向与反向 Graph 合同另以 Core fixture 验证。

L2 exact 比较可用的 relation、posture 和 change；多 span 聚合时先取首个行动语义，再取首个讨论，不用答案选 span。L1 按焦点的标签集合比较，`authorization_request` 投影到 corpus `request`，`selection` 保留并可同时属于 request；typed causal observation 可提供 report。没有独立人工 span 金标，不能称为跨度精度。L4 比较已标注 kind 集合，逐 Claim 验证的可执行测试另报，不把 kind 匹配当成所有论元均已验证。详细按语言、风险、confusion、覆盖、mock calls、预算和 cluster bootstrap 随 ZIP。See [ablation](phase-0.9.3-ablation-results.md) and [reproduction](../runbooks/phase-0.9.3-evaluation-reproduction.md).
