# R-E/R-A 性能验收器离线准备结果 - Task 2

日期：2026-11-15。Owner 仅批准 Task 1/2 的设计、工具与非计时正确性验证。

## 1. 决策

- 容量：`INFEASIBLE` 于现行允许域，亦即 **R-C 未闭合**，见容量设计。
- 性能准备：`BLOCKED`，不是 `PERFORMANCE_READY_FOR_OWNER_REVIEW`。
- 性能系列：未执行。没有性能改善或通过结论，也没有重新评研究分数。
- model calls = 0；development refreeze = 0；正式 ACMI 接口与 main 未改。
- 原 v5 五组性能失败、r4 停止状态和所有历史证据保持原样。

Task 1/2 按方案允许的“列明阻塞”出口交付；不能将工具测试成功表述为测量条件齐备。

## 2. 已实现及验证边界

| 工具 | 已实现 | 不声称已实现 |
| --- | --- | --- |
| capacity-contract.mjs | 有条件预算、反例域检查、unknown/上界不足/具体不可行区分 | Fetch/V8 保证或 live 容量认证 |
| capacity-workload-inventory.mjs | 只读历史链、raw/read 对应、逐记录大小与固定 journal 估算 | 重评分、通用 Q 或 RSS 测量 |
| prepare-transaction-performance.mjs | 原 v4 pin、单候选源摘要、三层五对交替顺序、资源前提、确定性评分 | 基线兼容性证明自动产生 |
| measure-transaction-performance.mjs | fake-clock 计时边界、连续 read 分组、操作错误透传 | 真实计时、进程 supervisor 或批准后可自动运行 |
| prepare-capacity-review.mjs | 只读盘点、复制到新目录的原 v4 小型等价检查、候选清单和资源建议 | 完整 P-L/P-H/P-G 对照认证 |

真实 dispatch API/CLI 均硬拒绝；即使传入 approved 参数也不能运行。未来 Task 3 还需要
审定并实现真实测量桥接和外部 supervisor，不能认为本次已交付可直接启动的性能 runner。
manifest 的声明值/摘要是证据定位手段，不是防恶意调用者的授权认证。

## 3. 原门槛及计时边界

原 v4 reconstructed 账本 SHA-256：
`71bc059f4a7c33f14b8f07383391b225b09df018a6e446b6b31ab6e167c5dcdb`。
从原测量源码复制到新的 baseline-source，未覆盖旧源码或用 v5 取代分母。
小型合成 reserve/capture/settle/reopen 检查已对齐完整 attempts 与选择性物化结果。
这不覆盖全部 guarded/D/恢复/请求编译屏障；完整三层等价性仍标为 unproven。

评分器保持 append、flush-request 各减少 >=30%，capture 五对中位比 <=0.80，
每对 delivered-read p99、完整 audit、peak RSS 比 <=1.25；正确性/完整性/资源失败否决。
审计计时是 `audit_ms + materialize_ms`，后者包含选择性物化的额外完整扫描。
capture、audit、materialize、persist 为互斥区间；read 耗时属于 capture 子集，不能重复
相加；wall 必须覆盖全部互斥区间。结果耐久保存不能遗漏。真实请求编译和各屏障的
归属操作表还待完整固定，不将 fake-clock 算式当作实际完整成本证明。

本实现准备含初始 capture 的三层输入。若未来 P-H 无 capture，必须另审明确的 N/A
语义，当前不接受伪造零分母或用另一层代替。缺少配对、改候选、换基线、顺序错误、
结果 hash 不等、read 分母不等、遗漏字段、非有限数、非整数计数、混合 synthetic 来源
均不得通过；不能以平均审计比掩盖某一对失败。

## 4. 验证结果及保留失败

新增定向测试 **18/18 通过**，覆盖容量未知项/反例/576 联合预算、逐记录 Base64、
准备阻塞、原门槛、计时遗漏、分母、fake clock、CLI 禁止执行、库存完整性及损坏拒绝。
整套研究回归 **226/226 通过**，90 个 .mjs 模块语法检查通过，`pnpm lint` 检查 787
个文件通过。完整记录见本轮 `tests-full-final.log` / `final-verification.json`。
本次未改共享产品代码，没有重复运行仓库产品构建及 Vitest；其既有成绩不冒充本轮成绩。
测试运行时的框架耗时不是性能验收数据；未使用真实时钟对候选与基线作性能比较。

所有 RED/中间失败日志保留。自查修正包括：保守上界不能单独判不可行；域外反例拒绝；
宿主机余量未证明时阻塞；旧 preparation 的 P-G `reads=62` 只是把步骤数误作 read 数，
已在新清单改成 **null + read_denominator_unproved**。旧 `review/` 不覆盖、不用于运行。
新的 `review-final/` 才是本次交付，但仍然 BLOCKED。以上均未改研究真值或历史分数。

## 5. 具体资源预算建议，尚非可行性证明

仅供未来固定系列审批，不写入 live，不改变现行 deadline、channel、frame 或停止策略。

| 资源 | 建议额度 | 依据与限制 |
| --- | ---: | --- |
| 并发 | 1 个测量子进程 | 独占串行，不能与构建/回归并行 |
| 固定规模 | 30 个子进程 | 3 层 x 5 对 x 2 臂，不补跑 |
| 磁盘 | 16 GiB | 4 GiB P-L/P-H + 4 GiB P-G + 2 GiB 源码/输入/报告 + 2 GiB 失败保留 + 4 GiB 余量 |
| 每子进程 peak RSS | 8 GiB | 行政保护提案，未证明现实现可在此内完成 |
| 启动时宿主可用内存 | 至少 12 GiB | 给父进程/OS 留 4 GiB；不是仅看总 RAM |
| 每 P-L 子进程 | 10 分钟 | 提案，未做试跑估时 |
| 每 P-H 子进程 | 60 分钟 | 提案，原 v4 全历史成本未知 |
| 每 P-G 子进程 | 30 分钟 | 提案，完整 guarded 操作表尚未证明 |
| 全系列 | 18 小时 | 子进程限额合计 16 小时 40 分；另留 1 小时 20 分管理余量 |

固定 P-L/P-H 的 20 份 journal 保守总量为 **892,450,040 B，约 0.831 GiB**，
小于其 4 GiB 分配。这个数只覆盖固定输入 journal，不证明 P-G、RSS、审计耗时及全部
报告可行。不能用“预留了 16 GiB”替代完整闭合预算，也不从旧耗时盲目外推。
实际宿主 free memory/free disk 采样随清单保存；低于提议额度会增加 blocker，不自动
清理其他进程。未来监督器及资源触发的记录/停止语义须另审；本次没有运行或安装它。

本次最终准备采样：free memory **10,226,683,904 B，约 9.52 GiB**，小于 12 GiB；
free disk **328,646,324,224 B**。主机内存余量已明确列为 blocker。另只读核对 E: 为 NTFS；
清单仍提醒真实执行前重新核对卷类型和余量，不把本次瞬时采样当作未来资源保证。

## 6. 审核前剩余前置条件

1. 固定 P-L/P-H/P-G 全部操作表、read 边界、完整输出 hash 和原 v4 适配路径；特别是
   P-G 的 62 步不等于 62 read，当前分母未知，不能开始计时后补定义。
2. 在非计时轨道证明全部对应结果等价，包括重开、D1/D2、额外完整审计、物化、请求
   编译和耐久报告；原 v4 不兼容时如实提交矩阵修订，不删操作或偷偷换基线。
3. 证明固定负载资源可行性，补 P-G 大小、峰值并存对象、绝对审计/时间依据；核对实际
   文件系统、空闲空间和内存。原 v4 可能比建议时间更慢，此处不承诺 18 小时能完成。
4. 审核真实测量桥接和 supervisor，钉住其来源及完整计数；先补非计时故障验证。
5. 全部条件齐备后提交新的性能执行申请。只批准资源数字而未补证明，仍不能执行。

建议 Owner 本次确认容量未闭合及预算方向，下一步优先审批上述剩余的非计时准备；
**暂不请求直接运行 30 子进程，也不请求重新冻结或模型批次。**

## 7. 证据定位

新增证据根（旧目录不覆盖）：
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-capacity-performance-prep-20261115/`。

- `review-final/workload-inventory.json`、`baseline-smoke.json`：固定输入及原 v4 小型等价结果。
- `review-final/capacity-assessment.json`：反例、缺失前提及有条件计算。
- `review-final/performance-manifest.json`、`resource-budget-proposal.json`：源码/负载、阻塞和预算。
- `tests-*.log`、各 `*-red.log`：正常与失败验证过程。
- `final-verification.json`、`source-final/`：最终验证、历史摘要核对和源码快照；不是 development freeze。

本次只有自查与确定性验证，无独立评审代理。原实施方案保留为审批时点记录，
本文件及 STATUS.md 描述当前执行状态。

证据保全核对：456 个保护历史文件、7 个冻结研究输入、4 个 R-E/R-A/R-C 结果文件、
123 个原源码快照文件、17 个原同步/失败日志及 132 个本轮未改的已有研究文件，
均与原摘要一致。main 干净且 HEAD 仍为
`eb5d2c711b461da06245737b225deb14a3ba33c3`。本轮未 commit、merge 或 push。
