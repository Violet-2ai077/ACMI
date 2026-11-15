# MC-M - 576 槽位资源资格与预算细化

日期：2026-11-15。状态：**PARTIAL_CONDITIONAL_BUDGET / TOTAL_NOT_CLOSED / G0_BLOCKED**。
补充 S2 完整资源台账，不修改原条件、历史分数或候选配置，不测RSS/性能。

## 1. 三种证书严格分开

| 层 | 本轮可交付 | 本轮不交付 |
| --- | --- | --- |
| M-L 逻辑对象/编码/分配 | 源码可达对象、别名、编码方程及新增成本 | JSON字节等于heap/RSS；尚未实现的serializer已符合 |
| M-E 环境限定驻留 | 当前runtime身份、具体native路径、未知项责任表 | 完整GC/allocator/OS最坏保留界；配置生效 |
| M-V 原性能验收 | 保留原gate及未来准入依赖 | 静态PASS替代原每pair RSS<=1.25；任何性能执行 |

不加 heap cap、强制GC、Job Object、kill、重启、重试或新停止条件。即使静态全部
闭合，也不能越过未批准G1和独立的P-G FAIL。

## 2. 条件数值和新增责任

所有旧数值继续依赖未批准 Q=65536、N=32768、Hh=65536、原字段域及e_i/j_i定义。
没有以候选值替换live W=1048576 B。

| 子项 | 条件上界/表达式 | 状态 |
| --- | ---: | --- |
| 576 journal/result/独立完整stdout | 92688071040 B | S2原条件核心子项不变 |
| 完整compact report | 67118301184 B | e_i=j_i=0子域；不删字段 |
| 上述两项 | 159806372224 B / 148.8312820196 GiB | 不是全成本，更不是需求下界 |
| MC-S固定receipt及单临时文件 | 593920 B | 580*1024；替换S2候选296960，不能叠加两套 |
| 两项核心+新receipt | 159806966144 B | 未含下面诸项，不是容量证书 |
| 192 GiB减上述子项 | 46351464064 B | 纯算术差额，不是已证充足余量 |
| ReaderFailureV1 | 1024*n_R+6*sum(r) B | 原生cause/失败次数未知；不以576替代n_R |
| 普通JSON语法诊断子域 | 每单元素数组<=1540 B | 仅MC-N限定来源，不是全j_max |
| 540个有parser的槽均只出现该类诊断时，report附加 | <=1663200 B | 2*540*1540；不是实测频次，不推广到其他异常 |
| 当前冻结源一次内容副本 | 2137804 B / 48文件 | 沿S2盘点，本轮未创建新冻结 |
| R-T正常writer metadata scratch | 40960 B/工作区 | 全D_old仍用参数式，不封顶旧合法输入 |
| 576固定摘要编码 | 2359296 B | 编码不是对象驻留 |
| stdout新增范围回读 | 3859808256 B | e_i=0；是新增读取，不是新增磁盘副本 |
| stdout+result各回读一次 | 7719616512 B | 另加receipt/manifest读取，异常增加8*sum(e_i) |

原完整磁盘方程仍为：

```text
L = 152927
J_i <= 4*ceil((16968219 + 4*e_i + 2*L)/3) + 814*L
Z_i <= 6701056 + 4*e_i
R <= 67118301184 + 4*sum(e_i) + 2*sum(j_i)

D_new_logical <= sum_576(J_i+2*Z_i) + R + B_receipts
                 + B_reader_failures + S_active + S_retained_failures
                 + B_source_copies + B_manifests_pins_end
                 + B_extra_data_copies + B_diagnostics_and_host_logs
D_volume_peak = D_existing_preserved + D_new_allocated
                + B_other_process_workspace + B_filesystem_reserve
```

MC-S成对result/stdout范围清单尚无完整编码证书，必须列入B_manifests_pins_end，
不能把固定receipt界误当整套交付metadata界。若每个result新增独立receipt，另加
576*1024=589824 B。目录、分配单元、FS日志、失败残留及实际复制份数仍按S2列账。
本轮资格源码/报告取证亦占空间，保留在历史证据中；未来预算以实际文件盘点计入，
不是从候选192 GiB扣掉一个随意百分比。未限定无界人工恢复次数时保留容量无闭式小界。

## 3. 错误子域不能冒充联合闭合

- 两条native网络TypeError包装路径在原型未改条件下e增量为0；Request/abort/
  storedError/global dispatcher及其他出口未知，所以全体sum(e_i)仍未知。
- JSON普通语法message<=256 UTF-16子域只收窄部分j_i；Buffer/clone/原生类型与
  资源错误未全界定，不能把全部j_i代成1540。
- reader failure cause不属于冻结模型parser预算，独立计量；不删除或重分类旧分数。
- 当前fs字符串flush快路径是完成资格缺口，不是编码增量。不据此把原flush请求
  删除或改算P-G；若未来要满足实际同步，新增/桥接native成本须另行批准和证明。

## 4. M-L/M-E完整对象和保留责任

| 阶段 | 可证逻辑结构 | 未能静态封闭的驻留责任 |
| --- | --- | --- |
| history/compile | 原至多7份history、projection、messages/sourceMap、compiled/request | I检查前的编译峰值、字符串表示、重复clone |
| full audit | 原输入、R-T节点/stack/page、当前attempt、旧cache/新summary | 完整D_old的R/U参数无小封顶；新reader尚未实现 |
| capture | 当前wire/derived/chunks、SSE累计、terminal | F/Q/头域未准；nativebuffer、String/Buffer副本和raw-first越界片段 |
| settle/D2 | 当前完整attempt、D2 concat/decoder、终态clone、cache交叠 | 每轮完整audit的再次重建，累计分配/GC滞留 |
| JSON错误 | message子域很小 | V8 Script关联original_source；短message不能消除整行源驻留 |
| fs字符串写入 | native BufferValue 转码路径可见 | 转码副本、native缓冲、allocator与OS缓存；完成缺口另列 |
| result/stdout | 候选两片2c+hash/receipt，输入对象仍活跃 | c未绑定；旧实现O0队列仍存在，不能按候选假装已释放 |
| report/score | 全rows、identity、selected/scored/times、fragmentation/scoreSets | 保留原聚合；原snapshot全历史，候选单attempt未实施 |
| failures | 原部分文件、cause对象、未释放工作区 | 异常/stack/源引用、失败保留份数、宿主崩溃日志 |

```text
M_peak <= max_phase(B_runtime + B_client_native + B_buffers_UTF16
          + N_obj*h_obj + N_array*h_array + N_slot*h_slot
          + N_string*h_string + B_string_backing + B_Map_Set
          + B_D2 + B_cache_overlap + B_rows_temporaries + B_sink
          + B_error_source_retention + B_uncollected + B_allocator_retention)
```

当前runtime摘要只绑定对象布局所需的版本来源，尚未导出所有h或GC最坏界。
不能把h设为经验常数；字符串可能one-byte/two-byte/cons/sliced，指针与对象布局及
共享必须逐项证明。引用释放不保证回收；累计分配界要覆盖3459次正常完整audit、
D2额外audit、report全部聚合和失败路径，不能仅算同时活跃数量。
当前没有任何RSS采样，也没有完整环境限定M-E数值证书。

## 5. 三层操作/read分母与未来桥接

原正常6n+3=3459次ledger完整audit、2n+1=1153次freeze/source验证、history/control、
D2/失败额外读取、report导入与聚合全部保留。S2-R逐记录读取/临时表成本公式不变。
原逻辑检查次数、JS write/flush请求、真正native同步/文件系统操作须分层，不混记。
MC-S额外范围回读、receipt/成对清单、hash与native完成成本在此之上计量；不能
把输出等待移出总wall或把接收器移出进程边界来制造性能改善。

| 责任 | 本轮结果 | 后续所需授权/证据 |
| --- | --- | --- |
| 编码/别名/来源 | 条件子域和未知项已列 | 新格式最终化仍需审核 |
| reader/serializer/短写/cleanup符合性 | 未实现、未验证 | 另批非计时实现与故障验证 |
| 实际fsync/FS完成 | 新静态缺口 | 先审议完成合同及是否允许未来路径修订；不得自动修复 |
| native全出口、Q/N/F/头域 | 未闭合 | 绑定完整启动/客户端来源，不用小样本冒充穷尽 |
| RSS布局/GC/native/sink | 未闭合 | 明确M-E证明域；任何运行资格取证另批 |
| 原性能系列 | 未执行 | G1仍未批；原固定负载/计数/时延/RSS门槛全部保留 |

原capture median<=0.80、read p99/audit/RSS每pair<=1.25、P-G改善>=30%不变。
P-G仍620->496、20%、FAIL；本轮既未重评分也未重启计数优化。
条件上界超某候选预算不能证明实际必超，未闭合也不等于已证模型能力不足。

**审核结果：完整资源责任明确，联合容量/驻留/完成资格仍不能签发。**
