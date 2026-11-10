# Phase 0.9.3 benchmark design and custody

按 [W0 预注册](phase-0.9.3-preregistration.md) 先锁方案后写题。800（400/200/200）是目标，不用重复模板填数。本批实际 **60 个开放研究场景**（40 Dev、20 Validation；65 个焦点）和 **8 个未消费的内部保留场景**，**0 个正式 qualification Holdout**。在本地窗口逐题独立写对话、fixture 和 provisional 标签；没有足够独立作者与真人复核资源，不把小批研究结果外推为 800 案或泛化验证。

## 样本与可追溯性

- 开放集语言 en/zh/mixed = 21/19/20，风险 low/medium/high/critical = 5/12/38/5。长对话 D01、D25、V01 分别 12/13/13 turns，涵盖 A/B/A、A/B/C/A 及旧目标返回。另含跨 Session 恢复、相似名词不同产物、范围和目的区分、纯讨论与无任务、缺失/歧义/过期候选、closed historical hints、纠正、否定/引用/条件、Subagent 生命周期、Decision/Dependency/Join、Workspace 越权、Tool 注入和候选上限压力。单题不是全量预算压力测量。
- Open source: `scripts/phase-0.9.3/data/open-corpus.json`；字节 SHA-256、split、scenario/input/reference hashes、语言/风险统计见 `open-manifest.json`。版本 `acmi-093-authored-v1`，直接写作无抽样 RNG；A/B 次序为 SHA-256(lane + ':' + scenario ID)，bootstrap seed 9302301 固定。只纳入新合成场景，无真实用户数据、0.9.1/0.9.2 实例或改写；禁止取历史 Holdout/研究 reserve 供评测、调优或回归。
- 先按 storyline cluster、constructionFamily、taskFixture、linguisticPattern 和实际有改写时的 paraphrase cluster 分组，任一轴共享就不得跨 split。未发现需合并的交叉组。每案输入按焦点的前缀和同一候选/因果快照使用。gold 在 turn.expected 中供 **scorer** 读取，不能输入被测臂；字段缺省表示此轴未标，不用它推造 Host facts。Typed facts 来自独立显式 fixture，不从 gold 或正文解析。真实权限内输入不得含跨 Workspace 私有 fixture；开放语料中的该项仅作为合成范围测试，Reviewer 投影过滤。A/B 只有可见输入、焦点标记和范围内事实，去掉 split、构造、风险、gold、预测及预期 Graph。
- 泄漏审计：规范化精确非空 turn 比较（NFKC、lowercase，只留 Unicode 字母和数字）与焦点字符 trigram Jaccard ≥0.45。800 对跨 Dev/Validation，含 reserve 的跨 split 配对 1,280；零共享构造、零精确 turn 重复、零阈值命中，最大 Jaccard 0.156522。另作逐案来源和故事构造审阅。该工具可发现部分字面近似，不能证明语义独立；真实终测需独立人员复审语义/模板近邻并隔离有争议的组。资格排除：旧样本、无授权数据、跨 split 近重复、未双标、未解决分歧或证据缺失；本批未收到任何人工记录。

## 保管交接与单次消费

当前内部 reserve 是输入-only、8 案、6,043 bytes，置于独立外部目录，不跟 evaluator/worktree/发布 ZIP 一起携带题面。入库仅记录 `scripts/phase-0.9.3/data/internal-reserve-manifest.json` 的 SHA-256、case hashes、状态和 `near-duplicate-audit.json` 的聚合数。**同一操作者、物理分离、hash 封存；没有独立保管人、身份访问隔离或加密盲性保证。** 封存校验不是评分。未创建 consumed/running 记号，未消费、未标注，不称为正式或仍然独立盲的终测。

未来交接给独立于作者/调参者的保管人：在权限隔离位置签收冻结的原始 bytes，分别存输入、盲标与 adjudicated labels，校验 hash、来源组和 scope，保持每次访问日志；向实验团队只发 receipt/hash 和计划，不交题面或答案。先冻结 evaluator、Git commit、运行配置、协议及预算，再批准单次只读批次。若决定消费，**先**原子建立不可覆盖的 consumed/running 记号（含 batch ID、commit/config/evaluator/corpus hash、批准人及 UTC）再让 evaluator 读题；中断也不得清除记号重试。完成/无效均保留原 receipt，最终报告锁定前不看逐案错误；解封后永久仅作 retrospective。8 案内部 reserve 无人标也未符合资格条件，不在本阶段消费；下一轮正式资格集须重新独立构造、由外部保管并完成双盲标与仲裁。

## 本地复验

```sh
node scripts/phase-0.9.3/corpus.mjs verify
node --test scripts/phase-0.9.3/corpus.node-test.mjs
```

这两项只验证开放语料、报告、A/B 和 reserve receipt，不读取 reserve。保管者可在隔离环境调用 `node scripts/phase-0.9.3/corpus.mjs verify-reserve <external-file>` 复核 raw hash 与泄漏统计，不得用作 evaluator。人工流程与当前真实状态见 [标注指南](../annotation/phase-0.9.3-label-guide.md) 和 [状态](../annotation/phase-0.9.3-human-review-status.md)。
