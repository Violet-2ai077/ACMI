# Phase 0.9.3 离线复现

在本地 Phase 0.9.3 worktree 或对指定基点应用交付 patch 的干净 clone 中，使用 Node 24.16.0、pnpm 11.28.5。

```powershell
pnpm install --offline --frozen-lockfile
pnpm check
node --test "scripts/phase-0.9.3/*.node-test.mjs"
node scripts/phase-0.9.3/corpus.mjs verify
node scripts/phase-0.9.3/evaluate.mjs <new-output-dir>
node scripts/phase-0.9.3/performance-probe.mjs <new-probe-json>
```

评分 CLI 只接受一个新输出目录，读取固定的 open corpus 并检查 SHA-256；没有 Holdout 路径参数，不读内部 reserve 或早期样本。比较 `results.json`、`ablations.json`、`confusion-matrices.json` 和 `cluster-bootstrap.json` 应逐字节匹配。性能数据因机器、调度、JIT 和 GC 波动，不能要求字节匹配。配对协议见[预注册](../experiments/phase-0.9.3-preregistration.md)。

旧回归只运行 0.8/0.8.1/0.8.2/0.9 fixture 基准和 0.9.1 的 `--open`，确认输出 `holdoutRuns: 0`；不要运行 `--final` 或重新消费旧 Holdout。真实 Provider 不在复现步骤内。Source/Built Shadow 命令见[隔离运行手册](phase-0.9.3-shadow-operations.md)。
