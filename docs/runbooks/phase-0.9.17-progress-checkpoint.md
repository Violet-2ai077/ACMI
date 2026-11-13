# Phase 0.9.17 显式任务续接：进度存档

记录日期：2026-11-13（Asia/Shanghai）。本次只保存接续信息，不启动第三批、不修改运行代码。

**停点：实施计划第 2 批完成并通过独立复审；第 3 批尚未开始，CLI 尚不可运行。** 目标仍是通过本机操作者确认，在新进程、新 dsh Session 中显式绑定同一个 Task UUID，并读取已授权历史；不是自动任务路由或真实模型上下文恢复。

## 工作位置与提交

- Worktree：`E:/codex-prj/ACMI/acmi-phase-0.9.17`；分支：`acmi/phase-0.9.17`。
- 主线基点：`2032c96e7714669332279ec93ae51c0cdc0b268a`。存档前 `acmi-main` 在 `main...origin/main`，工作区干净；功能分支未合并、未推送、未发布。
- 存档前最新功能提交：`0f4d675b58e66883903cec6b2827b092d3ed326d`。本记录及计划链接属于其后的纯文档变更。

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

## 从这里接续：第 3 批，先写红测

1. 核对分支和工作区，读[实施计划第 3 批](../superpowers/specs/2026-11-13-explicit-continuation-plan.md#chunk-3-host-confirmation-and-recovery)。预期新增 `continuation-host.ts` 和 `continuation-host.test.mjs`，并连入既有 `runtime-ingestion.ts`。
2. 先证明预览取消、过期、伪造与 Session/任务修订/原生序列漂移都不会写入。确认只消费一次，创建不隐式绑定；启用新 Session 要重新确认同一 UUID。区分 Journal flush 和 Graph cursor 真正追平。
3. 将同一持久登记规则接入 **在线 attach/drain 和离线 reconciliation**；历史回执入口已接入。只对确切已登记的 Session 进行恢复，不扫描孤立 Journal。任何来源无法完成对账时，进入只读受阻状态，不继续绑定或运行样本。
4. 回归 A → B → A 及迟到结果归原调用、checkpoint 后登记前中断和回执已提交但尚未显示。检查关闭顺序：停止摄取与写入、关闭 Store、最后释放两个 lease。验证 Source/Built 后再进入第 4 批。

**仍未实现/验证：**Host 预览确认与恢复控制、摄取入口的持久允许列表执行、可运行 CLI、新功能分支的 Ubuntu CI、端到端跨进程三轮验收。保留 `synthetic: true`；不接入真实 Provider、既有 dsh Home 或用户 Journal，不发布、不自动推进研究阶段。
