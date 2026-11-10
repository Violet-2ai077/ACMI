# Task Identity Resolution v0.2

`LayeredCandidateIndex` 由 Host 提供同 Workspace 的版本化摘要。复用旧的 CJK/Unicode 有界 lexemes；构建时最多 512 项，24 条 posting/term 和 24 个 workspace recent ID，查询合并有限的明确 ID、Binding、recent 和 posting，非全 Session 或 Journal 扫描。授权检查在输出之前，外域及对象权限拒绝不进入排名、计数和错误诊断。候选排序只是可审阅线索，身份解析另做受授权的 literal/alias 比较。

解析器只返回当前包内 handle、待分配的新工作或 typed unresolved。多个可解释实体为 ambiguous，不默选排名第一。明确切换而无匹配时返回 `unavailable`，保留 switch 意图；不创建替代 Task。缺泛指、陈旧当前焦点和完全未知不相混。回指只使用同一有效包的近期活跃假说，并复核候选 revision；Binding 始终来自 Host。跨会话可以通过新的授权候选解析已有 UUID，不共享上一个 Session 的解释缓存。

Benchmark 的 oracle 只在独立诊断中把标注目标交给检索器作为明确 ID；它不能绕过 Scope、closed 状态或有界配额，也不进入主比较。词法/alias 匹配在相似词、隐式目标和缺别名时可能失败，资格仍待独立人工评测。
