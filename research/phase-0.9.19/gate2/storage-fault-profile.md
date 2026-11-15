# SC-F - 存储故障模型与配对完成格式

日期：2026-11-16。**FORMAT_BOUND_CONDITIONAL / STORAGE_NOT_QUALIFIED / NOT_ENABLED**。
保留两份实际字节、原证据、原门槛；以下是静态合同，不是运行配置或新恢复程序。

## 1. 故障域及保证矩阵

| 域 | 合同要求 | 本轮来源/资格 |
| --- | --- | --- |
| F0 API/内容完成 | 两份数据写完、显式同步返回、同身份新增范围回读hash、receipt步骤完成 | SC-S源码链支持API目标；实现符合性未验证 |
| F1-process-conditional | OS/FS持续正常；仅进程崩溃后已确认前缀仍可发现且验证 | 依赖正常OS服务、独占写者、稳定目录/文件身份、无外部删除/修改；部署未绑定 |
| F2 OS/断电 | 必要数据及目录项、缓存提交顺序在系统故障后仍满足合同 | 设备/驱动/FS/挂载/新目录项保证未知；不签发 |
| F3 设备失效/敌对修改 | 失去设备或遭外部修改仍能恢复 | 单副本信任域不能保证；本最小方案不加复制/防篡改架构 |

Microsoft文档定义FlushFileBuffers的句柄与写访问要求、成功/失败返回，并描述其
将缓存信息提交给设备/pipe的作用；它不提供本工作区目录树及具体设备的资格证明。
本方案不是pipe/console接收合同，不设置无缓存flags、不操作volume/admin flush。
来源：[FlushFileBuffers官方合同](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers)。

F0回读可能来自缓存，不能证明F2；进程kill模拟也不能证明断电安全。本轮没有查询
或改变E盘FS、设备缓存、权限、空间预留。若原门槛需要F2，条件F1不足，不更改门槛。
路径检查+hash不等于抗管理员篡改；单writer与无外部修改是显式环境假设。

## 2. PairedCompletionV1固定格式（候选）

采用一份自包含范围记录替代MC-S的单范围receipt+额外配对清单；只为未来候选，
不改旧receipt/证据。字段精确定义如下；compact JSON+LF，不允许扩展字段混入额度。

| 字段 | 域 |
| --- | --- |
| version | 固定sc-pair-v1；编码证明保守ASCII<=24 |
| kind | slot/start/end/report；证明ASCII<=16 |
| run_manifest_sha256, freeze_sha256, source_head, profile_sha256 | 各64位小写hex |
| fault_profile | F0-api或F1-process-conditional；证明ASCII<=32；不能宣称F2/F3 |
| sequence | slot为原实际输出序号1..576；三个stage使用577..579，非原计划新槽 |
| attempt_id | slot绑定原attempt hash；stage为null |
| previous_receipt_sha256 | 前一条完整记录原字节hash；首条null；不自引用 |
| result, stdout | 各为Range或null；slot必须两份Range，stage按实际产物选择 |
| capture_complete | true只陈述该记录所指数据范围写/同步/验证完成，不陈述receipt自身已同步 |
| full_schedule_complete | slot保持false；end才可按原计划/终态验证true；前缀完整不推导整批完成 |

Range恰含`file_identity_sha256, offset, length, sha256`；两hash各64hex，offset/length
为非负安全整数，要求offset+length仍安全。结果文件offset=0，长度含原LF；stdout
为连续非重叠范围。**result为pretty JSON，stdout为compact JSON，两份hash独立。**
候选名称`sc-pair-NNNN.json`使用wx，不覆盖旧文件，不建立额外临时数据副本。
result按原result-NNNN.json解析；stdout候选固定sc-stdout.jsonl，绑定原run目录。
start/end/report的实际文件位置由工程profile绑定原执行参数；report可能在其他
指定路径，完整profile路径/身份清单成本仍在总预算中，不能由hash替代原文。

文件身份hash来自profile指定的稳定native identity字段编码，不能包含随append
变化的size/mtime来假装固定身份。身份提供者、复用风险、规范编码及目录映射尚未
获部署资格；字段长度可界不代表已证明身份唯一性。完整profile另存并计量。

## 3. 完整固定记录编码界

每个string域仅ASCII，固定键和两个Range全部展开，不计任意path/cause/usage。
长度占位使用不需JSON转义的`[A-Za-z0-9_-]`字符；实际枚举为上表固定值，不把
任意带控制字符/引号的ASCII字符串混入该最大样形证明。
按最长字段、两个完整Range、所有数字16位、false与LF序列化：**1168 B**。
slot实际域最大样形为1118 B；两Range均null的stage样形676 B。null化或短枚举
只会减少；保守候选界统一**2048 B/记录**，并非现行上限。静态算术和完整最大
样形保存在本轮`paired-format-arithmetic.json`，未导入reader/评分器或运行研究。

一次有限工作单元至多576槽+start/end/report三个stage=579份：**1185792 B**。
直接写wx目标，部分文件保留，不创建临时receipt，因而此候选不继承MC的580计数。
旧MC的593920 B和SC的1185792 B是不同未生效格式，不能相加或改写原结果。
如果未来添加临时副本、完成通知、诊断原文、更多stage，须另算；无限重复审计或
重新生成派生文件的残留不在579内。不能据此增加失败次数限制或删除旧证据。

stage序号是独立命名空间，不要求按数字大小代表生成时序：start(577)先于slot1，
end(578)和report(579)在实际产出后；previous_receipt_sha256按真实生成链连接。
stage只有对应产物存在且满足条件时才生成，不因预留三个编号制造不存在的成功。

## 4. 发布与只读恢复合同

正常候选顺序：写完result并同步/close，写完stdout范围并同步，分别回读验证，
生成配对记录并写完/同fd同步/close，完成必要身份/可发现性检查，才向调用者
返回该槽交付确认。ledger锁外执行；不改变原generation/cleanup，费用全部列账。
stdout若关闭后重开做下一槽需验证同一身份；本合同不擅自批准长期句柄/后台writer。

| 崩溃/失败切点 | 只读恢复可给出的结论 | 禁止 |
| --- | --- | --- |
| 任一数据部分写入或同步失败 | 未确认，保存实际前缀 | 推断完全未写、重写/重发 |
| 数据完整但receipt不存在/不完整 | 数据可检查，原交付确认不可证明 | 补造旧成功receipt |
| receipt完整但可能在自身同步前退出 | 可重新验证内容一致，原同步返回/调用返回仍未知 | 看见receipt就倒填旧ack成功 |
| receipt及两份数据完整可验证 | recovered_valid，按fault_profile描述当前可验证前缀 | 把恢复观察等同历史调用已返回 |
| ledger头/身份/hash不匹配 | 冲突或未完成，保留全部材料 | 自动修复账本、删除尾部、继续模型计划 |
| 无end/计划未尽 | 只声明实际槽前缀 | 把576以外stage记录算入调用分母 |

不递归生成receipt的receipt；其文件内容描述此前数据验证，receipt自身完成属于
调用过程事实。若崩溃后要求证明“调用成功返回过”而不仅是数据可恢复，需要额外
见证机制，本最小合同不提供，明确unknown。恢复仅为未来只读判定，不自动续跑。

## 5. 当前可行与未闭合

可行的条件子项：两份原格式独立绑定、固定记录完整编码界、发布前序及失败切点。
未闭合：完整profile编码/身份提供者、部署F1、F2、候选实现与serializer符合性、
回读并发竞态、永久I/O停滞、资源耗尽时完整诊断。候选格式不赋予G1或任何准入。
