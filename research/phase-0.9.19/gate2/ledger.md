# Gate 2 全局预算与证据账本

状态：独立组件已完成离线测试，未连接 provider，也未替换 Gate 1 runner。manifest 固定标记 evidenceKind=offline-ledger-test；不能拿这些归档证明模型或真实 Streaming 成功。

## API 与执行次序

openRunLedger({ root, runId, freezeHash, limits, resume }) 返回 path、reserve、capture、settle、snapshot。

1. root 必须位于 E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2；runId 是独立目录名。新建拒绝覆盖，resume 要求原 manifest 与传入 limits/freezeHash 完全匹配。
2. limits 包含 maxCalls、maxCostMicros、currency。调用上限为 1–576；每个金额字段限制为 0–1,000,000,000,000 微单位，1 个币种单位 = 1,000,000 微单位。总和保持在 JavaScript 安全整数范围。实际批准值仍由 Owner 提供，测试中的金额不是费用授权。
3. reserve({ coordinate, requestBytes, maxCostMicros, answerHash? }) 在任何发送之前追加并 flush 原始请求体字节、摘要、完整坐标和费用上界，返回 attemptId。未来 adapter 必须收到成功回执才发送。不能将 Authorization 等秘密头写入 requestBytes。
4. capture({ attemptId, channel, bytes, elapsedMs }) 将 wire 与 model 分别追加为原始 base64 字节；不解析、不修复、不混同。elapsedMs 是调用者提供的相对单调时间，账本检查非负与非递减，不证明来自真实网络时钟。
5. settle({ attemptId, outcome, actualCostMicros }) 记录 success/error/unknown 及已知费用或 null。已结算 attempt 不能再追加字节或结算。
6. snapshot() 每次在锁内从 manifest 和完整 hash 链重建状态，不信任调用者内存中的计数。请求与 chunk 均可从归档逐字节恢复。

coordinate 精确包含 family_id、condition、arm、track、turn_id、stage。A/B/C0 只有 single；C0 只允许闭环；D 只允许回放中的 answer/marker。所有臂共用同一 run 才获得全局预算约束；未来执行器不得为每个条件重开额度相同的新 run。

## 关键语义

- 调用数按预留次数永久计数，不因失败、结算或进程恢复减少。相同坐标不允许重复预留。
- 全 run 同时只允许一笔未结算预留。中断后不会自动重发、退款或继续下一题；必须调查原调用是否发生及其费用。
- budget.chargedMicros 是已知结算费用，或未知结算的保守预留值；reservedMicros 是仍未结算的上界。availableMicros = cap - charged - reserved。
- success 且实际费用已知时可释放差额。费用未知、transport error/unknown 或超预留均停止新调用；即使超限也如实保存结算值，availableMicros 可为负数。
- schema 无效不等于 transport error。未来 runner 应将模型原始无效输出照常归档、评分，不能借账本结算重新生成。
- D2 要求同一 family/condition/turn 的成功 D1，并要求 answerHash 匹配该 D1 已归档 model 通道的完整字节。账本不解析 provider 请求体；最终 D2 请求确实携带该答案，仍需 compiler/adapter 集成测试证明。
- 请求体最多 1 MiB，每 attempt 每个通道最多 4 MiB。超出时拒绝追加，原预留保留；未来 runner 必须中止读取并记录截断/预算错误，不能静默丢字节后宣称完整。

## 锁、损坏与恢复

每次操作用 writer.lock 的独占创建获得跨进程互斥；竞争者立即失败，不排队重试。自己持有的锁在 finally 中释放；遇到已有锁不会删除。进程若在锁内崩溃，残留锁必须人工调查，不能凭文件年龄自动解锁。

manifest 被钉住，事件按 seq/previous/digest 校验，并重新执行状态约束。缺少换行的末记录、变更字节、跨 scope manifest、符号链接或越界路径均拒绝。文件 flush 不等于经认证的断电一致性；本轮只实测进程恢复和字节损坏，不做硬件断电测试。

无恶意本机管理员、硬链接攻击或全档案回滚防御；需要更强保护时须增加外部受信 head receipt。整个合法日志后缀被删除不能仅靠自包含 hash 链识别。

## 当前未接通部分

无 provider HTTP 客户端、响应解码器、真实计费换算、研究报告导入器或自动会话编排。freezeHash 只是已钉住的标识，不是冻结资料真实性验证。下一步必须将账本与固定模型/路由、人工审定语料、真实 prompt、价格及发送边界接通；目前的 readiness 仍不得给出 live_execution_ready=true。

## Owner policy update (2026-11-14)

This document's original bounded-ledger rules continue to describe v1. Explicit
uncapped v2 is now also supported; see dsh.md for its manifest, finite schedule,
unknown-cost reporting and unchanged interruption/no-retry rules. No historical
manifest is migrated and neither mode enables actual sends.
