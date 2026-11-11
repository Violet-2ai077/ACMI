# 资格 Holdout 保管与一次性消费

当前 `custody_not_independent`；正式 Holdout 0，评分 0，解盲 0。外部同操作者的 8 条新合成候补只记录文件哈希和字节数，**不是独立盲集**、没有 Gold，不在 Git、开放 ZIP、A/B 包或 evaluator 的输入范围。哈希封存不等于加密、访问隔离或独立保管；作者已见题面，不得将这批升级成正式 Holdout。

独立 Custodian 与作者、调参者、模型开发者分离。另采集并冻结新构造簇，记录 reviewer / adjudicator 独立性、对象 ACL、最小权限、私有仓库访问日志，保存 inputs/映射/原始标注/仲裁和审计记录的独立副本。开发者只见冻结 receipt 与批次聚合结果。分发单 lane、隐藏 split、每 lane 随机独立盐和 opaque ID；禁止发公开归档、禁止将候选或标签写进 model packet。

消费前由 Custodian 审核预注册 SHA、固定 commit / predictor / evaluator / prompt / schema / config / authorization SHA、完整覆盖、最低分母与候选预算。在受限存储使用 exclusive-create 创建包含批次 ID、输入哈希、审阅包哈希、操作者、UTC 和 `running_consumed` 的回执，成功后才能开封给冻结的评测器。一批只有一次；崩溃、越权或泄漏即停止并永久消耗，不能删回执、补跑或调门槛。收尾只追加 completed/aborted 与结果摘要 SHA，不将逐案 Gold/预测给开发者。当前不提供正式消费 CLI。
