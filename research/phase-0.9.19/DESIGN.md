# Gate 1 设计与实现边界

## 设计目标

验证研究程序的记录和评分机制，不证明模型一定可行。身份与状态分别评分，原始错误、缺失、未知不能被 Host 修复成成功。非目标是生产集成、真实用户数据、模型推理和确认性资格。

## 架构设计

```text
public fixture -> condition allowlist -> request reservation -> fake transport
                                                              |
                                                   raw bytes + wire parser
                                                              |
                                                       proposal ledger

frozen oracle digest + original archive -> independent reader -> scorer -> report
```

runner 与 Evaluator 只共享字段定义及无语义摘要工具。两套 reader 分别检查重复键、完整帧、引用和跨字段约束，不能拿 runner 的 valid 代替独立评分。

## 关键决策

| 决策 | 理由与取舍 |
| --- | --- |
| C0 与 C1/C2/C3 分离 | 正文基线不与上下文条件混淆 |
| C2/C3 原始历史 | 不追加 Host 当前状态；C1 投影也保持 model_proposed |
| 空 UUID 槽位与出生映射 | 只在匹配事件/操作时重命名，不宽免后续身份漂移 |
| task_memory 七字段族 | 空 status_updates 不能代替完整状态；UUID 对但目标/验收旧仍失败 |
| 两个 reader + 公共 schema 数据 | 维护重复检查的成本，换取避免同一 parser bug 自证正确 |
| 先写请求再生成 | 崩溃仍留请求和调用预留，不能重新生成冒充恢复 |
| D 两阶段隔离 | 仅 dev，各一次，禁入 A/B 提案和 GO |
| 注册且冻结的 fake transport | 拒绝调用方注入任意 generate 或 live 接口 |
| Node 内置工具 | 无新依赖、无生产接口修改 |

## 状态评分

七字段族为 objective、criteria、work、completion、decisions、conflicts、lifecycle。主分数为身份与状态联合匹配；state_given_correct_identity 只作诊断。额外任务不能获得完美 snapshot；任务生命周期 completed 本身也计完成声明。

缺失输出/坏 JSON/超时不是 UNRESOLVED。无历史身份时 UUID exact 为 null。重复预测按多重集计数；出生按 unit、操作、occurrence 一对一映射。碎片分母保留未产生身份的任务，另报完全丢失率。

报告始终 OFFLINE_ONLY_NOT_RESEARCH_GO。工程观察率与独立故事零错误风险上界分开。确认性区间、跨条件推断及模型成本对照须后续真实开发数据与 Owner 新批准。

## 安全考量

- 不信任输出、提案、帧和 checkpoint；限制 byte/depth/array，精确引用，拒绝重复键、跨 scope 恢复和摘要损坏。
- 部分 JSON 字符串及 Inline 前缀按 chunk 保留，不全局正则删标记；失败仍保留已显示正文与原始字节。
- 写新文件和追加 hash 链，不覆盖旧记录。摘要检测不一致，不是签名或恶意篡改证明。
- 不读凭据或真实会话，不导入生产 Graph/Registry/Binding writer。
- 测试子进程仅用 Node 固定脚本验证恢复，shell=false；模块本身不启动进程。
- 写路径拒绝越界、可见符号链接和被重定向的证据根；可信单写者假设不保证抵抗外部进程的 TOCTOU/hard-link 攻击。

## 已知限制与技术取舍

增量 parser 重扫有限前缀，极细 chunk 的 CPU 成本高于完整状态机；输出限制 256 KiB，没有真实流性能资格。当前是一套八轮状态轨迹与针对性反例，不是 R2 确认性场景矩阵。

只恢复完整 turn 的 checkpoint；部分链或文件损坏拒绝恢复，不自动修补。单并发调用预算、byte 上限和 fake 超时可测；真实 Token 预检、provider 内部重试可观察性和跨进程总墙钟计费在另批 live adapter 阶段完成。

## 变更历史

2026-11-14：按 Owner 批准的 R2 和 Gate 1 计划新增离线模块。自查回归修正严格空白、active-target 一致性、提前请求持久化、恢复预算、oracle 摘要、生命周期完成与额外状态过度计分。
