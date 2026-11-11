# Task Identity / Reference Resolution 专项

## Validation：检索不是解析

| 观测 | 0.9.3 分层规则在新开放集 |
| --- | --- |
| Active Recall@1/3/8 | 19/40、39/40、39/40 |
| Closed hints Recall@2 | 6/7（active-only 为 0/7） |
| 正确目标在实际包内 / 可解析 | 45/47；active-only 39/47 |
| 在榜时 status + ID exact | 9/45（20%），36 个在榜仍错或弃权 |
| 全集 status + ID exact | 12/59；仅有目标 9/47 |
| 可解析覆盖 / covered accuracy | 10/47 / 9/10 |
| 弃权 precision / recall | 12/49 / 12/12 |
| 历史只读 exact | 5/7 |
| ambiguous / missing / unavailable recall | 1/3、1/4、0/1 |
| false merge / split / wrong selection | 1 / 0 / 1；代价 10；高风险误并 0 |

39/40 的高 Recall@8 部分来自小目录和近期候选兜底，不能解释为话语理解。47 个可解析目标中 2 个榜外；Oracle availability ceiling 为 47/47，只在 scorer 检查理论可用性，未向规则注入答案。没有通过目标注入估算“Oracle resolver accuracy”。active-only 与 active+historical 单独运行；历史提示并不提供 bindable handle。

## 错误归因与优先级

1. **同项目不同交付物**：用户说饮水台漏水，目标是维修而非地图。候选已在榜，字面命中与单词重叠不解决对象与行动的组合。把两个任务的交付物和排除条件变成可检验对照。
2. **指代缺源或缺区分线索**：“那个”在两候选均合理时需澄清；昨日事项未进入快照是 missing，不应猜一个或 new。当前规则将多种情况折到 unresolved。三条 scope denial 的标签召回为 0/3，然而候选访问/暴露仍被 ACL 阻止；语义识别和权限边界不同。
3. **当前 Binding 冲突**：低置信的继续判断可能回落到绑定，错误的精确身份反而更危险。将“解析证据不足”和“现行 Host Binding”分别上报，避免用后者填补身份。
4. **跨 Session 与 A/B/A**：人能读更早线索；0.9.3 主包只给当轮和有限结构项，且缓存是同 Session、同版本。增量脚本在一个可见前缀命名案例恢复正确目标，条件准确率 10/45，不能推论长上下文或跨 Session 效果。
5. **历史引用与操作**：已关闭任务可用历史只读 ID，但“查旧记录”“申请 reopen”“请求 switch”不可折叠为 bind。权限、版本、只读态和语用证据需各自保留。

risk-coverage 点见 JSON；0.75 时规则仅覆盖 9/59、风险 0/9，与阈值 0 的 10/59、1/10 一起解读。分数是脚本刻度，不是校准概率。建议下一批在不同构造簇中增加 evidence-available/hidden 的反事实对子，并标可消歧 span；先修复在榜回指失败，不盲目放大 Top-k。
