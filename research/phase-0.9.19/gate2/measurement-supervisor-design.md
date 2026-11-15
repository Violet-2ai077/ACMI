# 测量桥接与 supervisor 离线设计细化

日期：2026-11-15。仅为本轮离线准备；不授权真实计时系列或增加 live 停止条件。

## 1. 三层输入与完整操作定义

- P-L：原最后请求的全部记录，5,667 次非空交付。reserve、所有控制 capture、每个 read 的
  metadata/raw 及派生 capture、settle、完整 snapshot、reopen、完整 snapshot、结果耐久保存。
  原 legacy audit 成本包含 settle；不能把它移出 audit 以制造改善。
- P-H：原 35 个尝试、99,985 个事件、35,308 次非空交付。初始归档包含在操作表内，
  每次 settle 后完整审计并选择当前 attempt，最后 reopen/full snapshot/persist。
  原 v4 从刚获得的完整 snapshot 选择；v6 的选择性物化额外扫描保留，不给原 v4 人为加扫。
- P-G：既有 binary-context-synthetic 的 62 步，step 21 后重开；沿用固定回答、reasoning、
  一次 SSE 交付和原调度前缀。逐步 next、显式 prepare/compile、execute 内第二次
  prepare/compile、credential、pre_send、请求发送前验证、传输、settle/final audit；
  最后完整 snapshot 和结果 fsync。12 个 D 步骤、57 个带历史的步骤均保留。

P-G 的实际分母为 62 个非空 read，另有 62 个 EOF；总 read() 调用 124。
记录为空的 EOF 不进入与原 P-L 一致的 delivered-read p99。每个非空 read 下的 raw-first
和 derived capture 必须合并到同一个 read 耗时，不能按 transaction 计算 p99。

机器可读操作表、每条 read 大小/摘要、调用顺序和计数保存在新证据目录。
P-L/P-H 采用 `writer-verification/` 的最终表；第一轮 reader-only 表和结果保留。

## 2. 原 v4 与 guarded 适配边界

原 v4 账本及其历史依赖从既有保存目录加载，源码 SHA-256 不变：
`71bc059f4a7c33f14b8f07383391b225b09df018a6e446b6b31ab6e167c5dcdb`。

P-G 不是声称未适配的原 v4 原生支持当前 binary guarded 接口。新建派生 comparator：

1. 当前 send-boundary 的账本导入指向显式 adapter；其他导入指向原当前模块。
2. baseline adapter 去掉存储 profile，将 batch 原样逐条送进原 v4 capture；保留所有
   同步耐久确认和错误传播。candidate adapter 调用原 v6 batch API。
3. 两臂 fixture 的 pre_send UTC 固定为同一字符串，避免无意义日期差异；原文件未改。
4. 原 verifyFreezeBundle、verifyFrozenSources 及发送前校验仍执行；使用既有 synthetic
   freeze，不生成新包。派生模块/适配器/factory 单独记录 composite 摘要。

这个 composite 是新增离线比较实现，不是原冻结运行身份；原源文件检查不能独自
认证导入替换，必须同时审查 composite 的显式变换和摘要。未来计时不得省掉 adapter
或其调用记录开销。不得用该桥接器去冒充 live runtime，或接入真实凭据/网络。
本次 global fetch 硬拒绝联网，只注入固定离线 reader。

## 3. 计时与计数合同

`runSyntheticBridge` 仅接受 synthetic clock 和与操作表绑定的摘要。每条操作必须返回
正确 operation_id、完成状态、输出摘要和完整扫描次数/字节；persist 还必须耐久确认。
少操作、换顺序、漏物化、漏 scan 或丢 fsync 确认都不能成为快样本。

- 外层 wall 是 inclusive；prepare/compile、capture、audit、materialize、persist 等阶段
  为互斥区间，不将内部 ledger 时间重复相加。
- read_ms 是 capture 子集；原始 source elapsedMs 不覆盖为回放时间。
- candidate materialize 的完整扫描计入成本；baseline 直接从完整 snapshot 选择时
  required_scans=0，不能为了适配工具给 baseline 多加一次完整扫描。
- 所有外层操作覆盖 next、prepare、credential、reserve、所有完整审计、恢复和输出保存；
  diagnostics 是操作计数依据，不以其局部时间代替总 wall。
- future bridge 应原样输出 legacy 可比指标与新增全路径指标；两者不能互换门槛。
- 计数门槛仍为 append 与 flush-request 各减少至少 30%；不能只统计最有利的 capture
  子集或把 native write/flush 与 API flush-request 混用。

真实 clock、子进程启动和授权消费仍不在本次实现中。原性能入口继续硬拒绝。
本次桥接与监督测试中的“通过”是工具合同通过，不是性能门槛通过。

## 4. Supervisor 状态与故障语义

已实现纯事件模拟：READY -> RUNNING -> STOPPING -> SEALED；未完整退出、结果未耐久、
缺测或资源故障都不能记为成功。SEALED 后不允许再 start，无 retry、补样、覆盖或删除。
数值性能门槛失败与证据/资源失败分别处理：前者不是丢掉慢样本的理由，后者阻止安全执行。

拟议真实实现（待审，不安装）：

- 父进程与测量子进程隔离，串行启动一个受控子进程；只管理本次创建的进程树。
- 固定输入、composite、候选、原 v4、工作目录和清单摘要在 spawn 前及结果接受前核对。
- 先保存 spawn intent，再保存 PID/所有权标识，保留 stdout/stderr 和子进程输出；无重跑。
- 父进程监控绝对 deadline、磁盘使用和进程内存，不能依赖被同步 fs 阻塞的子进程 timer。
- 超预算/证据失败后先记录原因，再请求停止；确认 owned tree 退出并同步日志后才封存。
  拟给离线 cleanup **30 秒**，超时记 CLEANUP_UNCONFIRMED；该值不影响 live 的 5 秒 cleanup。
- Windows 需审定 Job Object/进程树归属与退出确认。commit/private bytes 限制不等于 RSS，
  不能把 Job Object 内存值冒称 8 GiB RSS 的硬保证。父进程采样也不能证明采样间无峰值。
- 磁盘轮询可能在两次观察间超额；预留空间不是 OS quota。必须明确剩余失败日志空间
  和写入故障处理，不能删除原始 raw、截断输出或放宽阈值。

当前仅证明模拟状态机及实际派生文件损坏的拒绝；**没有证明 native Job Object、OS
磁盘耗尽、真实进程树杀停、RSS 采样精度或 30 秒内一定清理完成**。这些缺项继续阻塞。

## 5. 资源证明边界与自查修正

第一轮把所有 append 前缀之和作为上界；它可描述极端 cache miss，但不是本固定负载
的实际成本。源码和完整 writer 调用计数显示原 v4 capture 同样命中缓存。
最终操作表另给 reserve/settle 的 nominal 扫描预算；保留旧上界，不用它声称 TB 级必需读写。

固定 journal/操作表/结果 schema 的磁盘预算可以算术核对；V8 对象布局、GC、native
分配、父子并存、异常日志增长及绝对耗时不能仅凭文件体积证明。8 GiB RSS、12 GiB
宿主余量、18 小时系列仍是行政建议，不得置 budget_proven=true。

即使磁盘预算充分，也须分开报告计数门槛、时间/RSS 未测、native supervisor 未验证。
不从任何一项正确性通过推导 live 资格；研究问题和已冻结材料不因此改变。
