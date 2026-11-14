# ACMI Phase 0.9.19 离线研究 Harness

当前全阶段状态、设计与证据入口见 [STATUS.md](STATUS.md)。下文是 Gate 1 的
历史范围说明，不代表后续 Gate 2 从未运行真实模型。当前已停止全部模型批次；
R-E/R-A 离线正确性检查通过，R-C 容量不闭合，性能验收待另行批准。

Gate 1 验证实验程序本身：C1/C2/C3 隔离、A/B 协议、确定性归属/状态评分和可重放证据。**只有 fake transport，没有 live adapter、模型调用、LLM Judge 或正式 ACMI 集成。**

## 依赖与职责

- Node >=24.16.0 <25，仅内置依赖，不需要安装包或生产 dist。
- 只写本研究模块和 E:/codex-prj/ACMI/verification/phase-0.9.19/gate-1/ 下的新证据。
- corpus/fixtures.mjs 是显式测试向量，不是已人工审定的正式研究 Ground Truth。
- context/ 按条件构建输入；protocol/ 做 A/B 增量解析；evaluator/ 独立读取原始输出并评分。
- ledger/ 保存发送前请求、原始 chunk、提案和 checkpoint；runner/ 只允许登记过的 fake transport。
- report/ 分别报告 C1/C2/C3、18 格支持数、SM 主题和 D；无跨条件总分和模型 GO。

## 使用方法

在附加工作树根目录运行：

```powershell
Set-Location 'C:\Users\SiChuchen\.codex\worktrees\model-native-attribution-research\acmi'
$tests = Get-ChildItem -LiteralPath 'research\phase-0.9.19\tests' -Filter '*.node-test.mjs'
node --test $tests.FullName
```

端到端测试打印 EVIDENCE 目录。oracle.json 的摘要预先固定于 run manifest；C1-A 至 C3-B 各自保存原始记录。C3-B 第八轮故意注入陈旧状态，证明 UUID 正确不代表状态正确。

```powershell
node research/phase-0.9.19/cli.mjs evaluate --archive '<EVIDENCE目录>\C3-B' --oracle '<EVIDENCE目录>\oracle.json'
node research/phase-0.9.19/cli.mjs report --archive '<EVIDENCE目录>\C3-B' --oracle '<EVIDENCE目录>\oracle.json' --output '<EVIDENCE目录>\new-report.md'
```

verify 与 evaluate 都从原始归档重新校验和评分，不重新生成。--output 只允许证据根内的新文件；live/provider/credential 等参数拒绝。原始输出在 outputs/，请求在 inputs/，chunk 字节与单调时间在 transport/，实际可见正文及解析错误在 records/，提案和 hash 链在 events.jsonl。

## 边界与未验证项

- 测试中的 fake 时序和 usage 不是模型 Token/延迟；真实 Streaming 资格为 null。
- 没有确认集、正式 prompt 或确认性统计资格；聚类区间为 null，不用少量 fixture 制造支持。
- 正文断言目前是冻结的必须/禁止字面片段，不评价开放式帮助性；正式语料需补否定/引用反例及人工审定。
- 仅可信本地目录、单写者；不是并发数据库或恶意管理员防篡改系统。
- 旧阶段完整回归因新工作树缺 dist、离线依赖缓存不完整而未完成；本模块独立 Node 测试不受影响。
- Gate 1 后等待 Owner 审核；live adapter、模型/路由和有限开发预算另批，不能自动启动 576 次或 8,640 次实验。

详见 DESIGN.md、progress.md 以及仓库外获批 R2 设计和 Gate 1 计划。
