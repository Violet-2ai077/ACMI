# S2-M - 联合资源证明与完整预算台账

日期：2026-11-15。结论：**STATIC_CONDITIONAL / TOTAL_NOT_CLOSED / G0_BLOCKED**。
本表完整列预算责任，未给未知项填0；不是资源配额、运行配置或性能 PASS。
依据：[reader](reader-domain-proof.md)、[错误](error-origin-contract.md)、
[报告](report-encoding-ledger.md)、[stdout](stdout-ownership-contract.md)。

## 1. 已能计算的条件数值

仍以 ME-S 的未批准 Q=65536、N=32768、Hh=65536 域、原字段、无 accounting 扩展
为前提。e_i=0/j_i=0 指非固定异常文本不出现，不排除固定失败码/普通 schema 错误。

| 逻辑字节子项 | 条件上界 | 含义 |
| --- | ---: | --- |
| 576 journal/result/完整 stdout 捕获 | 92688071040 B / 86.3224929571 GiB | ME-S 原核心上界，不是实际占用 |
| 完整 compact report | 67118301184 B / 62.5087890625 GiB | 包含结构错误、所有 usage 副本、行与分组字段 |
| 上述两项之和 | 159806372224 B / 148.8312820196 GiB | 不是全成本；两项都是上界，不能当成需求下界 |
| 单工作区正常 writer 行 scratch | 40960 B | R-T metadata 文件；一般 D_old 不适用 |
| 候选完成记录及单个 receipt 临时文件 | 296960 B | <=580*512，格式/数量合同未生效 |
| 现冻结目录一次只读物理文件内容盘点 | 2137804 B / 48文件 | 若未来复制一次才加一次；本轮未复制成新冻结 |
| 当前 driver 源码一份 | 5203 B | 未替代未来 candidate 源码大小 |
| O0 未排空 stdout 编码总量 | 3859808256 B | 属内存队列子项；磁盘副本已在核心中，不重复当磁盘新增 |
| 576 固定摘要序列化 | 2359296 B | ME-S 4096/项，不是 heap |

旧192 GiB候选减前两项的算术余量为46352057984 B；这是**待承担所有剩余项的
条件差额**，不是已证明余量充足。额外 scratch、receipt、异常项、存储开销与宿主
证据等都还须计入。上界大于某预算也不自动证明实际不可行，不能反向误读。

## 2. 完整磁盘方程及每个未知项

令 L=152927；每槽 e_i 的定义见 S2-E，j_i 为 parser 原生诊断数组。

```text
J_i <= 4*ceil((16968219 + 4*e_i + 2*L)/3) + 814*L
Z_i <= 6701056 + 4*e_i
R   <= 67118301184 + 4*sum(e_i) + 2*sum(j_i)

D_new_logical <= sum_576(J_i + 2*Z_i) + R
                 + S_active + S_retained_failures
                 + B_receipts + B_source_copies + B_manifests_pins_end
                 + B_extra_data_copies + B_diagnostics_and_host_logs
D_volume_peak = D_existing_preserved + D_new_allocated
                + B_other_process_workspace + B_filesystem_reserve
```

| 项 | 来源/当前资格 | 不能假定 |
| --- | --- | --- |
| e_i/j_i | 通用错误未限定；native 版本化实例未证明 | 0 或原 engine 最大字符串就是可行额度 |
| S_active | R-T 一行表、按实际同时 reader 工作区数相加 | 多进程报告与采集并行仍只算一份 |
| S_retained_failures | 本次新工作区失败未清理的 scratch/partial receipt，逐文件保留；旧证据只在D_existing计一次 | 历史失败文件可自动回收；无限恢复的保留数有限 |
| B_receipts | 候选固定合同下296960 B | 当前实现已有这个完整性协议 |
| B_source_copies | 每个实际复制的冻结/driver/candidate/runtime文件长度乘份数 | 旧共享文件不占空间，或未来未知客户端二进制等于当前 driver |
| B_manifests_pins_end | 原 run manifest、execution/orchestration pin、end及其字段 | 未固定的路径/授权字符串永远短；无end时冒充完整 |
| B_extra_data_copies | 若采用直接写部分数据文件，正常单次路径无额外完整临时副本；其他策略据实加 | rename/copy/备份天然免费；将新策略视为已批准 |
| B_diagnostics_and_host_logs | 固定 CLI stderr 内容可界；外部捕获器/OS崩溃日志未绑定 | 进程外输出不属于证据成本或可以无限保留 |
| D_new_allocated | 每文件块分配、目录/metadata、文件系统日志/保留项 | logical length 精确等于磁盘分配量 |
| D_existing_preserved | 全部已有历史证据和失败材料 | 从本阶段预算中删除这些文件以得到 free 空间 |

上述式对规定的一次有限批次及约定同时进程数成立；无界重复审计失败/人工恢复
次数不能压成同一有限保留预算。这里不新增失败次数停止规则，未限定场景保持未闭合。
本轮没有查询磁盘 free 或预留空间来代替这些证明。

## 3. 对象数量与驻留：不能以编码字节乘固定倍率

| 阶段 | 同时活跃的数据 | 释放与未闭合项 |
| --- | --- | --- |
| full audit | 原文件读取缓冲、token两标量、node/stack页、当前attempt、旧cache、新summary | 旧cache在新audit完成前可能仍被引用；失败路径也需计 |
| history/compile | 至多7份dialogue、projection、messages/sourceMap、compiled/request及JSON转义 | I检查在编译之后；不能用I倒推整个编译峰值 |
| capture | client F/native、wire数组及副本、SSE累计文本/usage、当前chunks、append串 | 未批准Q/F；raw-first越界片段仍有驻留；落盘不等于释放 |
| settle/D2 | 完整当前attempt、D2解码/concat、终态clone、旧新cache/摘要交换 | 不能以摘要代替D2；原再审计仍重建已结束D2 |
| result/stdout | 当前summary、serializer标量/片段、O0整批队列或O1各层缓冲 | O1未生效，drain不等于宿主落盘；GC/native条件见S2-O |
| report import/score | 原state/snapshot或候选单attempt、ev/terminal、raw/AST、identity maps、所有rows | 原report仍snapshot全历史；本轮未实施逐attempt消费者 |
| aggregate/export | 全rows、selected/scored/times引用数组、fragmentation Set、canonical/sort/scoreSets临时值、groups | 保留原算法；分块serializer不移除这些对象 |

对普通结构错误，可由 S2-P 推出单槽 error 元素数的保守界
`ceil(7B/4)+4500*12+4096 = 516848`。最多396结构槽；这是对象数量上界，不是实际
元素数。parser_errors 与 score.errors 在原对象图中引用同一数组，不能将两份输出
编码机械算作两份数组；但序列化确实输出两份。usage 的字段别名也要与临时 clone
和旧 ev 对象区分，不能一概假定共享或一概假定复制。

```text
M_process_peak <= max_phase(
  B_runtime + B_client_native + B_buffers_and_UTF16
  + N_obj*h_obj + N_array*h_array + N_slot*h_slot
  + N_string*h_string + B_string_backing
  + B_Map_Set + B_current_D2 + B_cache_overlap
  + B_rows_and_score_temporaries + B_sink_and_receiver
  + B_uncollected + B_allocator_retention)
```

各 h、native及allocator项须绑定 Node/V8/宿主实现。无法证明回收时机时，释放引用
不能把 B_uncollected 记0；可用累计分配保守界，但反复 audit/parse/sort 会增加它。
实际 RSS 还可能包含共享页/映射与子进程边界，不能从上式逻辑数据量推出原RSS
比值<=1.25。当前原 report snapshot 仍保留整批对象；候选消费者/serializer 未实现，
不能将原现状写成“已经只有一个attempt”。

## 4. 三层完整操作与读取分母

| 工作 | 原逻辑边界 | 候选物理工作及计量责任 |
| --- | --- | --- |
| 正常 open/next/prepare/reserve/request/settle/post/end | 保留6n+3=3459次完整ledger audit | 每次原journal全遍历，加每行R-T读取/table更新；不合并审计 |
| freeze/source verify | 保留2n+1=1153次调用 | 每次读取的manifest/source/prompt等按实际文件bytes计，不以调用数代bytes |
| history/control range | 正常prepare至多7个history+当前control | 原范围bytes及重新验证成本，正常保守8n*J；不省略D1读取 |
| capture append | 原JSONL逐记录append/flush、raw/metadata/derived顺序 | 原write与flush分母不变；scratch额外writes不是原write的替代 |
| D2/error/resume | 原条件触发的额外完整校验 | 额外audits/decoder/control reads另列，正常3459不覆盖所有失败路径 |
| report/import/export | 原导入另行verify/open/snapshot，54组聚合 | 不包含在运行3459中；候选全读与单attempt选择成本单列 |
| 完成记录/文件系统/输出 | 新派生合同未生效 | 所有create/write/flush/rename、stdout、scratch及残留归档纳入完整成本 |

若 A 为发生的所有 full/range/import audit 集合，每次扫描含记录集合 F_a，
R-T 的条件读取上界为：

```text
Read_total <= sum_a sum_(r in F_a) [(8*T_r^2+16*T_r+8)*(R_r+S_r)]
              + verified_source_reads + report_external_reads + host_capture_reads
Write_total <= original_journal_bytes
               + sum_a sum_(r in F_a) [(8*T_r^2+16*T_r+8)*S_r]
               + results_stdout_report_receipts + retained_failure_and_host_writes
```

记录级式已经包含该候选扫描成本，不再重复加同一次原journal逻辑字节。原 ME-S
约133.76884 TiB只是正常路径原journal扫描上界子项，不能当作本候选全部读取量。
该算法界保守且可能非常昂贵；不据它宣称耗时达标或实际必然超时，不偷偷改变
三层计数映射/read分母。物理操作次数需按每次具体分块/系统调用细化，未实现前
保持符号参数，而不是用文件逻辑长度假充系统调用计数。

## 5. 约束冲突、未知项与审核结果

- G1不批准：原计数改善>=30%继续适用；保留原写屏障的候选没有解除该阻塞，
  新scratch还增加成本。本轮不计算新P-G成绩、不重启优化。
- 任意code域不能给统一小错误预算；native live实例仍待封闭来源证明。
- O1有限队列安全性不保证永久停滞sink完成；当前O0没有跨槽完整确认。
- 全旧接受域语义可以参数化，不保证所有旧合法非规范输入享有正常writer的小scratch/RSS。
- 全字段报告编码已有条件上界，真实RSS/客户端/native诊断/宿主/失败保留仍未知。
- 原capture median<=0.80、read p99/audit/RSS各pair<=1.25及固定负载不变；静态表
  不代替其未来性能验收。live 1 MiB不变，192 GiB与其他候选数值没有获准。

**完整预算责任已列，完整数值容量证书仍不可签发。**本轮完成五项静态任务，不
等于五项全部获得无条件证明；不进入实现、重冻结、性能或模型阶段。
