# S2-E - 错误来源与编码合同

日期：2026-11-15。结论：**固定生产者已分类；通用接口小容量保证冲突；native live 域 NOT_CLOSED**。
只读分析，不运行异常注入、不调用模型、不改错误字段或停止策略。

## 1. 不混淆三条来源边界

1. `performDeadlineCompletion` 接受 fetchImpl/clock，通用接口确实允许未给长度合同的
   string error.code。任意注入域不能被赋予短码上界。
2. `openGuardedRun(mode=live)` 禁止 fetch/clock 参数注入，并选择 globalThis.fetch。
   因而上述反例**不是** native Fetch 实际会产生任意大 code 的证明。
3. 当前 live 入口没有把 Node 二进制、内置 Fetch/stream/OS 错误模板及宿主配置完整
   绑定为可推导错误上界的合同；本轮未读取凭据、连接服务或创建新的客户端。

当前 deadline-transport 比冻结 r4 多离线 accounting/batch 代码；本研究域
accounting=false、recordBatch 不启用。不能把新增字段偷偷计入/排除原冻结结果。
本轮源码对照保留，评分/报告八个关键文件与冻结副本字节一致。

## 2. ErrorEncodingContract 台账

| 来源 | 当前保存/转换 | 次数与副本 | 可证明的边界 |
| --- | --- | --- | --- |
| transport 配置、路由、digest 校验 | 自有固定 Error/WireError；try 前失败通常无 terminal | 不自动建造不存在的 result；外层 CLI 固定 stderr | 固定字面量；不是任意原异常详情 |
| SSE JSON、usage、delta、UTF-8 | transport fail 的固定 code；原 JSON.parse 消息被 invalid_event_json 替代，这是原行为 | errors 去重；error_code/stop_cause 可重复同值 | 有限源码 code 集；枚举域与 hash 绑定 |
| fetch/read continuation | pendingError 保存 string code，否则 transport_error，随后 rethrow | 一个 fetch、一个同时拥有的 read；首次失败后不启动正常下一 read；late callback 受 sealed 限制 | 字符串长度未由 W 保证；保留 e_i |
| outer transport catch | stopCause/AbortError 或 string code/fallback | errors/includes 去重；stopCause 只首次赋值 | 不增加新任意格式；native code 来源仍需绑定 |
| record/recordBatch、pre-send callback | 原错误归一为 evidence_write_failed；boundary_failure 固定码 | terminal 可能写失败；内存返回值随后改为 failed | 固定码；不能把未落盘 terminal 当成已有证据 |
| cancel/closed/cleanup | 原代码吞掉异常详情，记 cleanup_unconfirmed | 一次 cleanup 结果 | 有限固定码；不擅增保存完整 OS Error 的要求 |
| parser.snapshot/clone/hash/observer 等 try 外异常 | 可直接拒绝整个 execute | CLI 固定失败句，可能没有 result/end | 资源/实现异常不能纳入“成功报告必生成”保证 |
| readRaw / inline / wire parser | 部分固定文本；catch 保存 e.message | parser_errors；非 C0 的 score.errors 再出现 | 固定文本可界；原生 SyntaxError/TypeError/RangeError 消息保留 j_i |
| scoreDevelopmentAttempt 内部异常 | report catch 设 frozen_evaluator_rejected_prediction | score=null；不复制其任意异常消息 | 固定标志，原分数/原分类不变 |
| reader/manifest/文件系统异常 | 验证分支固定消息；部分 fs 原生异常向外传播 | report/live CLI 固定 stderr；外部宿主日志是否记录原异常另算 | 不声称宿主日志已被固定 stderr 覆盖 |
| result/stdout/report 输出失败 | 同步异常进入原外层 catch；异步 stdout 错误未有完整确认合同 | 部分文件保留；不能声称发生重试或完整收据 | 失败记录完整性与 stdout 见 S2-O |

有限自有码的集合由 `transport.mjs` 的 fail、deadline 的 problem/note/stop，以及
routing/send-boundary 的固定分支决定。其 envelope 固定额度沿 ME-S K，不增加字段。
e_i 为全部非固定 transport 错误字符串 JSON token 长度之和；j_i 为该槽原生 parser
诊断数组的编码量。二者来源不同，不能合成一个 W 或把 j_i 设为固定 schema 路径。

## 3. 编码传播与数值合同

```text
terminal/result 增量 <= 4*e_i
独立 result + stdout 增量 <= 8*e_i
report transport 行增量 <= 4*e_i
report parser_errors/score.errors 增量 <= 2*j_i
journal 中 terminal 增量还须 Base64 和原行封套编码
```

上式故意容纳逗号及多个位置的重复值，不依赖对象引用共享。固定字符串错误仍在
固定封套预算；e_i=0 只表示没有非固定错误文本，不等于没有任何固定失败码。
Parser 正常结构错误另有 S2-P 的独立完整界；catch 用原生诊断替换数组时仍由 j_i 覆盖。

拟议 native client 合同必须绑定：运行时/内置客户端与 stream 版本摘要、实际暴露的
fetch/read/abort/cancel 错误 code 集及模板、动态字段来源、最大返回次数、输入头和
本地环境域。路径、OS 消息、系统实现细节不能被假定为短枚举。
此外需分别证明 Q/N/F/头域；关闭错误域不自动关闭这些既有未知项。

## 4. 约束冲突与结果

- **已证明接口级冲突：** 若允许未限定长度的外部 code 且完整保留，任给一个小于
  可构造字符串范围的固定错误额度，都有接口输入超过它；W 不限制这个输入。
  这不是数学上 JS 字符串无限大，而是不能从本合同推出所需小额度。
- **native live 未知而非已证不可行：** 当前路径禁止注入；尚无完整版本化生产者
  证明，不能据上述接口反例宣布 native 必然失败，也不能从“通常很短”得出 e_max。
- **原生 parser 诊断未知：** 其输入大小受限，不代表原生诊断模板/分配契约已证明；
  可在未来绑定引擎模板后推出 j_max。本轮没有修改为固定错误码。
- 保存固定/原生异常的既有边界不改变；不截断、不映射掉原文，不启用新客户端
  白名单或错误长拒绝。不把现有证据写失败解释为完整归档成功。

本项完成来源分类及参数化编码证明；e_max/j_max 的 native 实例合同仍未闭合。
