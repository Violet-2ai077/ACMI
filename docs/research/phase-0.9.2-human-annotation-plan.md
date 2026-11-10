# Phase 0.9.2: Human annotation plan

**human_review_status: pending** | 人类提交 **0** | 已核验人类 reviewer **0** | 人类仲裁 **0**。本演练包只有题面，不含任何标签。历史 AI provisional labels 如被引用仍为 `ai_provisional_not_human_reviewed`；不得用生成的提交、AI/子代理互评或本文件声称 human-reviewed ground truth。

## 分发和独立性

1. 由协调人通过单独渠道核验两名真实 reviewer 的身份及资格（中/英/混合语言能力、Graph/权限规则、非题目作者、非被测系统开发或调参人员）。分别分配随机化稳定 reviewer ID，记录核验者、时间、资格、保密与无冲突声明；身份证明/联络信息隔离保管，不进仓库或评测日志。工具只能校验结构，不能验证身份。
2. 使用 [演练目录](phase-0.9.2-annotation/) 中的 `reviewer-a.json` / `reviewer-b.json`。两包完全同案同快照、次序不同，各只发给对应 reviewer；同时给 [label guide](phase-0.9.2-annotation/label-guide.md)、[空模板](phase-0.9.2-annotation/submission-template.json) 和 [schema](phase-0.9.2-annotation/submission.schema.json)。不要发整个目录、源材料、对方包、模型输出、原 provisional label 或预期 Graph Proposal。未来外部保管人冻结更大的独立包及完整语言覆盖。
3. 首先只用开放演练题校准指南用语和完成时间，不校准到某个模型/设计答案。正式批次开始后锁定指南、schema、题面 hash、分发清单和顺序；两人不交流，在各自隔离写入区盲标。同批全部资格样本双标，资源不足先缩小批次，所有高风险样本必须双标，含 target resolution、生命周期、图结构、权限/攻击。每个 reviewer 每案交一个 JSON 对象，不得擅自补齐未提供的前缀或改原文。
4. 提交带 `packetId`、分发编号、reviewer ID、UTC、指南版本和 `human_attested_annotation`；提交端状态只能为 `submitted_unverified_identity`。收件人先检查 JSON Schema，再检查 ID 集和覆盖、重复、证据范围、可见 Task/Result/Join 引用、条件一致性和包 SHA-256，随后用隔离记录人工验明身份。冻结两份原件和修订链。先计算一致性，再由第三方按 [仲裁协议](phase-0.9.2-annotation/adjudication.md) 处理差异；模型开发者不得参与仲裁。提交与仲裁记录不进入 Git。

目前的 A/B 题面是新写的公开、未评分流程演练材料，不是资格 holdout；`packetId` 证明两份同案，不证明来源独立、答案正确或身份已核验。未来资格资料另由外部保管人控制；见 [语料设计](phase-0.9.2-benchmark-redesign.md)。

## Agreement（仅当真实双标后计算）

- 单位是同一 `caseId` 的一对完整合法标注。先报应双标数、各有效提交数、可配对数、缺失/被拒数；missing 不算同意，列原因。原始双标一致性在仲裁前计算；分母、标签覆盖和排除都随结果保存。
- 名义 `intent`：同时报 raw agreement（对角和 / n）、Cohen's kappa `(p_o-p_e)/(1-p_e)`（由两人的标签边际分布求 `p_e`）和按 intent 的双向混淆矩阵、每类支持及类别一致性 `2*n_ii/(n_i.+n_.i)`。无分母/退化时填 null 并注明，不报告单一 kappa。风险等级仅确实为有序的 `low < medium < high < critical` 才计算线性加权一致性 `1-|i-j|/3`（同时保留未加权值）；其他名义字段不加权。
- 任务解析：报 `targetAbsent` 单独一致性；Task ID exact match 单独报双方都给 ID 的条件分母和至少一方给 ID 的分母（单方 null 算不一致），另报含 null 的全案数以显式暴露 null 膨胀。对 false merge/split/wrong target 的裁定不要和 raw agreement 混用。
- 状态与图：`taskStateAction` 和 `abstain` 分开名义一致性。Graph change 按 (`operation, subjectId, objectId`) 规范排序去重，报 set exact match、非空并集子集的 exact match、每操作分层与集合 overlap；空/空在全案可一致，但不进入非空分母。证据报 exact span 和逐 source 的区间重叠，独立于图 agreement；自由文本的措辞差别本身不是 disagreement。
- 报 `adjudication rate = 触发第三方复核的唯一场景数 / 有效双标场景数`、理由分布、resolved / unresolved 数和留存率。按语言、长度、高风险场景、来源分层；规模足够才对 group/trajectory 做 bootstrap 区间，稀有层报原始计数。遇低一致性先检查指南、题面和构念，不用模型答案洗掉差异；修改后用新开放题校准并重新冻结，保持原始记录。
