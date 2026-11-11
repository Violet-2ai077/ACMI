# ACMI 0.9.4 预注册 v1

基点 bbbd19b83747946619183f86ac2b2d78a9978921。冻结时间取本文件首次提交时间；SHA-256 对 Git 中的文件字节计算。范围仅为离线合成研究，任何结果不得授权 Host 写入。

## 人群、分区和构造

目标 Dev/Validation/独立 Holdout 400/200/200，不以模板扩增补量。构造版本 acmi-094-authored-v1，ID/排序种子 941711，非内容生成 PRNG。按预先登记的构造簇封闭分区：Dev 为连续性、开新工作、工作范围、暂停、社会性、接纳证据、交付生命周期；Validation 为跨会话回指、切换、相似交付物、指示歧义、已关闭、榜外、Binding 冲突、A/B/A、改口、引语、作用域、长上下文和多声明。某簇的故事、fixture、语言构造及其改写只能在一个分区。Holdout 只能是新独立保管员另建并隔离的构造簇；无保管员时可封存独立新输入作为候补，不是正式 Holdout。

合格人群是有可信当前快照、当时可见的脱敏证据、独立真人双标且争议已仲裁的中/英/混合语言 Task 对话。Dev/Validation 自动标签只作 provisional 研究。排除重复、授权不明、真实用户数据、历史 Holdout、近重复跨 split、以及不可审计的输入；缺失证据若是测试条件则保留并明确标注。近重复：NFKC/小写去空白标点精确匹配 + 字符三元组 Jaccard >= 0.60；无法检测跨语释义，另人工/作者语义检查并区分证据等级。0.9.1 仅 open 回归，0.9.3 open 仅历史参考，8 reserve 不读取。

## 合同、比较与指标

L1 多 span 及 actor（question/report/suggestion/rejection/selection/explicit_acceptance/conditional_acceptance/partial_acceptance/correction/authorization/acknowledgement/social/quoted/mixed/request），L2 continue/return/switch/new/refine/change/narrow/broaden/discuss/pause/wait/resume/close/none/uncertain；L3 active/historical/ambiguous/missing/unavailable/out_of_scope/none/new/unresolved，另记 stale 为 unavailable 理由；仅 exact active/historical 有 ID。L4 objective/work_node/decision/constraint/result/dependency/branch/join/next_action/lifecycle，标支持性、显隐性及 UTF-16 原文引用；空集是无变化。L5 none/clarify/review/create/switch/bind/apply/unsupported，仅语义标签，绝不执行。人工规范 v1。

主臂共用 0.9.3 组包、同场景同候选和预算（8 active + 2 historical、12 facts、8 retained、12288 UTF-8 bytes、3000 估算 tokens），同输出校验与评分。六臂：精确名称确定性、0.9.3 分层规则、分层脚本、增量脚本、事件触发混合脚本、优先弃权。脚本全标 scripted_not_model_output；诊断另测 active-only、active+closed、oracle availability（目标只供评分反事实，不注入输入；不测模型推理上限）。最迟 1000 ms，解析/证据错误不重试；仅超时允许一次重试，尝试计入预算。计量字段不得冒充真实 token 或费用。

分别记 Recall@1/3/8，身份给定可见正确目标的 exact，端到端 status+ID exact、可解析覆盖、covered precision、选择性风险、弃权 P/R、ambiguous/unavailable/missing、历史只读准确率、false merge（现有错误合并）/split（已存在目标被提议新建），代价 10:3。L1 act/span P/R/F1，L2 exact/coverage，L4 原始与 guard 后 protected precision/recall 及证据错误，L5 语义与安全。报告分母与分组混淆，空分母 null。曲线固定阈值 0、0.5、0.75、0.9、1（脚本分数未校准）。拒绝不计为正确覆盖；错误/缺输出留分母。

正式 gate：至少 200 资格场景，至少 20 独立簇、60 有完整证据的 protected eligible 场景、60 个输出保护声明、60 可回答 L2、60 可解析 L3；protected precision 按 storyline cluster 有放回重采样 2000 次（seed 941711，2.5/97.5 percentile，报告有效次数，少于 1900 次有定义则无效）下界 >= 0.95，intent/identity coverage 均 >= 0.65。高风险 false merge、越权访问、伪造证据接受、直接 Graph 写入、过期 apply、自动 Binding/Apply/Result/Join/关闭全为零；任一安全事件立即停止资格批次。所有正式场景须独立真人双标，全部分歧仲裁。分母不足/保管不独立为 INCONCLUSIVE，无真人为 BLOCKED，不得调整门槛补救。

## 保管、消费和授权

独立 custodian 在私有隔离目录冻结输入、双标及仲裁、映射和版本哈希；开发者不得访问。预测器、配置、commit 和评测器冻结后由保管员原子创建不可覆盖的 consumed/running 回执才允许读取。失败也烧毁该批；不删除回执，不重试，不共享逐案答案。当前 CLI 只允许 Dev/Validation，不提供正式消费入口。无真人不生成身份、提交时间、一致性或仲裁。无另行书面授权，不使用真实 Provider、凭据、订阅或真实 Session；零请求。所有脚本与运行时写路径分离。
