# Phase 0.9.10 语义结果

Pilot 的 24 次真实生成不计入主实验。所有 completion 均能解析 JSON，且都有回答及带匹配 generation/turn ref 的归属字段。24 个 Envelope 都没有通过 Host，User 与 Assistant 可发布的任务覆盖率为 0/20；可发布身份为零，selective accuracy 不适用。不能把零已发布错合并/错拆分解释成语义安全率。

| 预冻结 Pilot 指标 | 实测 |
| --- | ---: |
| raw Answer + Attribution 同 completion | 24/24 |
| Host 校验有效且原生完成 | 0/24 |
| raw 既有 Task Handle 正确（User / Assistant） | 1/20 / 0/20 |
| raw WorkNode Handle 正确 | 18/20 |
| raw 回答命中预设名称（非工具、可断言） | 18/19 |
| 原生可见回答通过同一断言 | 0/19 |
| A/B/A 两个故事、跨 Session 一个故事，完整准确 | 0/2、0/1 |
| no_task、unresolved | Host 未发布任何有效弃权，不能把拒绝当作模型弃权正确 |
| 工具末轮两条 raw action 的键和 Task/WorkNode | 2/2；实际执行 0/2 |

拒绝原因：20 次未知 Task Handle、3 次 Task/WorkNode 不配对、1 次严格 schema 不符。最后一个案例发出了两条正确的动作归属，但顶层 `new` Proposal 使用了非法临时引用 `a1`，整包未交付给 dsh。位置 1/2/3/4/8 各 4 个正例；模型原始 User 字段 19 次为 `-`，另外五次才是目录内 Handle。此分布支持「字段契约失败」而不是「已排除位置偏差」。冻结的附加排列未运行，不能报告换位、改名不变性。

Arm A/B 主实验与 Arm C 均未运行。Pilot 只能否证该配置的机制门槛，不能估计 A/B 相对回归、C 的增量成本或总体语义可行性。回答自然语言质量、多任务 span、真实模型晚到结果与 Subagent 均未测。
