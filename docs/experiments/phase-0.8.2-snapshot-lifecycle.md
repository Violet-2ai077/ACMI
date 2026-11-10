# Phase 0.8.2 Snapshot lifecycle

参见 [生命周期](../architecture/context-snapshot-lifecycle-v0.2.md) 和
[撤权验证](phase-0.8.2-revocation-validation.md)。测试在 Cordis 4.1.0 +
stock dsh npm 0.2.2-rc.1 组合中进行，使用本地脚本 adapter，未调用网络
Provider。Level B 继续使用 stock 动态上下文，Native Compact 不替换。

上游参考 `fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159` 的
`packages/core/agent-loop/src/runtime-context.ts:157-166` 生成持久化
runtime-context message；`CLEARED` 是追加的状态，而非删除。公开 Session
message projection 针对声明的事件形态，不是现有历史的全局过滤/擦除。
已发布 `dsh-llm/lib/index.js:2399-2403` 将公开 waterfall 放在 adapter 之前；
已发布 `dsh-compaction-basic/lib/index.js:319-323` 在 Compact 的调用中携带
`sessionId` 和 `purpose`。普通 AgentLoop 和手动 Compact 均在运行中验证。
