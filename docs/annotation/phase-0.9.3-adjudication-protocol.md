# Phase 0.9.3 双标、仲裁与审计

## 分发和身份核验清单

- 协调人从可信独立渠道核验两个真实且不同的人，记录稳定匿名 reviewerId、语言能力、图谱/权限规则培训、签署保密与无利益冲突声明、是否是作者或实现/调参参与者（后两者不合格）。给不同的 distributionId。个人身份凭证另存，不记录在题面、仓库或发布报告中。
- 只发一份只读 lane 包、指南、空模板、schema。冻结原始 SHA-256、分发 ID、时间、版本与访问权限。两人独立标所有资格场景；高风险一律双标并复核有分歧项。人力不足则缩减资格批次，不能换成一人或 AI reviewer。开发者及 evaluator 看不到正式资格题与答案。
- 收件时记录文件 hash、时间、版本、身份核验收据及撤回/重交的父 hash。校验 Draft 2020-12（开启日期格式检查），另核对同一 packetId 的 lane/分发匹配，每个 `(scenarioId,turnId)` 必须是且仅出现一次的焦点。校验 actor、UTF-16 原文与顺序、spanId 映射、证据与 Host 事实引用不得晚于焦点、ID 在该 scope 内。校验不等于身份验证。保留原始文件；任何更正产生新版本和原因。

## 一致性和分歧

在仲裁前报告应标焦点数、每 lane 有效数、可配对数、缺失和拒收（分类原因），只以有效双标为一致性分母。报告：

- L1 正确匹配的 actor/span/act/三种模态标志；边界 exact match 与字符区间 overlap 分开。
- L2 各轴 raw agreement、Cohen's kappa、类别 support、混淆矩阵及每类双向 agreement，缺数据或常量边际导致无定义时填 null。risk 可按 4 个有序级别另报线性加权一致性，不代替未加权。
- L3 Task ID exact match（至少一方给 ID 的主分母，另列双方都给 ID），目标缺失单独报 `targetAbsent`。不把两边空值当作正确解析。
- L4 supported Graph change 集合 exact match，按 kind/subject/object 规范化，另报有非空并集的子集与证据 span 一致性；因果事实引用另报 exact match。
- 仲裁触发率 = 触发的唯一焦点 / 有效双标焦点；列风险、语言、主要分歧原因及 resolved / unresolved。高风险一致项的审计抽样不混入仲裁触发率。统计区间按 scenario/cluster，而不是把每条 turn 当独立样本。

## 独立仲裁和保管

第三名真人须独立验明身份和无冲突。先记录自己的题面判断，再看匿名 A/B 提交；不看 provisional 或模型输出。对实际分歧维度记录接受 A/B、合成、多解或未解决、证据、裁决理由和时间，引用两个原始提交的 hash；多解若没有预注册的公平 scorer 则排除资格评分。冻结原件、对照表、仲裁及标签快照。对全部独立验证且必要仲裁已完成的条目才标为 human-reviewed；其余显式 pending/excluded。

使用 [audit log 空模板](phase-0.9.3-audit-log-template.json)，各动作记录操作者的匿名 ID、UTC、类型、文件 hash、理由和前序事件 ID；撤回、更正和访问不得覆盖历史。公开时只发布授权范围内的汇总，不公开个人证据、单题失败或未解封的答案。保管人交接见 [benchmark design](../experiments/phase-0.9.3-benchmark-design.md)。
