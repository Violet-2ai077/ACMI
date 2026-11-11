# Phase 0.9.5 本地复现

Node 24.16.0 / pnpm 11.28.5；不访问网络、Provider 或凭据。

```powershell
pnpm install --offline --frozen-lockfile --ignore-scripts
pnpm check
node --test scripts/phase-0.9.4/qualification.node-test.mjs
node --test scripts/phase-0.9.5/benchmark.node-test.mjs
node scripts/phase-0.9.5/benchmark.mjs <new-output-dir>
```

构造 manifest、inputs、oracle、predictions、metrics、094-open-diagnostic 可逐字节复现。历史 0.9.4 只调用冻结 open corpus；没有 Holdout 路径或消费入口。离线正控不需要任何人充当 reviewer。

`inputs.json` 是**合成 Host 测试夹具**，含故意放入的越权/失效输入以及未校验的前序证据，不能作为模型输入。未来有授权时只投影已通过 Scope/ACL、预算与 revision fence 的包，另把认证前序事实作为明确干预；禁止将 oracle、split、拒绝原因详情、被拒的候选、真实 Session 或项目私有数据发送。冻结 Provider/model、schema、prompt、数据地域、存留、token/cost cap、并发和终止规则后才可运行。评审必须给证据或弃权，不能赋予生产权限。

出现建议错误、泄露、状态/版本错位、对只读历史暗示绑定或任何非预期写入时停止扩展，并保留合成输入和回执复现。
