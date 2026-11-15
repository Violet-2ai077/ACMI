# MC-N/R/S/M 静态资格与合同细化结果

日期：2026-11-15。总状态：**STATIC_WORK_COMPLETE / QUALIFICATION_NOT_CLOSED / G0_BLOCKED**。
Owner仅批准静态工作，不批准候选契约生效；G1仍不批准。本文件提交审核，不构成
实现、重评分、非计时故障实验、性能系列、重新冻结或模型采集授权。

## 1. 结果摘要

| 工作 | 已提交的结果 | 尚不能声称 |
| --- | --- | --- |
| [MC-N](native-profile-and-error-proof.md) | 当前实际二进制/内置源码身份、外层code与cause分离、网络包装和JSON语法诊断子域界 | 全native e_max/j_max、历史精确runtime身份或完整客户端资格 |
| [MC-R](reader-failure-equivalence.md) | v4显式throw/短路、D2、native/IO/cleanup失败映射，候选失败封套编码 | 未实现reader已等价；冻结模型parser错误可改写 |
| [MC-S](local-sink-completion-contract.md) | 受控接收方、单片拥有、短写/同步/回读/receipt、前缀与整批完成区别 | 无条件耐久/活性、完整成对范围metadata或现有stdout已有完成确认 |
| [MC-M](runtime-resource-qualification.md) | 576槽完整成本责任、条件数值、新增读取/receipt/cause/native保留项及M-L/E/V分层 | 全容量/RSS已闭合、原性能门槛通过 |

本轮只读源码/既有证据，运行一次轻量身份及内置源码提取、静态编码算术和文档/
hash保护检查；未导入研究执行入口、未调用Fetch、未做异常注入或RSS采样。
为核对构建来源获取了官方Node发布摘要和同版本源码；这些不是模型服务请求。

## 2. 重要新发现及其有限影响

**当前 Node 24.16.0 的 UTF-8 字符串写入快路径不传递flush参数，且对应native
WriteFileUtf8路径未见fsync。** 因此，当前来源下的flush:true请求不能证明实际
完成同步。这一发现影响MC-S耐久资格，不是数据丢失实测，也不是历史重评分依据。
旧批次只记录Node版本，不能用当前可执行文件摘要补签旧批次精确runtime身份。
详见MC-N第4节及保存的官方/内置原始源码。

另一个接口要点：v4 finally 的close/unlink异常可能覆盖先前异常。MC-R按原控制流
和最终外显优先级定义等价，不把“首个分支”误解为无条件返回最早错误。未来若要
改变覆盖行为，必须另批；目前不改实现、清理策略或继续资格。

## 3. 条件预算而非新配置

- S2核心+report条件上界仍为159806372224 B，约148.831282 GiB；不是全容量。
- 候选固定receipt按新字段重新核算：最长固定编码712 B，保守1024 B；580份
  条件子项593920 B。原候选512 B不直接继承，但也没有修改任何生效配置。
- ReaderFailure固定部分621 B（空cause），保守1024 B加6r；真实cause和失败次数
  仍须计量。新增成对result/stdout范围清单未闭合，不能藏在receipt额度里。
- native网络包装子域可排除cause误计；普通JSON语法数组<=1540 B仅对明确子域
  成立。其他出口继续unknown，不将所有e_i归零或所有j_i替换成1540。
- stdout/result各一次完整范围回读的条件新增读取为7719616512 B；native同步、
  receipt、清单、scratch、完整审计和失败保留成本不省略。
- 短错误消息可能仍关联完整源Script；GC/native/allocator及OS最坏驻留未闭合。
  本轮没有内存配额建议或RSS通过结论；192 GiB仍只是未批准候选。

## 4. 约束冲突与未闭合清单

| 未闭合项 | 原因/必要证明 | 本轮状态 |
| --- | --- | --- |
| 完整native生产者域 | Request构造、abort/storedError、启动链/dispatcher/原型、非语法异常未全绑定 | UNKNOWN，不用注入接口反例宣判native必然不可行 |
| 全reader实现符合性 | 保持全部D_old、短路/cleanup覆盖、未知位置及新scratch错误外显 | 静态合同已细化，未来实现/验证未获准 |
| sink实际同步 | 已发现字符串快路径不满足“option即同步”的推论 | 资格缺口保留；不自动修复 |
| sink存储/完成 | FS/设备故障模型、eventual progress、完整成对metadata、serializer未证明 | 条件安全性，不承诺永久stall仍完成 |
| 总磁盘与RSS | e/j、保留份数、FS开销、native/GC/allocator和完整进程域有未知项 | TOTAL_NOT_CLOSED |
| G0/P-G | 原计数620->496、20%、FAIL；原>=30%门槛仍适用 | 独立阻止准入，不重启计数优化 |

以上未闭合不构成LLM同次生成机制的否证，也不让已有有限开发证据变成C2/C3完整
覆盖。研究问题、冻结prompt/oracle/计划和原分数均未改变。

## 5. 证据与交付验证

本轮独立证据目录：
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-mc-static-qualification-20261115/`。
包含执行前source/review摘要、当前runtime身份、六份内置源码、官方原始源码与来源
摘要、CRLF/LF差异说明、编码算术、文档副本及最终custody/文档检查记录。
源码和文档原件分别保留，官方源码是取证数据，不加入研究实现或冻结。

交付检查：`pnpm run lint`通过（822文件），`git diff --check`通过。hash核对175份
受保护源码/文档（其中100份mjs/cjs实现或测试文件）、26份S2/MC提案证据、21/82份
前序审议证据、267份live证据、456份历史索引文件、234份前序产物、158份前序源码
快照及7份冻结研究材料均无差异。集合可能重叠，不能相加称独立文件数。
main仍为`27724a8f52a545e4082948b49ddea27341e72d43`且工作树干净。

`custody-check.json`、`lint-final.log`、`diff-check.log`及`review-verification.json`
记录交付时的实际验证结果。检查只证明文档/静态算术/字节保全，不是研究测试或
故障符合性PASS。旧失败与审议证据原字节保留；主工作树/main不修改，不提交/push。

## 6. 提交Owner审核的精确边界

本次请求审核上述结果和未闭合项，不请求候选契约自动生效。若继续，应先决定：

1. 是否接受当前native子域证书及其明确unknown，避免将未来硬RSS或全异常域保证
   作为已完成事实；仍保留原M-V实测门槛与G1审批。
2. 是否进一步审议实际同步完成缺口的候选修订及存储故障模型；任何改写法、同步
   调用、runtime或停止规则均不能在本轮自动发生。
3. 是否继续细化成对输出范围清单及reader清理覆盖接口；若要求与旧native句子
   逐字节相同，MC-R兼容范围仍未闭合，不能偷偷用固定码替换。

没有请求或启动计数优化、模型批次或性能系列。G1不批准、P-G FAIL、live 1 MiB、
全部原门槛和全部历史证据继续保持。
