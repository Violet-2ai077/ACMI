# Phase 0.9.5 本地实施计划

**目标：**在不依赖全量人审、不启用自动绑定的前提下，对「明确建议或澄清」建立可重复验收。

- [ ] 预注册并提交；独立 worktree，不修改 0.9.4 结果。
- [ ] 先写 Core 测试，冻结输入和读侧边界；实现 `task-reference-advice.ts`，复用 scoped context builder。只认窄语法、授权 catalog 或前一已认证显式选择；不加 runtime 挂接。
- [ ] 构造独立合成故事簇、反事实变换和固定 open-only evaluator。拆分 retrieval/identity/abstention，输出预测、变换证据和验收判定。
- [ ] 运行新契约与工作区回归；把旧开放语料的探索性读数与新结构基准分开。
- [ ] 提交本地工作，输出复现命令、中文结果、摘要与证据包，停止。
