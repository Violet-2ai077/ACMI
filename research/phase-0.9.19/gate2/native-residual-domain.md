# SC-N - Native剩余出口有限清单

日期：2026-11-16。**PARTIAL_STATIC_PROOF / NATIVE_DOMAIN_NOT_CLOSED**。
本轮未调用Fetch/Abort、未注入错误、未读取凭据或运行模型；仅提取内置源码身份、
读既有源码和官方同版本资料。候选资格不生效，旧输出/分数/诊断保存规则不变。

## 1. 执行来源与本轮覆盖

MC-N二进制sha256仍为`b3094d0b49f9ad602262a9921551737bb97637c05dd357a06ae98188d7290aa3`。
本轮仅启动元数据/文本分析进程，导出internal/abort_controller，不实例化controller。
该实际内置源码与官方v24.16.0文件在CRLF/LF归一后相同；两份原字节/摘要分别保留。
观察记录为本轮`abort-source-observation.json`，不追认旧批次精确运行身份。

从当前execution/live.mjs与execution/report.mjs出发，按字面量import/export递归
定位28份本地文件，记录每条边及hash于`local-import-inventory.json`。这是文本
依赖定位，不是运行图/完整JS分析；不执行import、不读取oracle内容来调整设计。

已识别两处外部动态加载：live.mjs及dsh-inspect.mjs通过createRequire加载yaml。
这些文件确实在研究链上，但本轮未闭合外部包及宿主preload的全部副作用；未读
凭据或扩大到无关目录。限定模式搜索未发现本地setGlobalDispatcher/全局fetch赋值，
**不能排除别名、间接写入、builtin或外部依赖修改**。启动flags/preload/dispatcher
的真实执行实例仍unknown；28文件不是完整环境无修改证明。

## 2. 残余出口和编码/内存责任

| 出口 | 输入与传播到的字段 | 本轮结论 | 次数/容量责任 |
| --- | --- | --- | --- |
| Request构造 | URL字符串、plain headers、credential、Buffer body、内部signal；Undici catch原样reject | UNKNOWN：调用形状收窄，WebIDL/Headers/body/native全部转换出口未穷尽 | 单次fetch调用；外层string code进e_i，原型/可达错误源仍待绑定 |
| 网络response.error | 原错误在TypeError.cause；外层无自有code | PROVED_CONDITIONAL：沿MC包装子域，未改原型前提 | 不把cause.message/code计入未保存字段；不推广全e_i=0 |
| 本地abort产生 | deadline stop和finally均调用controller.abort()，未传入外部reason | PROVED_CONDITIONAL：默认AbortError，见下节 | 不能用任意外部signal.reason解释该路径；错误和源引用仍按实际传播 |
| body aborted/terminated | serialized reason/storedError；terminated TypeError包装 | PARTIAL：本地reason收窄，全部stream生产者/自定义dispatcher未闭合 | 一次owned read在途；总read次数N未从W推出 |
| decoder固定错误 | SSE JSON/UTF8/schema固定WireError code | 沿原有限码子域，不改错误 | 原去重与重复副本沿S2，不额外保存cause |
| raw-first Buffer/concat/hash | 从reader值复制、wire累计、摘要/terminal构造；部分在try外 | UNKNOWN：尺寸/分配失败及native退出 | raw-first末片已驻留，不能用W反推Q/F；未完成不保证有terminal |
| readRaw JSON/UTF8/结构访问 | try内部，catch返回[e.message] | JSON语法子界沿MC；fatal UTF8 TypeError、null属性访问、数组方法和资源错误未全界定 | 单次readRaw返回一组原生诊断；原message进入j_i，不归一为固定码 |
| B inline scan/wire validate | catch保存message；decode catch为固定invalid UTF-8 | 保留具体catch差异；不是全部错误都固定 | checked.errors进入report；超B的AST路径不擅删 |
| B Buffer/clone/serialize/concat | 一些在catch外；readGate2Raw可直接抛出 | 不一定形成parser_errors；可能整个import失败 | 原CLI固定stderr；不能伪造该槽j或成功报告 |
| scoreDevelopmentAttempt | report内部catch设固定scoring_defect | 原分类不变；本轮不执行 | 不复制任意异常message，但未被此catch包住的分配仍另列 |
| reader/native fs/显式同步候选 | actual cause/文件路径/系统消息；reader与输出catch不同 | UNKNOWN：工程诊断单列，不修改模型j_i | ReaderFailure、宿主日志、未完成输出不吞入固定K |
| OOM/致命native退出 | 可能不经过JS catch或写最后记录 | OUTSIDE完整诊断保证的已证明域；真实失败仍保留/计入 | 原有落盘前缀；不能承诺任何故障必归档完整错误 |

UNKNOWN/OUTSIDE仅为证明标签，不是新增拒收策略、分数过滤或丢弃失败证据的许可。
显式fsync另有已定位前置出口：Node Permission Model启用时fsyncSync会抛固定
ERR_ACCESS_DENIED，尚未进入Windows调用。资格必须绑定实际启动条件；本轮不
关闭权限模型、不改启动参数。固定该分支不等于其他OS错误模板已穷尽。

## 3. 本地abort子域新增收窄

冻结deadline-transport的stop设置stopCause后调用内部controller.abort()，外部signal
事件调用cancel -> stop('cancelled')，不转发外部signal.reason；finally再次无参abort。
实际内置AbortController.abort的默认reason是固定文本/名称的DOMException。
当stopCause已存在且返回错误name为AbortError时，原pendingError不追加该错误，
outer catch采用原stopCause，而非读取其code。由此收窄**正常内建、未改原型的本地
abort来源**，不需要把任意调用方reason计为这一来源的动态文本。

这不证明Request/stream所有错误都是该reason，也不证明整个终止流程必完成。
controller构造/abort分配失败、宿主patch、cleanup长期停滞仍有缺口；外部signal
早已aborted的分支也须沿原cancelled code处理，不能改为新的原因格式。
来源为本轮内置源码与
[官方AbortController实现](https://raw.githubusercontent.com/nodejs/node/v24.16.0/lib/internal/abort_controller.js)。

## 4. Q/N/F/头域依赖不由错误子域替代

MC/S2的Q=65536、N=32768、Hh=65536仍是未批准条件参数。内置源码中的某些
highWaterMark或默认maxHeaderSize不能直接证明Fetch response.body每次delivery
的硬上限，或整个TLS/parser/decompress/stream同时缓冲F。

- W限制原逻辑接收预算，raw-first最后片先保存再判越界，末片Q仍要单独保证。
- read次数还受空读、分片、清理及native调度影响，不用字节总量冒充N证明。
- response header解析上限需要绑定具体dispatcher、协议和配置；Content-Type等
  保存字段与编码膨胀另列，不能从一个默认常数推广所有协议路径。
- outbound Authorization来自credential，原检查非空/无CRLF不提供小长度上界；
  其Headers/native驻留不由请求body字节界覆盖。本轮不读取密钥、不记录其值。
- parser Error/Script可能保留原始源；小message界不消除该对象的驻留成本。

这些依赖既不能填0，也不能通过新增长度拒绝、修改客户端、截断错误来解决。

## 5. 有限工作出口

本轮完成了五类残余依赖的可达位置、保存字段、条件范围和未知责任清单；本地
abort来源进一步收窄，动态外部yaml/启动链被明确定位。没有统一e_max/j_max、
Q/N/F/头域或完整执行环境证书。不能把未穷尽的条件证明写成native必然不可行，
也不能以“通常很短”宣布可行。此处结束有限静态分析，返回Owner审核，不自动
追加错误探测、runtime替换或扩大到更多系统领域。
