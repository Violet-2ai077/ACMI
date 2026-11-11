# Phase 0.9.6 配对实验复现

Node 24.16.0 / pnpm 11.28.5。无需网络、Provider、凭据或真实 Session。

```powershell
pnpm install --offline --frozen-lockfile --ignore-scripts
pnpm check
node --test scripts/phase-0.9.6/experiment.node-test.mjs
node scripts/phase-0.9.6/benchmark.mjs <new-output-dir>
```

`inputs.synthetic-host.json` 是合成 Host 夹具，不是可直接外发的模型输入。Benchmark 固定从本阶段新 fixture 构造 2×2；没有 Holdout、随机抽样或真实 Provider 参数。比较六个非计时 JSON 的 SHA-256。

未来有授权时，远端只能收到显式投影的候选包和通过验证的授权证据（或无证据），不发 oracle、split、原始 Session、私有事实、未授权候选和未验证前文。调用前再次校验 scope/revision 和脱敏策略。此实验让 evidence-on 在可投影的非行动请求上也保持同一输入干预；若以后做产品展示，应先确认需要澄清再取前文，避免不必要读取。
