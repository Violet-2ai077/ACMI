# Phase 0.9.10 本地复现

只读复核用交付数据，不重跑已消费 Pilot：

```powershell
node scripts/phase-0.9.10/score.mjs <corpus-dir> <isolated-evaluation-dir> <new-score.json>
node --test scripts/phase-0.9.10/score.node-test.mjs
```

生成器可向新目录导出冻结题面和独立真值：`node scripts/phase-0.9.10/corpus.mjs <new-empty-dir>`。摘要由 config 固定，评分器再校验文件字节。真实实验需要重新授权、预注册与未消费样本；不能沿用现有实验目录或覆盖失败证据。冻结真实入口：

```powershell
node integrations/dsh/tests/fixtures/run-inline-attribution.mjs <pinned-llama-server.exe> <pinned-weights.gguf> <new-run-dir>
```

需 RTX 3060 Vulkan、历史完整 llama.cpp DLL 目录和权重、Node 24.16、stock dsh 0.2.2-rc.1。校验失败立即停止；不下载或替换权重。入口启动独占单槽 IPv4 loopback child，释放自有进程；不得触碰原有服务。私有 runtime stdout/stderr 不分发，交付只含结构化账本与脱敏摘要。
