# R-D / R-B 离线实现与验收报告

日期：2026-11-15。结论：**OFFLINE_REVISION_READY_FOR_OWNER_REVIEW**。

Owner 已批准协议提案并单独授权离线实现/验收。本次没有调用模型、重算历史
研究分数、修改正式 ACMI、解除旧批次 halted 状态或冻结新的开发研究版本。
这不是研究 GO；重新冻结与新批次运行仍须另行审批。

## 1. 代码差异与版本选择

新增模块：

| 模块 | 实现 |
| --- | --- |
| `gate2/inline-profile.mjs` | `B-inline-v1-ws1`，共享 streaming/final scanner，有界帧边界空白与原始字节保留 |
| `gate2/deadline-transport.mjs` | 固定 180000 ms 截止、5000 ms 本地清理、交付时归档、generation/cleanup 分区与错误事实 |
| `gate2/revision-policy.mjs` | 显式策略配置校验、D2 截尾终态审计；账本重放时再次核验 |

接入模块：`gate2/run-ledger.mjs`、`gate2/send-boundary.mjs`、
`gate2/freeze-development.mjs`、`execution/live.mjs`、`execution/report.mjs`。
新增四个测试文件，名称包含 `inline-revision`、`deadline-revision`、
`censored-ledger`、`revision-boundary`。

冻结 runtime 中可显式配置以下结构；这仅为离线接口说明，不是运行授权：

```json
{
  "protocol_revision": {
    "version": "gate2-protocol-revision-v1",
    "diagnostic_policy": "D-180-LOCAL-v1",
    "inline_profile": "B-inline-v1-ws1",
    "owner_authorization": "owner-2026-11-15-offline-revision"
  }
}
```

两个策略可各自设为 null，从而单独选择另一项；全部关闭时省略整个配置。
未知字段/策略拒绝。未配置 revision 时保留旧传输、旧 B 语法及旧账本语义。
**当前 guarded live 入口明确拒绝新 revision**，且禁止 live 注入测试时钟。

### R-D

- `diagnostic_censored` 是失败/截尾结算，不是成功。D1/A/B/C0 和非合格 D2
  错误仍全局停止，未结算的预留仍禁止恢复后自动发送。
- HTTP/SSE/UTF-8/读错误/证据错误分别保留，timeout 不覆盖先前或并发的普通错误。
- owned read continuation 在 deadline race 丢弃返回值前归档已交付字节。
  清理期片段保留但不生成成功答案；不能用取消后的 EOF 宣称远端响应完整。
- 原生 AbortError 只有同时确认 reader.closed、cancel 和 pending read 的收敛
  才算本地关闭；其他错误或清理超过 5000 ms 均不获得继续资格。
- v4 结算前验证 D1 答案绑定、请求、wire 顺序/摘要、派生 content/reasoning、
  terminal、错误集合与清理条件。持久化结算后才返回下一坐标资格；重放复核同一规则。
- 原始 v1/v2/v3 账本不迁移。两个 OS 进程竞争同一结算只能有一个成功。

### R-B

- 首帧前、完整帧间、最终 commit 后允许 SP/HT/LF/CR，每段最多 1024 字节。
  BOM、Unicode 替代空白、正文前后解释、围栏、重复 key、额外 commit 等仍拒绝。
- 正文和证据中的空白、转义与 Unicode 原样保留；没有全局 trim/替换或 JSON 修复。
- AST 桥接复用 Gate 1 wire validator 和 raw reader，原始样本仍是 B。自查发现
  两个既有校验入口对 prototype 同名未知字段存在差异，因此新桥接先使用既有
  wire validator 的封闭字段检查，再用 raw reader；没有修改 Gate 1 或旧成绩。
- 合成反例证明：空白接受不会修复缺失 memory、过时验收状态或假完成的评分。
  这不是用真实旧 B 输出调语法，也没有对六份历史失败输出重新解析计分。

## 2. 报告与冻结工具准备

- 新报告版本 `gate2-live-import-v2` 明示策略，D 按 C1/C2/C3 与难度分组。
- D1/D2 分列 planned、reserved、dispatched、completed、deadline-censored、
  other failures、unattempted、unsettled，以及分母是否完整。
- 截尾保留在所有已确认 dispatched 的完成率/marker 可用率分母内；语义分数为 null。
- request 后缺少 terminal 的崩溃列为 dispatch-unknown；不当作免费或确定未调用，
  受影响的率为 null。成功耗时与截尾耗时分列，未知 usage/cost 不填零。
- 计划耗尽与所有生成成功分开；D 仍不进入 A/B GO。
- 仅对未来新输出生成 legacy strict-v1 符合性辅助标志，不择优评分。
- 冻结工具已增加 execution/report 源码、revision 测试向量和提案批准记录绑定。
  本轮只生成 `purpose: synthetic-test` 测试包，没有新的 development 研究冻结。

## 3. 验收结果

| 检查 | 实测结果 |
| --- | --- |
| 全部研究离线测试 | **171 passed，0 failed，0 skipped**；约 25.66 秒 |
| 新增修订测试 | 26 个：B 6、D transport 11、ledger 6、guard/report 3 |
| `.mjs` / `.cjs` 语法检查 | **66 个通过** |
| 保护摘要 | **195 个文件逐一一致**，涵盖 Gate 1 与 r1/r2/r3 既有证据 |
| 公有语料/oracle/plan/四份 prompt | 7 项摘要与未启用 revision 的材料完全一致 |
| 合成端到端前缀 | 按原顺序 62 个槽位，6 个 D2 截尾后继续并恢复；15 个 B 均保持 B provenance |
| B CLOSED-LOOP | 前缀包括完整 8 轮，后续输入保留带边界空白的原始回答，不替换为规范化文本 |
| 崩溃报告 | 随后再完成一个 D1，并留下第 64 个预留 D2 的 request-only 中断；报告为 unknown |
| 计划 | 仍为 576 个位置、36 对 D；未跳过、重排、追加或返还槽位 |
| 工作树 / main | `git diff --check` 通过；正式 main 干净，HEAD 未变 |
| 本轮真实模型调用 / 历史研究重评分 | **0 / 0** |

合成 B 的 schema 通过以及合成 D 的截尾是测试预期，不是模型准确率/完成率。
没有执行 576 个完整真实或合成发送；576 项计划由冻结材料摘要和计划回归验证，
新边界端到端测试覆盖上述前缀与中断，不能夸大为全量长运行验收。

## 4. 证据位置

验收归档：
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/revision-offline-20261115-051046/`

- `tests-initial.log`：早期全量 161/161。
- `tests-final.log`、`tests-acceptance.log`：中间 167/167、170/170 验证，保留未覆盖。
- `tests-acceptance-final.log`：最终 171/171。
- `source-manifest-final.json`：最终 66 个脚本源码摘要。
- `protected-before.json`、`protected-verification.json`：195 项前后摘要与零变更检查。
- `change-analysis.json`、`quality-scan.json`、`security-scan.json`：辅助工具原始结果。

最终合成集成证据：
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/revision-boundary-HP1Gxh/`

包括 synthetic packages、v4 append-only journal、`synthetic-prefix-report.json`、
`synthetic-interrupted-report.json`。所有迭代的隔离测试目录均保留；没有重写历史 live 目录。

主工作树仍为：`E:/codex-prj/ACMI/acmi`，HEAD：
`9db1ee7da8209363a1fd76f3bebc83f75dfe9c9d`。

## 5. 验证限制与下一关

- 本轮只有作者自查，不是独立评审；没有启动评审 Agent。
- 通用质量/安全扫描器不覆盖 `.mjs`：质量扫描 0 文件，安全扫描 1 个非源码文件。
  不能将其 passed 字段当成源码安全审计通过。实际依据是针对性测试、语法检查与自查。
- 截止/清理用假时钟和本地原生 ReadableStream 验证；没有验证 DSH 网络条件、
  服务端取消或账单行为。工程时限不是统计风险上界，也不是已验证的服务 SLA。
- 本地锁、摘要与 manifest 不等于第三方证明；未测试断电硬件、文件系统持久化
  故障的全部形式。未结算预留、损坏 journal、遗留锁一律 fail closed。
- 四份 prompt、oracle、计划与研究问题不变；旧分数/失败仍有效。
- 下一步仅供 Owner 审议：是否批准新研究冻结及有限开发批次。当前没有自动执行，
  没有把离线验收结果解释为模型可行性结论或扩大样本授权。
