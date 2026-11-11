# stock dsh 0.2.2-rc.1 接口审计

以锁定的 npm fixture 声明和 stock 原生循环为验收主体。工程参考仓库只读，`4a151189b8df6cdc558f355e889b6182edab56a1`；机器 CLI 是 0.2.1-rc.2，未调用。

| 路径 | 同次输出与原生表现 | 隔离及限制 |
| --- | --- | --- |
| A：直接 JSON Schema / grammar | stock `GenerateOptions` 没有通用 schema/grammar；直接作为 text 返回可形成原生回答，但内容不是纯回答 | 未拆分 JSON 会进 UI、Journal 与可派生的 compact 历史；未证明通用 provider 工具和 schema 可混用 |
| B：正文 + metadata block | 普通 text chunks 有原生 streaming | 原样发送会泄漏并入 Journal；分隔符、截断和部分 chunk 不能安全假定；未实现此路径 |
| C：原生 tool-call 携带 metadata | 原生块仅 ID、name、JSON arguments；arguments 是实际工具数据 | 会写入 native assistant/tool 记录，额外字段可能被校验拒绝；伪装成 metadata tool 会触发工具生命周期，不是无副作用的私有字段 |
| D：自定义 Adapter，buffered JSON 后拆分 | 单个 HTTP completion；发原生 text/tool/usage/finish；实际 Call ID 对账；离线终止/非终止工具均复现 | 不改 dsh Core；没有 Token streaming；只有合成 lookup 被验证；不完整或无效结果 fail closed，不发布部分回答 |
| E：stock `finish.replayState` | stock 允许 provider 私有 replay metadata，和 stream 同生命周期 | Agent Loop 把它装入 Assistant source 后持久化。不是 Journal 外 sidecar；compact/回放不能保证剥离。本阶段不使用 |

本地源码证据：`packages/llm/llm/src/types.ts:112,474,496,564`；`packages/core/agent-loop/src/agent.ts:513-597`；`packages/core/tools/src/contracts.ts:245-260`；安装 fixture 的 `@deepseek-ai/dsh-session/lib/types/types.d.ts:351-397`。Native error 也会写 `assistant/attempt` 的 stream，故不能先发未过滤增量。独立的工具结果 meta 也是 Journal 元数据，不是 Assistant 私有通道。没有在实测模型批次触发 compact；这里只推断数据面不含 sidecar，不声称 compact 行为已通过实测。
