# Phase 0.9.3 机制消融

以 D 为控制，使用同一 open corpus 和保护性验证器。七项消融是局部诊断，不是泛化因果证据。

| 消融 | 观察 |
| --- | --- |
| 无近期身份状态 | 新 Validation 的精确身份仍 4/19；当前词法脚本未充分产生可复用候选，不等于长期状态无价值。独立 Core 测试验证带版本回指和失效。 |
| 无 typed facts | Validation 已验证 claim 召回由 4/8 降到 0/8；不从 raw Tool/Subagent 文字补结果。 |
| 无候选检索 | Validation 身份 exact 0/19、活跃 Recall@8 0/13，意图仍 2/20，验证了分离度量。 |
| 无分层 | Validation L2 exact 1/20、L3 exact 3/19，差别各 1 个焦点。 |
| 无触发 | 必要事件仍 22/22；Dev 不跳过唯一无关 metadata。收益分母太小，不能推算生产成本。 |
| 无 closed hints | Validation 只读历史提示召回 0/1（原 1/1），活动候选上限和权限不变。 |
| 无证据坐标检查 | open 语料中没有刻意构造错误坐标，分数不变；额外配对攻击把相同精确 excerpt 的 start 改成 -1，严格 guard 拒绝；只在离线负对照忽略声称坐标、用已知完整坐标重建时得到 draft。其他 guard 保持，两个分支均零写入。 |

Oracle 候选结果单列，不算主臂或消融质量改善。各类 Claim、guard 行为、焦点和决策层输出见 ZIP 的 `benchmark/`。
