# S2-P - 完整报告编码静态台账

日期：2026-11-15。结论：**当前字段集的条件编码界已推出；原生异常项与实际内存仍未闭合**。
本轮没有调用 readRaw、评分器、aggregate 或 report；只读源码/冻结 JSON 形状并做整数算术。
八个 parser/score/contracts/report/live 关键文件与冻结 r4 副本 hash 一致。

## 1. 精确计划分母与输入形状

6 families，每 family 8 turns、2 probes、3 conditions；只从冻结 schedule 形状与
createPlan 源码推导，不重新生成/排序计划：

| arm/stage | CLOSED-LOOP | FROZEN-REPLAY | 合计 | 可能产生结构评分 |
| --- | ---: | ---: | ---: | ---: |
| A | 144 | 36 | 180 | 180 |
| B | 144 | 36 | 180 | 180 |
| C0 | 144 | 0 | 144 | 0；只有回答检查 |
| D answer | 0 | 36 | 36 | 0 |
| D marker | 0 | 36 | 36 | 36 |
| 合计 | 432 | 144 | 576 | 396 |

固定 groups 为 `3*(2+2+1+1)*3=54`，diagnostic_groups 为 9。
冻结 oracle 共 144 个条件/turn 条目，最大 decisions=2、gold edges=2、task_memory=4、
answer=2、每 decision 的 expected tasks=2。只存形状与原文件 hash，不重新定义真值。

令 W=1048576，B=262144（既有 marker parser 原始字节检查），Hh 是待证明的头域。
Q/N/Hh/F 仍是条件参数，不是本轮启用配置。

## 2. 各 arm 的中间表示不能共享错误的 B 界

- A/C0：readRaw 在原字节 >B 时先报 byte budget；C0 不走结构 schema。
- D marker：原 marker <=B；D1 answer 可能达到 W。范围非重叠且有序，抽取文本总
  code units 不超过原 answer；单调范围规则不要求 D1 自身通过 B 检查。
- B ws1：原 bytes <=B，但 scan 产生的 envelope 再 stringify 到 AST；AST 的 validator
  maxBytes=ast.length。只有 checked.valid 且 ast.length<=B 才交 readRaw。
  因此不能声称所有 B AST 都 <=B。

沿 ME-S 6 倍 JSON 引理，元数据和文本分占源片段，每 frame 新键/标点 <=16 B，
完整 frame 原文至少 16 B，固定 wrapper <=1024 B，可取：

```text
compact_B_AST <= 8*B + 1024
compact_D_envelope <= 8*B + 6*W + 1024
```

这是成功转换出的逻辑编码上界；不覆盖 native 临时副本/错误消息。超出 B 的 B AST
走 wire validator 的固定错误消息或原生异常，不产生 readRaw 的动态 schema 路径数组。
无论转换是否成功，原 marker/raw 字节不修改。

## 3. 动态 schema/reference 错误的保守完整界

下述界覆盖当前 readRaw 返回的普通结构错误数组，不裁剪，不按历史样本估计：

```text
E_schema(B) <= 256*B + 8 MiB = 75,497,472 B (72 MiB)
```

证明分摊如下。所有界包括 JSON 引号、逗号和方括号：

1. contracts 的最长固定 schema 路径（含 3 位 list index）<128 ASCII 字符；每条
   固定路径错误用 136 B 覆盖。没有递归 schema，未知 key 不会继续递归成任意祖先链。
2. 非 evidence 对象上限：root/work 2、answer 16、decisions 8、unresolved 8、
   actions 128、status 16、memory 8，以及四类 memory 条目各 8*128；合计 4282，
   取4500。每项固定字段/缺失/列表类型错误以12条覆盖，费用 <=4500*12*136。
3. 剩余 evidence 对象最坏 `{}` 用至少2个源字节产生 source_id、quote、evidence
   三条错误，费用每源字节 <=204 B。非对象 primitive/list 元素失败只产生一条，
   单字节值也 <=136 B/源字节。它们使用互不重叠的值 token，合计 <=204B。
4. 未知 key 每个至少占 key token、冒号和值四个源字节；路径前缀/extra 封套
   <=136 B/key。所有未知 key 的重新编码 token 总量不超过其原合法 JSON key token
   总量，故额外费用 <=35B。不能将整个路径只算作 key 本身。
5. references 只在 schemaErrors 为空时执行；用 <=4096 条、每条 <=128 B 覆盖。
   4500*12*136 + 4096*128 <8 MiB；余量足够容纳数组封套，线性项 239B <=256B。

D 的动态 key 来自 <=B 的 marker，D1 抽取文本不会生成额外 key 或更长祖先路径；
新增 text 值校验由上面的固定字段额度覆盖。B 只有 AST<=B 时使用此数组路径。
失败对象不假定符合合法 list.max：超过 list.max 时原函数报一次并不遍历；未知
key 则单独按源字节计数。两种行为已经计入，不偷用“所有非法输入也合 schema”。

原生 SyntaxError/TypeError/RangeError 被 catch 后的 errors=[e.message] 不在上述
普通结构域中。令 j_i 为这种数组的完整编码量，则通用安全表达式为 E_schema+j_i。
本轮未证明原生 j_max，不能以72 MiB 替代它或裁剪它。

## 4. 全部输出字段组的额度

| 输出字段组 | 来源/次数 | 编码额度或推导 |
| --- | --- | --- |
| transport.usage | 每个有 terminal 的槽最多一份 | <=6W/槽，未知扩展全部保留 |
| score.usage | A/B/D marker 最多396份 | <=6W/份；C0 不返回 usage |
| parser_errors、score.errors | 结构评分槽最多两份；C0 只有 parser_errors | 普通结构项 <=2E_schema/结构槽；原生项总计 <=2*sum(j_i) |
| coordinate/difficulty/元数据 | 原固定计划与 public 字段 | 静态字段总量用整个566405 B public 文件作保守覆盖，再计重复的小标识 |
| score 标量/指标/clock | counts、bool/null、有限数字、固定字符串、failure_codes | 数字32 B/值；固定键和分隔符纳入 K_row |
| identity_observations | 合法预测8 decisions*8 task IDs=64 | 每项UUID及至多2个 gold UUID；<=64 KiB |
| task_identity_records/state.per_task/answer_checks | 冻结 gold 最大2/4/2项；每 predicted IDs<=8 | <=64 KiB；无整段原回答复制到这些字段 |
| transport.termination/error/response_model | 原截止/清理/摘要、mime、identity、错误数组 | <=6Hh+固定字段；非固定错误另加4e_i |
| settlement/protocol_revision/dispatch/latency flags | 固定形状和枚举 | K_row，不新增 accounting/诊断扩展 |
| groups | 54组；aggregate.rows 在原代码被删除 | <=16 KiB/组；原聚合仍保留输入 rows 于内存，不是删除证据 |
| diagnostic_groups | 9组，两stage及原 censored_latency 列表 | <=8 KiB/组；总stage样本不超过72 |
| 顶层 version/head/count/decision 等 | 固定形状、冻结 revision | 连同两组封套合计 K_top=1 MiB |

取 Hh<=65536 的原候选条件时，mime <=393216 B，加静态 public 元数据、两类身份
数组、少于1000个固定 scalar/键/枚举、原协议对象，**K_row=2 MiB** 保守覆盖剩余
所有行字段。这个额度不覆盖 e_i/j_i/usage/结构错误；它们分别计入。
若 Hh 不满足该条件，应另加相应头域项，不能继续使用本数值。

原 report 的所有 returned 字段均落在上述组：score 为 null 或 C0 时只减少字段。
score 抛错会被原代码替换为固定 scoring_defect，不保存它的任意异常对象。
此界针对生成域和成功完成 import 的结果，不承诺任意 D_old 文件都能被 report
正确导入，也不承诺 OOM/输出失败后必有完整报告。

## 5. 报告总界与序列化合同

```text
R0 = (576+396)*6W + 2*396*E_schema + 576*2 MiB + 1 MiB
   = 67,118,301,184 B = 62.5087890625 GiB
R_report <= R0 + 4*sum_576(e_i) + 2*sum_parser_slots(j_i)
```

这是保守**上界**，不是实际输出大小、最低需求或已分配内存。72 MiB 结构错误界
不表示每个样本会产生72 MiB错误。原 ME-S 双份 usage 的6.75 GiB一般上界保留；
本轮用精确分母收紧为972份，而非改变原分数或字段。

候选 serializer 对现有完整 report 对象执行原枚举/数组顺序的紧凑 JSON + LF。
保持原 aggregate 调用及所有浮点累加顺序；没有改为投影评分或重新聚合。
分块只消除最终巨型字符串，不消除 rows/Map/scoreSets/canonical 中间对象。

拟议派生完成记录固定字段为 version/source_head/profile_sha256/bytes/sha256/complete；
三个摘要各64 hex、版本固定、bytes安全整数，<=512 B/记录。它不含可变系统路径或
任意 error 文本；失败详情仍保存在原指定证据位置，不藏入 receipt。记录格式未生效。
候选直接写新建数据文件，部分与完整由完成记录区别；不先复制一份完整临时报告。
最多576 result +1 stdout +1 report +1 end=579份候选记录，加一个未提交 receipt
临时文件，逻辑文件量 <=580*512=296960 B。若另需数据副本，必须另加，不取零。

## 6. 本项结果

字段分母、正常/无效结构报告、AST 转换和完整编码合同已给出可复核条件界。
j_i、e_i、native 资源异常及宿主完整持久化仍未闭合；不形成 FULL_CAPACITY_PASS。
没有执行评分器、修改原报告、生成新分数或启用 compact/spool/receipt。
