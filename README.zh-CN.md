# ACMI

![ACMI 字标与长短不一的分支路径](docs/assets/acmi-banner.png)

[English](README.md)

ACMI（Agent Context & Memory Infrastructure）为智能体运行时提供跨会话的工作身份。会话切换任务，或另一个会话继续同一任务时，任务 UUID 保持不变。ACMI 记录显式绑定并提供带来源信息的只读历史。它不负责运行智能体，也不是自动任务识别器或长期记忆引擎。

**Alpha 阶段：**无需启动 dsh、提供凭据或调用模型即可运行确定性合成演示。首个官方集成为 [DeepSeek Harness（dsh）](integrations/dsh/README.md)，目标版本为 `0.2.2-rc.1`；安装和兼容性见 [dsh 快速入门](examples/dsh-quickstart/README.md)。接入其他运行时可从[适配器编写指南](docs/adapter-authoring.md)和[自定义适配器示例](examples/custom-agent-adapter/README.md)开始。

## 快速开始

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm demo
```

演示包含任务切换与恢复、具有因果关联的工具调用和结果、一个未归属事件，以及只读跨会话历史。[入门指南](docs/getting-started.md)说明如何打开 Observer 时间线。

## 架构

![ACMI 数据流：dsh 集成和合成演示提供标准化事件，Core 结合显式任务绑定生成限定范围的历史，供只读 Observer 查看](docs/assets/acmi-architecture.png)

图中展示的是数据流，不是包依赖。Core 不依赖 dsh；遇到证据不足的事件时，它会保留未归属状态，而不是猜测所属任务。组件边界详见[架构指南](docs/architecture.md)。

Phase 0.9.2 仅新增[离线研究与可复现合成原型](docs/experiments/phase-0.9.2-final-report.md)，未改变运行时行为，不能据此启用自动任务路由。

Phase 0.9.3 新增[默认关闭的分层理解和合成 dsh 只读 Shadow](docs/experiments/phase-0.9.3-final-report.md)。不应用提案，未通过自动路由资格。

## Alpha 验证结果

验证基线：[v0.1.0-alpha.1](https://github.com/Violet-2ai077/ACMI/releases/tag/v0.1.0-alpha.1)（`0531dbf`）。

| 检查 | 实测结果 |
| --- | --- |
| [GitHub Actions 运行记录](https://github.com/Violet-2ai077/ACMI/actions/runs/42630365718) | Windows 和 Ubuntu 作业均通过，包含锁定依赖安装、依赖审计和 `pnpm check`。 |
| 独立干净克隆 | Windows x64 和 Ubuntu 24.04（WSL）各自 **通过 28/28 项测试**，覆盖 9 个测试文件；两边均完成工作区构建，并运行合成演示、自定义适配器及 dsh 快速入门。 |
| [dsh 集成测试](integrations/dsh/tests/dsh.test.ts) | 在 dsh `0.2.2-rc.1` 的专用 v4 日志夹具中通过 [Level 4 符合性测试](packages/conformance/README.md)：独立重开适配器后，仍能查询两个会话的任务历史。对应的纯文本和 Zstandard 日志在读取前后逐字节一致。 |
| [Observer HTTP 测试](examples/dsh-quickstart/tests/observer-http.test.mjs) | 本地合成 Observer 正常提供只读时间线，并拒绝写请求。 |

复现方法：使用 [`package.json`](package.json) 指定的 Node 和 pnpm 版本，运行 `pnpm install --frozen-lockfile`，再运行 `pnpm check`。以上是受控夹具和集成测试的结果，不代表已验证真实模型流量，也不构成生产安全保证。

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

另见[路线图](ROADMAP.md)、[Alpha 发布说明](docs/releases/v0.1.0-alpha.1.md)、[贡献指南](CONTRIBUTING.md)与[支持渠道](SUPPORT.md)。

ACMI 原创内容采用 [MIT 许可](LICENSE)。第三方内容、许可例外与复用范围见[第三方声明](THIRD_PARTY_NOTICES.md)与[来源说明](docs/source-provenance.md)。
