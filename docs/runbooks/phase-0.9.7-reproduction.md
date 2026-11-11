# Phase 0.9.7 离线复现和授权边界

使用 Node 24.16.0 / pnpm 11.28.5；没有外部模型调用入口：

```powershell
pnpm install --offline --frozen-lockfile --ignore-scripts
pnpm check
node --test "scripts/phase-0.9.7/*.node-test.mjs"
node scripts/phase-0.9.7/benchmark.mjs <new-output-dir>
```

七份 JSON 可按 SHA-256 复现。只给未来传输层 `requests.offline.json` 各记录的 `payload` 和 `frozen-contract.json` 中的 prompt/schema；禁止发送整个文件或归档、oracle、split、固定响应、Host 私有映射。请求摘要覆盖 prompt/schema/payload；未来 transport 必须从已提交的请求绑定 receipt，不相信模型自报的 ID。真实 Provider route 及授权配置未启用。

本地回放（不证明真实模型调用）：`node scripts/phase-0.9.7/replay.mjs <local-responses.json> <new-score.json>`。输入为 `{protocol:"acmi-097-matched-identity-v1",records:[{storyId,mode,requestDigest,raw}]}`，mode 为 off/on、raw 为原始 JSON 字符串。只读取指定本地文件，校验 request digest、候选、证据和固定分母；不访问网络、凭据或执行模型建议。

授权后先锁定数据区域、留存/训练政策、固定 Provider 与模型版本、实际 token/cost caps、拒绝或泄漏的终止规则、批准记录与 digest。默认建议 56 个合成请求、单并发、零自动重试；这些是提议，不是授权。不得从本地文件或已登录会话自动取凭据。真实调用前要验证传输的计费上限和日志脱敏，保留拒绝、超限、失败与缺失在分母中。无盲集，不报告生产资格。
