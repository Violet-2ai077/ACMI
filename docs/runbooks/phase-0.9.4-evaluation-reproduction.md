# 0.9.4 离线复现

```powershell
pnpm install --offline --frozen-lockfile --ignore-scripts
pnpm check
node --test "scripts/phase-0.9.4/*.node-test.mjs"
node scripts/phase-0.9.4/corpus.mjs <new-corpus-dir>
node scripts/phase-0.9.4/evaluate.mjs <new-result-dir>
```

不传 Holdout、模型、凭据或 endpoint。比较四份非性能评测文件及语料/盲包 SHA-256。历史仅用 0.8–0.9 fixture 基准、0.9.1 `--open`、0.9.2 research node tests、0.9.3 verify/open tests。勿运行旧 `--final`、reserve 操作或含真实 Session 的路径。
