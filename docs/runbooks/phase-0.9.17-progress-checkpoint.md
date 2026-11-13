# Phase 0.9.17 显式任务续接：进度存档

记录日期：2026-11-13（Asia/Shanghai）。用户已要求继续实施，并将当前 `acmi` 目录恢复为主线入口。

**当前：四批代码均已实现；Windows 与 Ubuntu 24.04 WSL 干净克隆验证及独立代码终审均已通过。** 目标仍是通过本机操作者确认，在新进程、新 dsh Session 中显式绑定同一个 Task UUID，并读取已授权历史；不是自动任务路由或真实模型上下文恢复。用户已明确批准合并和推送；不创建 Release，不改变生产资格结论。

## 本轮接续更新

- 2026-11-14 状态校正：0.9.17 已快进合入并推送 `main`，提交 `6efc0c4`。合并后主线 268 项测试及三个示例通过，GitHub CI `43444597133` 的 Windows / Ubuntu 作业均成功。下文的批次交接状态属于历史记录，不是尚待执行的集成任务。

- 主线固定为 `E:/codex-prj/ACMI/acmi` 的 `main`，集成前基点为 `2032c96`；原 `acmi-main` 已通过 Git worktree 移动为 `acmi-phase-0.8.2`，保存原历史分支。没有删除历史分支。目录规则见[工作区组织](../workspace-organization.md)。
- `2602b99`：工作区组织文档。主线调整后离线依赖安装、`pnpm check` 219/219 和三个 demo 通过。
- `b4dc956`：串行 Host、不可伪造且一次消费的确认预览、持久登记 gate、注册来源恢复、退出租约保留。Source 250/250、Built dsh 139/139 通过。
- `88134d7`：独立复审指出 inspect 等待后读取正文前存在授权窗口；新增正式红绿回归并修复 flush/stat/inspect/read 各异步边界。Host 与持久 dsh 定向 Source/Built 各 41/41，复审通过，无剩余阻断项。
- `8dd63ca`：可运行的[任务控制台](../../examples/task-console/README.md)，使用已有 Host API，不创建第二套 Binding 账本；原生回合固定为 provider-free synthetic 样本。
- `311709b`：合并终审发现分片 stdin 误判 EOF 和登记 checkpoint 异步重授权缺口；正式回归先红后绿，修复后同一评审者定向复审确认两项均关闭，剩余阻断代码问题为零。
- 对 `311709b` 的独立 Windows 克隆执行 frozen install、`pnpm check` 43 文件/268 项与三个 demo、Built dsh 21 文件/146 项、离线 Node 88 项，均通过。统计不包含本地临时评审测试，各套件覆盖有重叠。
- 同一干净克隆的 CLI 验收文件连续三轮均为 11/11（每轮 8 个子进程用例和 3 个输入边界用例）。完整命令、证据和平台限制见[本轮验证报告](../verification/2026-11-13-explicit-continuation.md)。
- Ubuntu 后续诊断确认 pnpm 实际访问不可达代理端点。仅在验证进程中设置 registry 的 NO_PROXY 后，frozen install 及 182 项依赖策略检查通过；同一功能代码 Source 268/268、Built dsh 146/146、离线 Node 88/88、三轮 CLI 每轮 11/11 全部通过。未修改系统代理、锁文件或依赖版本。

以下第 1/2 批记录保留作为历史背景；后续操作以本节及文末的待办为准。

## 工作位置与提交

- Worktree：`E:/codex-prj/ACMI/acmi-phase-0.9.17`；分支：`acmi/phase-0.9.17`。
- 主线基点：`2032c96e7714669332279ec93ae51c0cdc0b268a`。存档前 `acmi-main` 在 `main...origin/main`，工作区干净；功能分支未合并、未推送、未发布。
- 第 2 批原始交接时的最新功能提交：`0f4d675b58e66883903cec6b2827b092d3ed326d`；当前功能修复提交为 `311709b`。

| 提交 | 内容 |
| --- | --- |
| `4a37094` | 设计、阶段边界与主线基线复验。用户后来批准开始实施。 |
| `ca8f7d8` | 第 1 批：Journal/Graph 专用根配对、双根写入互斥和 stock dsh 兼容测试。 |
| `0f4d675` | 第 2 批：持久 Session 登记、任务分页、旧回执独立只读查询和缺失记录检查。 |

参考：[已批准设计](../superpowers/specs/2026-11-13-explicit-continuation-design.md) · [逐批实施计划](../superpowers/specs/2026-11-13-explicit-continuation-plan.md) · [主线复验记录](../verification/2026-11-13-continuation-baseline.md)。

## 已交付的接口与约束

### 第 1 批：初始化与写入所有权

- `provisionContinuationRoots(config)` 只初始化已存在、空且互不重叠的 canonical 根。Workspace、Journal 和 Graph 不得与已配置 dsh Home 重叠。既有原生根标记保留原格式。
- 两根各存不可变 `continuation-pair.json`，绑定 Workspace、目录身份与压缩配置；各有 `continuation-owner.sqlite`。缺失一侧、配置不符、未知文件或中断初始化均拒绝，不自动修复、清空或回退到独立模式。
- `acquireContinuationRoots(config)` 验证标记和配对，按稳定顺序获取两个 SQLite 排他事务，返回 `workspaceId` 和 `close()`。已持有一个锁而另一根冲突时释放本次持有的连接；不删除锁文件，不按 PID 或时间戳抢占。组合层必须在启动写入前取得 lease，停写、关 Store 后才能释放。
- 常规独立 Journal 读取仍可用，未知顶层目录项继续拒绝。配对模式仅接纳已验证的两个附属文件；stock dsh 写入、flush、精确 Session 查看与读取均有回归。
- 实现：`continuation-layout.ts`、`continuation-lock.ts`、`storage-isolation.ts`、`graph-store-db.ts`；回归：`continuation-roots.test.mjs`（均位于 `integrations/dsh`）。

### 第 2 批：持久目录、回执与读授权

- 开启 `GraphStoreOptions.continuation` 后，配置的 Graph Root 必须等于实际 DB 根，并校验配对；不启用该选项的旧入口保持原行为。
- `registerContinuationSession(writer, ref, signal)` 从当前 Host 的 live resolver 取得身份和下一原生序列，再对照配置 Journal 的确切 Session/incarnation 与已持久化事件数。异步核验之后仍要在事务中重验 writer 与 live 序列；撤权、漂移、未 checkpoint 或新 incarnation 不得登记。相同登记保留第一次回执和 `checkpointNext`。
- `continuationSessions(reader)` 返回当前 Workspace 的精确 Session 登记，最多 256 条。登记详情不是新授权。Continuation 模式下，现有 Host lifecycle 也拒绝未登记的 live Session。
- `continuationTasks(reader, limit, cursor)` 从 Graph 推导任务目录，最多 64 个任务，按 UUID 分页；不合并同名任务。每次读取重验授权；游标绑定 Workspace、UUID 位置和目录修订，数据变更使旧游标失效。
- `continuationReceipts(reader, ref, after, limit)` 使用当前读授权和精确登记读取旧回执；无需旧 Session 在线、无需写授权，不重放历史命令。核验回执哈希、序号和状态链；创建回执与 Graph 首事件双向对账，登记与已有持久引用交叉检查。仍有证据的记录缺失应报错，不能被当成空目录或历史结束；这不保证识别所有证据一起回滚。
- 实现：`continuation-catalog.ts`、`graph-store.ts`、`task-lifecycle.ts`、`index.ts`；回归：`continuation-catalog.test.mjs`、`task-lifecycle.test.mjs`（均位于 `integrations/dsh`）。

## 已有验证证据

以下是相应批次实施时实际执行的结果，不是本次写存档时重跑的结果。

| 基线 / 批次 | 本机 Windows Source | 本机 Windows Built dsh | 补充证据 |
| --- | --- | --- | --- |
| 主线 `2032c96` | 219/219 | 108/108 | 离线 Node 88/88；持久化关键套件 33/33 连续三轮；同基点远端 Windows/Ubuntu CI 均通过。 |
| 第 1 批 `ca8f7d8` | 225/225 | 114/114 | 6 个新增用例；两个根分别做跨进程争用与持锁进程退出验证；审阅后补 Workspace/dsh Home 边界回归。 |
| 第 2 批 `0f4d675` | 233/233 | 122/122 | 8 个新增用例；目录与 lifecycle 定向 19/19；任务、登记及创建回执的缺失问题已回归并通过独立复审。 |

两批 `pnpm check` 同时通过源码检查、构建和三个现有 demo。没有把主线远端 CI 当作功能分支跨平台验收，也没有在功能分支重复推理或评测真实模型。

在 feature worktree 复验，推荐 PowerShell：

```powershell
Set-Location 'E:/codex-prj/ACMI/acmi-phase-0.9.17'
pnpm check
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$env:ACMI_TEST_BUILT = '1'
try { pnpm exec vitest run integrations/dsh/tests }
finally { Remove-Item Env:ACMI_TEST_BUILT -ErrorAction SilentlyContinue }
```

## 从这里接续：授权集成与后续范围

1. 保持 `acmi` 为 `main`；0.9.17 worktree 已完成使命，保留追溯，不再作为新功能开发入口。
2. 本机双平台、合并后主线复验和本次远端 CI 均已完成；各项证据保持分别记录。
3. 合并、普通推送已按用户授权完成，未发布、未删除历史分支或 worktree。
4. 用户于 2026-11-14 批准自主推进后续三个阶段，见[新实施计划](../superpowers/plans/2026-11-14-model-continuation.md)。新模型请求只使用隔离测试数据，不关闭 synthetic guard，不读取既有用户 Journal。

**范围外或需单独记录：**本次推送触发的远端 CI、真实模型上下文恢复、生产多写者和存储迁移。保留 `synthetic: true`；不接入真实 Provider、既有 dsh Home 或用户 Journal，不发布、不自动推进研究阶段。
