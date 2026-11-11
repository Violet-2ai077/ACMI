# ACMI Phase 0.9.4 中文执行报告

## A. 执行摘要

完成开放语料、离线研究、双盲材料和资格流程的工程交付；**生产自动路由 NO-GO**。不是 800 场景的完整交付，不是正式盲测。人工双标/仲裁、独立保管、真实模型评测的执行没有发生。

## B. 预注册与历史隔离

输入执行包 3 个哈希匹配。原 Phase 0.9.3 ZIP 452530 bytes，SHA-256 `691ac9a071bf9ec2f3e0d2e07ff94b9f467fd6878718b85985fa29fca8b41504`；92 条目、91 项内部 payload 哈希通过。核对历史报告、基准与 manifest、标注/资格/Shadow 证据、契约、测试和提交清单。0.9.1 只运行 open-only（holdoutRuns=0）；0.9.3 的 60 场景未作为新数据，外部 8 reserve 未读取、未复制、未评分。

预注册在新语料构造前于 2026-11-11 10:58:29 +08:00 冻结，commit `8f2492043df3516d31ff95020a41a4483156367f`，SHA-256 `d26d62003de44cc43d6074d972d2f3c56922c4c5c94c348b65207e69d91e476e`。见资格目录：分区、预算、最低分母、95% 簇区间、门槛、一次性消费和停止规则。外部 8 个新候补只附 hash receipt，作者可见，不进入普通 ZIP。

## C. 语料

119 个新开放故事（Dev 60 / Validation 59 / 正式 Holdout 0）、320 事件、5 长故事。中/英/混合 46/43/30；高/中风险 34/85；3540 个跨分区对未检出重复或近重复。目标 800 未达：未机械补量，未把候补冒充独立资格。provisional Gold 与输入分离，证据限合成作者自评。

## D. 人工双盲

A/B 各 119 条开放盲化输入，待协调员独立分发；无实际分发，无真人提交，reviewed/adjudicated 均为 0，kappa 等均 N/A。提供指南、空模板、校验器、分歧和证据一致性、仲裁、只追加回执。工具不签署或认证任何人；单位测试哨兵不进入标注档案。

## E. Task Identity

Validation active Recall@1/3/8 = 19/40、39/40、39/40；closed Top-2 6/7。0.9.3 分层在榜 exact 9/45，端到端 12/59，覆盖 10/47，已覆盖正确 9/10；1 次误并、0 次误拆；另有 36 个在榜仍失败。增量在榜 exact 10/45，仍不合格。专项报告提供弃权、分族、历史、榜外和作用域归因。

## F. 离线评估

六臂同包同预算同 evaluator，另有历史提示、单轮不分层和 typed facts 对照。Validation 规则 L2 exact 20/59，act F1 0.214；L4 保护证据 CI 无分母，不能声称通过。结构控制验证正例可出只读 draft、错误坐标/候选/证据与过期 revision 拒绝。mock 不是真实模型，也不是真人。无写入或执行路径。

## G. 真实模型授权

**BLOCKED: explicit authorization required**。真实请求、凭据读取均为 0；未发送真实 Session 或私有数据。真实评测需另行明确 Provider/模型/地域/数据/预算/隐私/存储与退出授权。

## H. 资格

Q0 PASS（工程）、Q1 INCONCLUSIVE（合成语义）、Q2 BLOCKED、Q3 BLOCKED、Q4 PASS（既有隔离 Shadow 回归范围），正式盲测 INCONCLUSIVE。生产自动路由 NO-GO。没有自动 Context Injection、Task Binding、Apply、Result Acceptance、Join Satisfaction、Task Closure、Global Memory 或模型直接 Graph Store 写入。

## I. 回归

当前工作区全量 179/179（包含 Core、Contracts、SDK、Conformance、Observer 等）、Source/Built 各 80/80、0.9.2 研究 16/16、0.9.3 离线 4/4、0.9.4 新离线 8/8。Contracts、build/typecheck/lint/依赖边界、演示、Zstandard、0.8/0.8.1/0.8.2/0.9 夹具基准、0.9.1 open-only、0.9.3 开放 verify 的命令及退出码随包。最终 HEAD 的独立 clean clone 结果与制品字节复现见环境回执。未运行已安装 dsh，未修改原 Session Journal。

## J. Git

基点 `bbbd19b83747946619183f86ac2b2d78a9978921`。独立 worktree `E:\codex-prj\ACMI\acmi-phase-0.9.4`，本地分支 `acmi/phase-0.9.4`。最终 commit、文件与 patch 见交付 source。未 Push、未发布 Release，未改 main、Alpha tag 或旧 worktree。

## K. 交付

目录 `E:\codex-prj\ACMI\deliverables\phase-0.9.4`；含报告、开放输入和分区、离线结果、盲包与授权准备、测试、Git diff 和 ZIP。外层报告追加 ZIP 精确字节数、摘要和独立解压记录；内层 SHA 清单覆盖所有 payload。

## L. 下一步

先补独立采集与真人标注资源，优先覆盖在榜却不能解析的相似交付物与回指；签收独立 custodian 和新资格集后再做正式盲测。需要真实模型时另行授权。交付后停止，不进入 Phase 1.0。
