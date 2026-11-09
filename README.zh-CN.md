# ACMI

[English](README.md)

ACMI（Agent Context & Memory Infrastructure）为智能体运行时提供跨会话的工作身份。会话切换任务，或另一个会话继续同一任务时，任务 UUID 保持不变。ACMI 记录显式绑定并提供带来源信息的只读历史。它不负责运行智能体，也不是自动任务识别器或长期记忆引擎。

**Alpha 阶段：**无需启动 dsh、提供凭据或调用模型即可运行确定性合成演示。首个官方集成为 [DeepSeek Harness（dsh）](integrations/dsh/README.md)，目标版本为 `0.2.2-rc.1`；安装和兼容性见 [dsh 快速入门](examples/dsh-quickstart/README.md)。接入其他运行时可从[适配器编写指南](docs/adapter-authoring.md)和[自定义适配器示例](examples/custom-agent-adapter/README.md)开始。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm demo
```

演示包含任务切换与恢复、具有因果关联的工具调用和结果、一个未归属事件，以及只读跨会话历史。[入门指南](docs/getting-started.md)说明如何打开 Observer 时间线。

**安全限制：**自动持久绑定已禁用；归因启发式仅用于离线研究。dsh 历史读取要求可信本机与单 Workspace 独占的 Storage Root。不支持 Windows 敌对文件竞争环境、多租户服务或 Claude Code / Codex 适配器。详见[安全政策](SECURITY.md)与[安全限制](docs/security-limitations.md)。

## 工作区

| 模块 | 职责 |
| --- | --- |
| [`@acmi/contracts`](packages/contracts/README.md) | 任务、会话、绑定、来源和适配器契约 |
| [`@acmi/core`](packages/core/README.md) | 独立于运行时的任务身份、显式绑定、归因与只读历史 |
| [`@acmi/sdk`](packages/sdk/README.md) | 适配器校验与能力协商 |
| [`@acmi/conformance`](packages/conformance/README.md) | 基于测试夹具的适配器符合性检查 |
| [dsh 集成](integrations/dsh/README.md) | dsh 插件、Harness Adapter、Storage Adapter |
| [Observer](apps/observer/README.md) | 只读伴随视图，不是原生 dsh-context 标签页 |

Node 和 pnpm 版本见 [`package.json`](package.json)。运行 `pnpm test` 执行测试。另见[架构](docs/architecture.md)、[路线图](ROADMAP.md)、[Alpha 发布说明](docs/releases/v0.1.0-alpha.1.md)、[贡献指南](CONTRIBUTING.md)与[支持渠道](SUPPORT.md)。

ACMI 原创内容采用 [MIT 许可](LICENSE)。第三方内容、许可例外与复用范围见[第三方声明](THIRD_PARTY_NOTICES.md)与[来源说明](docs/source-provenance.md)。
