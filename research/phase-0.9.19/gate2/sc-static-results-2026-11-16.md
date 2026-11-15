# SC-S/F/N/M 有限静态细化结果

日期：2026-11-16。**STATIC_WORK_COMPLETE / QUALIFICATION_NOT_CLOSED / G0_BLOCKED**。
本轮仅执行Owner批准的有限静态任务。候选契约不生效，G1仍未批准；没有实现、
重评分、研究故障测试、性能系列、RSS采样、重新冻结或模型调用。

## 1. 四项交付与判定

| 项目 | 本轮新增可核对结果 | 未闭合项 |
| --- | --- | --- |
| [SC-S同步边界](sync-boundary-contract.md) | 原写/flush/锁边界与state/cache/checkpoint映射；同fd显式fsync到FlushFileBuffers的源码链 | API权限/部署资格、实现符合性、文件身份竞态、硬服务时间 |
| [SC-F存储与配对格式](storage-fault-profile.md) | F0/F1/F2/F3保证矩阵；两份不同编码的完整Range记录；1168 B最大字段样形与2048 B条件界 | 完整profile、身份提供者、F1部署/F2保证、原ack历史见证 |
| [SC-N剩余出口](native-residual-domain.md) | 28份本地静态依赖定位；外部yaml加载点；默认本地abort来源收窄；try内/外错误区分 | 完整启动/外部依赖/dispatcher、全e/j/Q/N/F/头域、OOM最终记录 |
| [SC-M联合预算](sync-resource-budget.md) | 579份配对记录1185792 B；独立result/stdout编码、pretty增量责任、同步/回读/失败成本全列 | 总磁盘/完整编码域/native保留/硬RSS与原实测性能资格 |

## 2. 与已认可MC结果的关系

不改MC/S2原文件。已有字符串flush缺口仍未修复；本轮只补齐候选显式同步的
来源链，并识别fsyncSync在Permission Model启用时会提前拒绝。没有改变权限或
启动flags，不把当前二进制身份追认为旧批次实际身份。

当前及冻结execution/live源码明确：result是pretty JSON+LF，stdout是compact
JSON+LF；两份应各自保真，不能互相替代hash。本轮配对格式显式分别绑定。
现行report也为pretty；S2compact报告界依旧只是未生效候选域。保留原格式时
其空白增量/完整域必须另证，不能用旧compact数值宣称全容量已闭合。

完成记录中的capture_complete只声明此前数据验证，不是“receipt自证同步完成”。
崩溃后完整文件可恢复验证，不证明旧调用必已成功返回。该区别避免递归receipt
和伪造历史确认；不引入自动恢复/补发。

## 3. 条件容量而非配置

- 配对完整最大字段样形1168 B，采用未批准2048 B保守编码界，正常一次单元
  576槽+3stage=579份，上界1185792 B；无额外临时receipt。
- 该候选替代MC单范围receipt+配对清单组合，不能把旧593920 B再重复相加；
  旧证据和旧结果仍保持。profile原文、文件身份/路径绑定仍另计，不能藏入hash。
- 原核心+compact report条件和159806372224 B保持；加新固定记录得到
  159807558016 B，仍只是同一假设域下的子项，不是总预算或生效配置。
- 实际原输出编码、native错误/缓冲、文件系统分配、失败保留、完整profile以及
  GC/allocator最坏保留仍未知；本轮不增加候选磁盘/内存数字。

## 4. 约束冲突与研究意义

1. 源码能追踪同步API，不等于证明当前设备的目录项和掉电持久化。F0/F1子证书
   不能代替原要求若包含的F2；G1保持不批准。
2. 同步磁盘调用可阻塞JS线程，原timer不能中断它；不能在不具备服务保证时
   宣称180000/5000 ms构成磁盘硬完成界。本轮不加timeout或kill。
3. 任意OOM/native致命退出未必能产生最终错误文件；保留实际证据但不能承诺
   无条件完整诊断，更不能将这些失败从研究记录中排除。
4. 缺少native/GC/allocator最坏保留保证时，本证明域下硬RSS证书不可签发。
   未知不等于实际必超，静态子项也不等于原RSS<=1.25通过。
5. P-G保持620->496、20%、FAIL，原>=30%独立阻塞；不重算、不优化、不旁路。

这些是采集工程的资格边界，不构成LLM同次生成归属机制的能力否证或验证成功。
冻结prompt/oracle/计划、原分数、全部失败证据及live 1 MiB均保持不变。

## 5. 执行范围、证据及有限工作结束

证据目录：
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-sc-static-20261116/`。
保存前置source/review摘要、28文件依赖清单、10份源码对照（8份一致，原已有
ledger/deadline离线扩展差异保留）、官方libuv/AbortController/MS文档原件、
实际内置abort源码/身份、配对样形与算术、文档副本和最终保全检查记录。

来源网页获取不是模型服务请求；轻量文本/算术脚本没有import研究模块。初始一次
PowerShell语法定位错误及随后缺失路径定位记录单独保留，纠正为实际文件读取；
没有因此重试模型、运行reader或执行故障/性能测试。

交付验证：`pnpm run lint`通过（828文件），`git diff --check`通过。181份受保护
源码/文档（含100份实现或测试文件）、40份MC/SC审议证据、26/21/82份前序审议
证据、267份live文件、456份历史索引文件、234份前序产物、158份前序源码快照、
7份冻结研究材料均hash一致。各集合可重叠，不相加声称独立文件总数。main仍为
`27724a8f52a545e4082948b49ddea27341e72d43`且主工作树干净，未提交或push。
具体结果保存在`custody-check.json`、`lint-final.log`、`review-verification.json`。

当前交付是四份静态清单的结果与unknown，而非四项无条件PASS。有限任务在此
结束，返回Owner审核。部署资格、profile完整化、候选实现/非计时验证及任何性能/
冻结/模型阶段均须另批；不自动扩大调查、重新启动计数优化或启用候选契约。
