# Independent adjudication and audit (0.9.2-pilot-v1)

1. **收件与身份。** 协调人预先分配不重复 reviewer ID 和分发 ID，从可信的独立渠道核对两名 reviewer 为不同真人、资格、独立性及提交归属。保存各自文件原始 SHA-256、UTC、lane、packet hash、guide/schema 版本、验证方法与核验人；身份证明隔离，不进入案例记录。使用 JSON Schema Draft 2020-12（开启日期格式检查），另比对包 hash 与唯一 case ID 完整覆盖、角色、候选/状态引用、`0 <= start < end <= text.length` 及原文一致性；须发现重复图操作及同人双交。原始文件不改，任何退回/重交都在审计链记新 hash、时间、理由与父版本。
2. **先冻结双标，再比较。** 在两份完整提交且身份经核验后，以 case ID 合并；按 [计划](../phase-0.9.2-human-annotation-plan.md) 输出仲裁前一致性。对 intent、目标/缺失、生命周期、图操作、弃权与风险的实质差异，或引用不支持关键结论，产生唯一 case-level disagreement；空图和等价的操作顺序不是实质差异。局部新实体占位号按描述/图邻接一致性映射后比较，不能单凭编号认为不同；无法映射时提交复核。高风险的两人一致案例也做额外抽查，另报抽查数量，不混进 disagreement 率。
3. **第三位真人裁决。** 第三位已核验、无冲突、与两位 reviewer 不同的人先看冻结的当时题面和指南、记录独立初判，再看匿名 A/B 回答与触发维度；不看模型输出或 provisional 答案。可采 A、采 B、据证据合成第三结论、确认多解或标不可裁决。不得只按多数投票或选迎合某臂的标签。每条记录保存 `caseId`、原 A/B 提交 hash、disputedFields、匿名 adjudicator ID、UTC、`provenance: human_attested_adjudication`、decision、处置前后证据与书面理由；resolved 标签采用提交 schema 的 annotation entry，unresolved 保留 null，不生成猜测标签。多解须有独立预注册计分合同，否则不进入单真值资格层。
4. **封存和报告。** 只在身份、独立提交与仲裁（若需）全部验证后才给相应案例 `human_reviewed` 或 `adjudicated`；非重叠、争议未解决或风险审核未完成一律 pending/excluded，并报告原因/分母。由协调人保存原始 A/B、派发 ledger、分歧、仲裁、最终快照的 hashes 和访问记录，在审计摘要中仅分享匿名状态及聚合，不提交 reviewer 的个人信息或原文到 Git。合格终测另由外部保管人封存。

这里未收到任何真人提交，因此没有可计算的一致性或已仲裁记录。结构校验、哈希或自动化演练都不能验证身份。
