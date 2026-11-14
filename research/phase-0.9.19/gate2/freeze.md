# Gate 2 冻结材料校验

本模块校验开发材料的实际字节与版本绑定，不制作 Ground Truth、不代替人工审定，也不启动模型。

## 用法

```powershell
$manifest = 'E:\codex-prj\ACMI\verification\phase-0.9.19\gate-2\<package-id>\manifest.json'
$expectedSha256 = '<由 Owner 或保管者事前封存的清单 SHA-256>'
node research/phase-0.9.19/gate2/cli.mjs verify-freeze $manifest $expectedSha256
```

成功 exit 0，输出 JSON 报告；无效材料、缺 pin 或多余参数 exit 1。没有写文件、解封验证集或 live 模式。expectedSha256 接受大小写十六进制，但必须来自独立保管的预期值；运行时对待验文件现算一个 hash 再作为预期值，只能检查包内部一致性，不能证明它是之前封存的版本。

材料路径限定在 Gate 2 证据根内。校验不枚举无关目录，只读取清单及其列出的文件。文件内容不得包含凭据；本模块不会执行其中的 JS，也不读取环境变量。

## 清单契约

manifest 必须且只能包含：

| 字段 | 要求 |
| --- | --- |
| version | gate2-freeze-v1 |
| split | dev；此接口拒绝 validation，不访问封存验证集 |
| purpose | synthetic-test 或 development，前者只能作工程证据 |
| generator_version | 非空版本标识 |
| protocol_version | 当前 acmi-research-work-state-v2 |
| model_snapshot | 非空模型版本声明，与 runtime 文件一致；不查询服务或核实其存在性 |
| files | 文件条目列表，最多 256 项 |

每个文件条目必须且只能包含 path、role、bytes、sha256。sha256 在清单内使用 64 位小写十六进制；bytes 为实际字节数，而非字符数。

| role | 路径分区 | 数量 |
| --- | --- | --- |
| public | public/ | 至少 1 |
| oracle | oracle/ | 至少 1 |
| prompt | prompts/ | 至少 1 |
| plan | plan/ | 恰好 1 |
| runtime | runtime/ | 恰好 1 |
| evaluator | evaluator/ | 至少 1 |
| review | reviews/ | 恰好 1 |

路径使用小写 ASCII 相对路径与 `/`，不允许绝对路径、越界段、反斜杠、Windows 保留设备名、ADS 或尾随点。所有祖先路径拒绝符号链接，文件拒绝硬链接和非普通文件。清单上限 1 MiB，单文件 4 MiB，文件合计 32 MiB。

程序先验证长度和 SHA-256，再解析内容。所有 `.json` 文件及作为 JSON 读取的 plan/runtime/review 都拒绝重复键、非法 UTF-8、非有限数字和超过 48 层嵌套。没有补字段或自动修复。

plan 文件使用现有 createPlan 输入格式，检查 6 故事 × 8 轮、类别/难度数量、恢复声明和 probe 引用，重建原建议的 576 次调用计划。它不验证对话里确实包含相应场景或恢复事件，也不批准该预算。

runtime 文件的 model_snapshot 必须与 manifest 一致；此处没有替代 checkReadiness 的完整配置检查。evaluator 文件只核验字节，不 import、不执行，也不推断全部依赖是否齐备。

## 审定记录绑定

review 文件必须且只能包含：

- version = gate2-review-binding-v1；
- author、reviewer：非空声明，忽略首尾空格和大小写后必须不同；
- decision = approved；
- reviewed：恰好列出所有 public、oracle 和 plan 文件的 path 与 sha256，无重复或遗漏。

如此能拒绝“修改了语料或 probe，却仍沿用旧审定记录”的包。其他材料由外部 pin 绑定整个 manifest，不要求真值审定者为模型配置或 evaluator 代码担任额外评审。

**这只校验审定记录的声明与材料一致，不能证明名字对应不同真人、记录确由其签署，或真值语义正确。** 程序不提供默认审定人，不把 Owner 的一般“继续”指令写成具体语料已审定。

## 公有输入交付边界

verifyFreezeBundle 返回报告，并在进程内保存对应公有输入的已校验字节。readVerifiedPublicInputs(report) 仅接受本进程验证函数真正返回的对象，输出 `{path, sha256, bytes}` 副本。

- 不返回 oracle、review、runtime 或 evaluator 的正文。
- 不重新打开磁盘文件；校验后磁盘文件变化不会替换已校验的公有输入。
- 调用者修改返回 Buffer，不影响下一次读取。
- 复制、反序列化或伪造一个 artifact_hashes_verified=true 的报告不能取得访问句柄。
- 这是逻辑接口，不是 OS 权限隔离。同一进程若有文件权限，仍能绕过接口自行读取 oracle；真正模型执行器应只接收公有数据，而不是原始目录句柄。

路径分区和拒绝 public/oracle 同摘要能发现部分误放，但不能证明公开对话没有暗含标签。C1/C2/C3 的信息边界仍由请求编译器与后续完整语料检查负责。

## 报告解释

成功时仅将 artifact_hashes_verified、physical_partition_verified、review_binding_verified 置 true。下列项仍为 false：

- human_authenticity_verified；
- semantic_isolation_verified；
- evaluator_dependency_closure_verified；
- corpus_completeness_verified；
- live_execution_ready。

这不是“所有预检通过”。verify-corpus 现可在这些已固定的字节上继续检查 condition-specific oracle 的结构、一致性和 SM 支持数，格式与限制见 corpus.md。即使该机械预检通过，仍需人工作者/审定者记录核验、语义及负例分类覆盖检查、真实 prompt 冻结、evaluator 依赖清单，以及 provider/预算集成。

本轮测试包全部标记 synthetic-test；测试作者名、模型名、prompt 和 oracle 内容均是工程哨兵，不进入研究语料。没有生成或接触正式验证集。

## Owner delegation extension

The original rules above describe v1. Owner's 2026-11-14 delegation adds
gate2-freeze-v2 and gate2-review-binding-v2. See owner-amendments.md and README.md:
one authorizations/ artifact is required; exact authorization and reviewed corpus/probe
hashes are checked; same-assistant review is permitted only in delegated-model mode.
No artifact is converted into independent human evidence and no real output is LLM-scored.
