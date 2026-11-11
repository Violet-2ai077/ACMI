# Phase 0.9.9：原生 dsh 身份建议

使用 lockfile 中的 stock dsh 0.2.2-rc.1 服务和 Agent Loop。不是运行已安装的 CLI 或复用日常配置。集成入口 `registerDshIdentityAdvice` 默认不启用，只接受带隔离 marker 的 Workspace、Host 选定 Session、只读目录和显式历史授权。唯一使用者是专用 dsh 模型 adapter；默认插件、生产配置和工具表不变。

Host 侧车从原生事件及目录拼出带限量 handle 的请求。侧车不作为 runtime-context 写入当前 Session；dsh 正常保存真实模型回答，回答本身可能引用已授权的摘录。Host 从原生完成事件复核而不是信任 adapter 自报，引用坐标由 Core 计算。只实现可核验的直接名称和明确回指，不把自由改述或有效坐标冒充语义证据。其他运行时可复用 Core 合同，但需各自验证适配器。

```powershell
pnpm install --offline --frozen-lockfile --ignore-scripts
pnpm check
$env:ACMI_TEST_BUILT='1'
pnpm exec vitest run integrations/dsh/tests/identity-advice-native.test.mjs
Remove-Item Env:ACMI_TEST_BUILT
```

真实模型入口仅在已经冻结、未消费的批次运行：

```powershell
node integrations/dsh/tests/fixtures/run-native-identity.mjs <pinned-llama-server.exe> <pinned-Qwen3-14B-Q4_K_M.gguf> <new-isolated-run-dir>
node scripts/phase-0.9.9/score.mjs <run-dir> <new-result.json>
```

版本、模型摘要、语料摘要和预算见 `scripts/phase-0.9.9/config.json`。发布来源：[Qwen 官方 14B GGUF](https://huggingface.co/Qwen/Qwen3-14B-GGUF)、[llama.cpp b12283](https://github.com/ggml-org/llama.cpp/releases/tag/b12283)。程序启动一次性本机认证，拒绝现有 API Key，后端不出网。复验只重放 scorer，不删除一次性标记、不重发已消费题目。
