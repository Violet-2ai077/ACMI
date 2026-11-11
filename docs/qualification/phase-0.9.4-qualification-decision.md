# ACMI 0.9.4 自动路由资格判定：NO-GO

| 等级 | 判定 | 证据与限制 |
| --- | --- | --- |
| Q0 Contract / Schema | PASS（测试范围） | 本地合同、预算、L1/证据坐标、scope/revision、候选 fence，正负控制通过。 |
| Q1 Synthetic offline qualification | INCONCLUSIVE | 工程管线可复现，语义门槛未达；最高可解析覆盖 11/47，保护声明分母与区间缺失。 |
| Q2 Human-reviewed | BLOCKED | 真人双标、身份核验、仲裁均为 0；独立 custodian 未建立。 |
| Q3 Real model | BLOCKED | explicit authorization required；实际请求为 0。 |
| Q4 Isolated Runtime Shadow | PASS（仅继承实现的本地夹具回归） | Source/Built 重跑各 80，含每侧 3 个专用只读 Shadow；无本阶段新运行时资格或生产部署。 |
| Formal blind qualification | INCONCLUSIVE / 未执行 | 正式 Holdout 0；外部候补为同操作者哈希封存，不可作为独立 Holdout。 |

保持所有生产自动路由和持久化写入禁用。只有新独立 200 案、完整双标仲裁、足够 eligible 与 CI 分母、通过覆盖和安全门且具备另行模型授权后，才考虑按冻结协议评估。当前报告不能用于自动绑定或授权。
