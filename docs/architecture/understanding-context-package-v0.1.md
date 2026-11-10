# Understanding Context Package v0.1（设计，不是现行 API）

这是专为本轮理解构建的读视图，不是既有执行/恢复 Context Package 的替代品，也不是 Scope 令牌。身份决议、证据验证、提案审核各有独立边界。构造器仅接收 Host 认可的当前事件、授权候选索引、有限 Graph 读视图和当前理解状态；调用端不接触 writer。

| 部分 | Host 侧记录 | 给分析器的最小视图 |
| --- | --- | --- |
| Envelope | schemaVersion、policyDigest、workspace、session incarnation、cursor、bindingRevision、graphRevision、candidateSetRevision、authorizationEpoch、inputDigest | 版本、短租期 opaque packet ID、非敏感 capability/缺失提示；无实际路径/令牌 |
| Current | 有序 turn/event ID、认证 actor、原文 digest、顺序与来源、审阅时可还原的 source span | 清洗后的当前 turn、actor、opaque refs，保留否定/引述的上下文 |
| Focus | active Binding fact + version，待澄清指称和最近合法焦点 | 显式标识 `host_bound` 与 `hypothesis`，不能混合 |
| Candidates | 每个 Workspace 内授权的 UUID、revision、availability；可选少量安全 tombstone | 本包 opaque handle、目标摘要、状态、活动 WorkNode/约束、最短必要别名、入选原因；不可绑定的标为只读 |
| Runtime facts | 类型、可信来源、cause/relation、generation、cursor、证据摘要 | 呈现已观测事实（如 tool succeeded）；语义承认、消费、Join 不能从该字段直接派生 |
| Retained state | 最少保留 Task 切换提示、待澄清、限制、争议、证据 ref/版本 | 标为 pending/hypothesis，按 Workspace 和 Session 范围裁剪；不是全部对话 |
| Retrieval and budget | 游标、clipping reason、可见但未纳入候选总量的可安全表达、bytes/tokens、digest | 仅显示必要缺口原因；不披露外域或被拒实体及计数 |

**打包与故障规则。** 先授权、去敏，再按 slot 分预算；不可绕过 mandatory 区段：当前 actor + 有效 turn/事实引用 + 必要 scope + 明确缺失标记。序列按稳定 key 排序，UTF-8 规范化/原样策略固定，digest 覆盖 Host 封套与 canonical model view；证据定位记录原文 hash、半开区间、单位（UTF-8 bytes 或 Unicode code points，版本固定）以及清洗后的投影映射，不能把模型伪造的 quote 当来源。对 Tool/Subagent/历史消息内的指令只标数据，不能当系统指令；过滤路径、密钥、提示注入样本中的敏感字段，撤权时立即失效。若截断破坏否定/条件或无法放入必须字段，返回结构化 `input_incomplete`，无副作用；“摘要未提及”不等于不存在。

**起始预算（0.9.3 待实测）。** 可见 active 候选 ≤8，授权内只读 closed hints ≤2，retain ≤8 项，事实 refs ≤12；全部请求 ≤12 KiB UTF-8 且 ≤3,000 provider-neutral 估算输入 token，保留额外输出预算；预算取两者较紧，分段计量。溢出先剔除低相关历史与摘要，再排候选；不能用更多输入掩盖未检索问题。测试相同信息位置扰动及剪裁原因。长上下文并不能保证用上中部关键信息，见 [Lost in the Middle](https://aclanthology.org/2024.tacl-1.9/)；这是保留基准，不是 ACMI 实测结论。

示例（不对应任何历史样本）：

```json
{
  "schemaVersion": "understanding-context/v0.1",
  "packet": "p1",
  "current": { "ref": "t8", "actor": "user", "text": "看看归档，先别切换" },
  "focus": { "bound": "c1", "tentative": null },
  "candidates": [
    { "handle": "c1", "summary": "导入修复", "availability": "active" },
    { "handle": "c2", "summary": "归档整理", "availability": "active" }
  ],
  "facts": [{ "ref": "f7", "kind": "tool_succeeded", "causal": "call7" }],
  "retained": [],
  "coverage": { "mandatoryComplete": true, "clippingReasons": [] }
}
```

响应只允许已发行句柄、版本与 ref，走 Host envelope 复核。即使包和输出通过语义 schema，也没有 lifecycle 权限，不能由模型直接写入或携带写操作。
