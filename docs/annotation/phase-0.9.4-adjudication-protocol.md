# 分歧、仲裁、导入 v1

1. 协调员验证私有身份登记、独立性和提交人，在私有审计记录包哈希、签收时间、原始提交文件哈希。程序只能验证结构与自述，不能核验人的身份。保留只读原件，错误/缺失单独返工，不用默认值补齐。
2. `annotation.mjs compare` 验证两 lane 的包和提交、按协调员映射对齐任务/事件 ID、输出有效/缺失/无效记录和 paired n。报告 L1、L2、L3、L4、L5 一致率/混淆、目标缺失、ambiguity、显式接受及证据 exact / UTF-16 IoU。类别单一、无配对等不可识别 kappa 为 null。
3. 第三位独立真人仅看分歧案、双方理由和输入，不看模型或 provisional Gold。仲裁提交填 `protocol`、`reportHash`（紧凑 JSON SHA-256）、`adjudicatorId`、`submittedAt`、`attestation` 与 `records`；每条为 canonical `case`、`choice`（A/B/revised）、`rationale`，revised 附完整 A-lane 坐标记录，重新校验。不能添加没有争议的案、静默改动双方标签或跳过理由。
4. `annotation.mjs adjudicate` 用当前 A/B 原件重算 compare，再生成只追加 receipt；拒绝旧报告哈希或重复覆盖。补充批次需保管员合并、逐案防重；审计链保留上一个 receipt 的摘要。receipt 本身不授予资格。任一资格样本缺双标、待仲裁、身份未核验时保持 BLOCKED。
