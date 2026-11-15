# SC-M - 同步与配对交付的联合资源预算

日期：2026-11-16。**CONDITIONAL_SUBTOTAL / CAPACITY_AND_RSS_NOT_CLOSED**。
不改原门槛、负载或运行配置，不执行性能/评分/RSS采样。引用MC/S2旧条件项时
保留其适用域，不把候选compact编码当现行pretty输出的既成事实。

## 1. 576槽条件子项及本轮差异

| 项目 | 条件界/表达式 | 限定 |
| --- | ---: | --- |
| 原journal/result/stdout核心 | 92688071040 B | 沿ME-S/S2原Q/N/Hh/e条件，不是实际占用 |
| 原完整compact report候选 | 67118301184 B | 仅已推导的compact域；现行report仍pretty |
| 两项原条件和 | 159806372224 B | 历史数值不改写，不是完整当前输出证书 |
| SC配对记录 | 1185792 B | 579*2048，单次正常工作单元，无临时副本 |
| 上述条件和 | 159807558016 B | 仅子项，不能称新资源配置/准入证书 |
| 旧MC receipt预算 | 593920 B | 不与SC重复累加；旧证据/旧结果仍保留 |
| ReaderFailure | 1024*n_R+6*sum(r) B | 次数/cause未知，不因576而有界 |
| 当前冻结材料一次内容副本 | 2137804 B | 沿既有盘点；本轮不重新冻结/复制为新运行材料 |
| 正常writer单reader scratch | 40960 B | 全D_old仍是R/U参数域，不新增输入限制 |
| 576固定摘要编码 | 2359296 B | 不代表heap对象字节 |
| stdout/result各回读一次 | 原e=0候选域7719616512 B | 若保留不同pretty格式需用实际各自字节数，不当成二者相等证明 |

SC-F中同一summary的result/stdout编码不同，必须用Z_result_i与Z_stdout_i分别
表示。原S2 report界明确针对未启用compact候选；本轮**不修改原编码为compact**。
若新合同要求原输出逐字节保留，pretty空白增量P_report及未已被原保守Z覆盖的
P_result需要独立证明，不能沿用compact合计就宣布容量闭合。旧条件界不是错误
实验分数，本轮不重算或改写它；新增适用范围说明保留在本文件。

## 2. 完整容量方程

```text
D_new_logical <= sum(J_i + Z_result_i + Z_stdout_i)
                 + R_selected_encoding
                 + B_pair_records + B_profile_and_path_identity
                 + B_reader_native_failures + S_active + S_retained_failures
                 + B_source_copies + B_pins_end_and_host_logs + B_extra_copies

R_original_pretty = R_compact + P_report
Z_result_i = 原result相应编码界（如从compact推导，另加P_result_i）
Z_stdout_i = 原compact stdout相应编码界

D_volume_peak = D_existing_preserved + D_new_allocated
                + B_other_workspace + B_filesystem_reserve
```

所有e_i/j_i参数沿S2/MC，SC-N子域不把全体参数归零。若仅条件性继续考察原compact
serializer，其未来审批和字节契约变化必须明示；上表给的是该条件子项而非偷偷选它。
P项可用各层容器/成员数量、缩进深度和换行数参数化；本轮未穷尽完整pretty对象域，
不填0、不乘任意“安全系数”。深usage/错误字符串转义、全rows/aggregate均保留。

配对范围描述已内联，不再漏掉第三份配对清单；但profile原文/路径/文件身份
提供者、stage文件绑定和故障模型文本仍须另计。hash仅用于绑定，不替代来源证据。
原现存历史全保留，不以删除或无限压缩获得容量。累计任意恢复/审计失败次数
没有统一小界；正常579记录数不限制历史残留，不引入清理/停止规则。

## 3. 三层操作与完整read分母

| 逻辑动作 | JS/用户态候选成本 | native/存储责任 |
| --- | --- | --- |
| 原完整ledger audit | 正常3459次仍保留；额外D2/失败审计单列 | 全读及R-T scratch按原公式，不只读摘要 |
| 原freeze/source verify | 正常1153次仍保留 | 每次全部原文件字节，不用调用数代read分母 |
| 原每条JSONL写屏障 | 原write/flush请求逻辑不删；同fd显式同步 | 字符串路径新增同步；原Buffer已同步路径不重复计 |
| 原result写入 | 保留pretty序列和独立副本 | write/sync/close，新增范围回读 |
| 候选stdout文件 | 原compact序列完整保留，单片拥有 | 身份校验、短写/sync、范围回读，不用result替代 |
| 配对记录 | <=579次完整编码及wx文件写 | sync/close/目录metadata；失败原部分文件保留 |
| report/end/pin/source | 各自原格式及实际Buffer/string差异 | 原屏障/同步、读回及相应stage记录 |
| 重启只读验证 | 顺序receipt链、两份数据、源head/profile | 不自动续跑；每次读回/失败残留另计 |

```text
Read_added = sum_verified_ranges(result_bytes + stdout_bytes)
             + receipt_reads + profile_identity_reads + stage_data_reads
             + recovery_reads
```

正常新增范围验证不自动每次全前缀重读；其正确性依赖独占追加和前一已验证前缀。
如要求抗外部修改的全前缀复查，需添加O(n^2)读量及更强故障合同，不能免费认领。
短写/同步系统调用次数不能简单用bytes/c给硬界；实际粒度、零进展与错误路径未绑定。
输出等待在ledger锁外，但仍属总wall和资源成本。原attempt测量边界不擅改，不
将新fsync/stdout/receipt隐藏在未计量进程。原P-G计数/成绩保持，不启动计数优化。

## 4. RSS分层和不可签发依据

| 层 | 本轮可证 | 仍缺少 |
| --- | --- | --- |
| M-L | 配对记录编码、原当前attempt/D2/cache交叠、全rows/Map/排序、异常源保留责任 | 未实现serializer符合性，全D_old和所有累计分配的小界 |
| M-E | 当前二进制来源、同步调用链、无参abort子域来源 | native F/Q、对象布局总表、GC/allocator最坏保留、OS/FS缓冲、宿主边界资格 |
| M-V | 原每pair RSS<=1.25、capture/read/audit门槛保持 | 本轮无任何测量或PASS；G1仍不批准 |

内存完整项继续包括runtime、Headers/credential转换、wire及末片、SSE解码、D2
concat、旧新cache、Error/Script源、全report rows/scoreSets/canonical/sort、输出
输入对象、片段、receipt对象、native同步缓冲、不可达未回收对象与allocator保留。
配对记录2048 B是磁盘编码，不是对象heap界；一片writer也不消除原summary对象。

在没有native与GC/allocator最坏保留保证时，**本证明域下硬RSS证书不可签发**。
这是证据不足的结论，不是实际必超内存的证明。heap极限、机器物理内存、已释放
引用、样本峰值均不能替代；本轮不设置heap cap、强制GC、进程重启或kill。
单次同步调用也没有硬延迟界，不能由180000/5000 ms计时策略推出其必然返回。

## 5. 约束冲突与最终出口

- 若要求覆盖任意停滞设备的有界完成，同时不允许新增中断机制，现合同无该保证。
- 若要求任意native/OOM退出均产生完整最终错误证据，当前进程内路径不能承诺。
- 若原要求F2，条件F1不能替代；无部署持久化保证即继续未闭合。
- 不改原完整输出而直接套用compact容量界不成立，P项或候选编码审批必须显式存在。
- P-G仍620->496、20%、FAIL，原>=30%独立阻塞；原capture median<=0.80、
  read p99/audit/RSS每pair<=1.25不变。子项静态成立不解除G0/G1。

本轮有限预算细化完成；不再扩大静态范围以追求虚假的全闭合，不发布新容量配置。
剩余部署、实现符合性、完整编码和RSS保证返回Owner审核，不自动进入任何实验。
