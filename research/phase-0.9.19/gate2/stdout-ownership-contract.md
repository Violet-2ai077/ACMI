# S2-O - stdout 所有权、安全性与完成性

日期：2026-11-15。结论：**O0 跨槽队列真实存在；O1 安全性有条件成立，任意 sink 下完成性冲突**。
候选异步合同不生效；不改 live.mjs，不加 timeout、kill 或重试。

## 1. O0 原驱动的具体轨迹

`execution/live.mjs:26-35` 的 executeSchedule 调用 onResult(r)，不 await。
`:56-73` 的回调先同步写 result 文件，再 process.stdout.write 完整 summary，不检查
返回值、不等 drain；随后进入下一次 run.next/execute。二者与冻结副本完全相同。

令 Z_i 为该次完整 stdout 编码。即使接收端从首槽开始不再排空，回调仍可返回，
所以“只有一槽在队列中”不是原代码不变量。最多576槽时编码总量 <=sum Z_i；
在 ME-S 条件数值/e=0 域中该子项为3859808256 B。原字节数有限不等于 JS/native
驻留、宿主捕获器或进程退出前完整交付已有证明。

因此 O0 不是数学上的无限输出队列；它是可能累积整批输出、且没有完成确认的
有限计划。必须避免把通用无限流结论误用于576槽，同时也不能漏掉整批成本。

## 2. O1 候选接口与状态机

```text
emitResult(orderedExistingValue, sink) -> Promise<CompleteReceipt>
READY -> WRITE_ONE -> WAIT_CAPACITY -> WRITE_ONE ... -> DRAIN_ALL
      -> CONFIRM_CAPTURE -> COMPLETE
任意阶段 -> PARTIAL_OR_FAILED；无自动重发边
```

- 单一 producer/writer；每段至多 c 字节。serializer 不能先构造整个 JSON 字符串
  再切片；持有当前对象和一个输出片段。c 是待绑定实现参数，不是新增停止阈值。
- sink 明确签收段的所有权与保留量；等待容量期间 producer 不生成下一段。
  仅使用 write 的 highWaterMark 不能推出硬内存界，须证明最后一次越界追加及
  native/接收端副本也在合同内。
- executeSchedule 必须 await 完整回调；下一 reserve 不先于 COMPLETE。这改变
  原同步回调契约和跨槽起始时刻，不能称为已授权的透明重构。
- ledger 锁外等待；不移动 generation/cleanup 起止边界或扣掉已有阶段的耗时。
  原 attempt_wall 不含 caller 输出，保留其含义；另列总 wall/output wait，不将
  新等待塞进旧指标分母，也不从完整工程成本剔除。
- CONFIRM_CAPTURE 需要指定接收端的完整性/持久确认。普通 pipe 的 drain 不是该
  确认。result 文件已有 flush 不意味着 stdout 副本也完整。

## 3. 缓冲归属表与条件证明

| 持有方 | 需证明的量 | 释放条件 |
| --- | --- | --- |
| serializer | 一段 c；对象本体在 S2-M 另计 | sink 签收后移交/复用 |
| JS writable | B_JS；队列及最后一次追加 | 按实现确认消费，不只靠局部引用清空 |
| native/OS | B_native/B_kernel；复制及发送中片段 | 内置写入和 OS 合同 |
| 捕获器/supervisor | B_receiver、落盘中副本与文件 | 完整文件/摘要/持久完成确认 |
| callback/驱动 | 当前对象及 Promise 状态 | COMPLETE 或记录原失败后退出 |

在全部签收和容量合同成立时，归纳得到未消费队列
`Q_owned <= c+B_JS+B_native+B_kernel+B_receiver`，不随槽数增长。
任一宿主项未知，就只能声称 producer 不超前，不能声称全流程 RSS 有界。

成功轨迹：签收每段 -> 等待消费 -> 最后一段排空 -> 接收端确认 -> 下一槽。
停滞轨迹：sink 永久不提供容量，状态留在 WAIT_CAPACITY，安全性不变量可保持，
但没有整批完成证明。EPIPE/部分写入/未确认退出不能走 COMPLETE，且不自动重发。
原驱动没有这些完整异步状态；状态映射仍是需另批契约，不是本轮新增停止条件。

## 4. 完成性冲突与必要环境条件

面对可能永久停滞的 sink，完整输出不丢失且要求交付确认，就不能保证整批必定
完成。这一冲突即使允许保存整个576槽也存在：文件中保存不等于该 sink 已接收。
如果只承诺保存在本地文件而不再要求 stdout 交付，则是另一份交付合同，不能暗换。

要推导完成时间，需要外部服务下界/最大无进展时长及成功持久化条件；本轮没有
这些事实，也不创建新的停止超时。有限缓冲只证明安全性，不提供服务保证。
对 O0/O1 均不根据本结论改分、重跑或减少 stdout 内容。原 generation 180000 ms、
cleanup 5000 ms 和全部验收门槛保持不变。
