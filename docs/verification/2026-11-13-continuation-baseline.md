# 显式续接主线基线复验

日期：2026-11-13（Asia/Shanghai）。
源提交：`2032c96e7714669332279ec93ae51c0cdc0b268a`。
复验目录：`E:/codex-prj/ACMI/acmi-phase-0.9.17`，独立 Git worktree。
本机运行时：Node `v24.16.0`，pnpm `11.28.5`。

## 本轮新鲜证据

| 检查 | 结果 | 边界 |
| --- | --- | --- |
| `pnpm install --offline --frozen-lockfile` | 通过；131 包复用、零下载，pnpm 11.28.5 | 未升级依赖 |
| `pnpm check` | 通过；Source 219/219，39 文件；源码检查、构建及三个演示通过 | 本机 Windows；不是模型效果评测 |
| `ACMI_TEST_BUILT=1 pnpm exec vitest run integrations/dsh/tests` | 通过；108/108，18 文件 | Built dsh 集成回归 |
| `node --test`，传入 `scripts/` 下所有 `*.node-test.mjs` | 通过；88/88，零跳过 | 离线测试，不重新推理 |
| `persistent-dsh.test.mjs` 与 `task-lifecycle.test.mjs` 连续三次 Source 复验 | 每次 33/33，零失败 | 本机重复检查，不替代跨平台故障验收 |
| 当前基点 GitHub Actions | Windows、Ubuntu 两个作业均 success | 远端报告，非本轮本机 Ubuntu 重跑 |

已核对 [CI run 43256498685](https://github.com/Violet-2ai077/ACMI/actions/runs/43256498685) 的 headSha 与基点完全一致；两个 job 均完成 frozen install、audit 和 `pnpm check`。
CI 的默认 `pnpm check` 不等于独立运行 Built dsh 和离线 Node 测试，本表分别记录。

离线测试使用 PowerShell 展开文件列表，避免跨平台 shell glob 差异：

```powershell
$files = @(Get-ChildItem -LiteralPath scripts -Recurse -File -Filter '*.node-test.mjs' | ForEach-Object FullName)
node --test @files
```

Built dsh 在独立 shell 中设置 `$env:ACMI_TEST_BUILT = '1'` 后运行；Source 复验不设置该变量。
三次重复命令为 `pnpm exec vitest run integrations/dsh/tests/persistent-dsh.test.mjs integrations/dsh/tests/task-lifecycle.test.mjs`。

## 能力表

| 分类 | 能力 | 不应推断 |
| --- | --- | --- |
| Alpha 已有受控验证 | 显式 Binding、Scoped 元数据历史、只读 Observer、工具因果归属 | 已认证真实模型上下文恢复或多租户部署 |
| 默认关闭的持久 Host 能力 | SQLite Task lifecycle、独立 operator grant、CAS、幂等回执 | 已有真实 CLI 用户确认入口 |
| 合成原生集成实验 | Graph 摄取、恢复快照、监督器、跨进程对账 | 可以删除 synthetic 条件直接接入日常会话 |
| 未通过模型门槛 | 开放任务识别、双角色归属、未决主题引用 | 可自动 Binding、写 Graph、接受子结果或满足 Join |
| 设计中 | 持久 CLI 显式续接 | 已实现或已经生产可用 |

本轮未调用真实模型、未重跑旧模型批次、未读取或修改既有用户 Journal、未修改已安装 dsh，未 Push 或 Release。
