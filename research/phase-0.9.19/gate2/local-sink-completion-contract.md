# MC-S - 本地完整捕获与完成合同

日期：2026-11-15。状态：**CONDITIONAL_SAFETY / COMPLETION_NOT_QUALIFIED**。
本合同细化未生效。现有 stdout 未被重定向，没有实现新 writer、receipt 或停止规则。
保持结果文件和完整 stdout 两份独立证据；G1 未批准，live 1 MiB 不变。

## 1. 交付边界及不变量

候选接收方是独占的本地完整捕获文件，不是任意 pipe、终端、GUI 或远程显示端。
必须产生与原 summary JSON+LF **同一字节序列**；字段顺序、数字格式、转义、LF
均不变。逐段 serializer 的等价性是未来证明义务，不能用结构等价替代字节等价。
不先构造整批 stdout 字符串，不以 result 文件路径/摘要替代 stdout 内容。

候选文件创建 wx、无符号链接，绑定实际文件身份、单一 writer 和只追加权限；
可信宿主不绕过 writer 修改旧范围。恶意管理员/设备损坏不由 hash 自动解决。
文件系统类型、设备写缓存、配额、目录持久化和故障模型尚未绑定，均为资格缺口。
本轮没有空间预留、文件写入故障注入或设备持久化测试。

## 2. 状态/完成合同

| 状态/事件 | 候选行为与可声称事实 | 不允许的推断 |
| --- | --- | --- |
| owned | 文件身份、独占者、已确认 offset/head 确定 | 路径相同即文件相同 |
| encoding | 单一生产片段，大小 <=c；保留原 summary 对象直到编码结束 | c 限制了 summary/native/GC 总内存 |
| writing | 只有一个未确认片段；短写按实际 bytesWritten 推进 | 调用返回就写了整片；零进展可当成功 |
| bytes_written | 当前完整 JSON+LF 范围写完，累计长度/hash 对齐 | 已耐久；接收端显示完成 |
| sync_confirmed | 实际同步操作成功，并符合指定存储故障模型 | 传了 flush:true 就到达了 fsync |
| range_verified | 对新增范围回读，比较长度/hash；文件身份与末端 offset 一致 | 文件存在即可通过；只读 result 代替 stdout |
| receipt_confirmed | 完成记录完整写入、同步且绑定正确范围/head/profile | receipt 部分文件是有效确认 |
| capture_complete | 所有实际输出前缀已确认 | 576槽计划完成 |
| full_schedule_complete | 原计划所有576槽按原规则完成，且全部交付确认 | 提前失败但失败前缀完整即整批完成 |
| unknown/failed | 保留原部分数据、原异常及已有确认前缀 | 重试/补发、删除残留、伪造未完成 receipt |

下个 reserve 必须等待原 result 与本次 stdout 范围都确认；不持 ledger 锁等待。
保持 generation=180000 ms、cleanup=5000 ms；不扩大或另加 timeout/kill。
永久 I/O 停滞时没有有界完成保证：安全性可条件成立，活性须环境 eventual progress。
不把新的“接收成功才继续”规则默认为已经批准，它是候选交付合同的一部分。

## 3. 耐久缺口：当前字符串快路径不能作为完成凭据

[MC-N](native-profile-and-error-proof.md) 已追溯当前 Node 24.16.0 的内置 fs 和官方
C++ 路径：UTF-8 字符串 writeFileSync/appendFileSync 快路径未把 flush 传给 native，
也不经过后续 fsync 分支。当前及冻结 r4 的 JSON 字符串写入不能仅凭 option 证明
实际同步完成。官方 [fs.js](https://raw.githubusercontent.com/nodejs/node/v24.16.0/lib/fs.js)
及 [WriteFileUtf8](https://raw.githubusercontent.com/nodejs/node/v24.16.0/src/node_file.cc)
与本轮保存源码支持该静态发现；未做 syscall 或掉电实验。

未来必须证明候选写法确实到达同步调用，例如核验非字符串路径或显式同步路径；
这不是本轮实施建议的自动授权，更不能通过删去原屏障来规避。
即使到达 fsync，还须限定 OS/文件系统/设备故障模型；文件内容同步不自动证明
新目录项在任意掉电情况下耐久。不能把“进程崩溃后可恢复”和“掉电不丢失”混写。
新发现仅使 native 完成资格未闭合，不改原分数、不推断历史发生丢失、不重算 P-G。

## 4. 完成记录格式及编码预算

候选固定字段：version、source_head、profile_sha256、file_identity_sha256、
range_sha256、prefix_sha256、previous_receipt_sha256、offset、length、end_offset、
completed_slots、capture_complete、full_schedule_complete。version<=24 ASCII，
六个 hash/head 各64位 hex 或 null，三个 offset/length 为非负安全整数，slots<=576，
布尔字段固定。字段名/标点、所有最长值及LF的保守编码 <=1024 B。
最长固定字段静态序列化为712 B，见本轮 `mc-conditional-arithmetic.json`。
不能往此格式加入任意路径、异常文本或 JSON 快照后仍沿用1024 B。

原候选512 B不足以直接覆盖新格式，**不再沿用该未经本格式证明的额度**。沿原
有限正常一次批次计576槽+3个阶段完成记录，以及1个同时活跃 receipt 临时文件，
候选上界为580*1024=593920 B。此为容量计算，未批准配置。若实现采用多份receipt、
更多阶段或保留多个失败临时文件，另加实际份数；无界恢复次数不能沿用580。

每个槽receipt可绑定同一来源清单中成对的 result/stdout 范围；若还需要逐个 result
独立receipt，应改为额外576份，另加589824 B，不能偷偷计入原580份。当前选择
单槽receipt的六个hash不足以额外内联两组全字段：成对范围清单本身需计入
B_manifests_pins_end，完整格式与上界**仍未闭合**。1024 B只证明列出的固定receipt。

前缀验证采用单writer、前一receipt链和新增范围回读；旧范围未改是宿主/写者不变量，
不是只靠文件 mtime 证明。若要求独立每次全前缀回读，须另外计累计 O(n^2) 读取，
不可声称仅新增范围验证满足更强的对抗修改模型。

## 5. 队列及三层操作账本

| 原逻辑边界 | 候选 JS/用户态工作 | native/外部成本与未闭合项 |
| --- | --- | --- |
| 原 result 写入 | 相同完整字节；不借 stdout 省副本 | create/write/同步/close，实际同步路径待证 |
| 原 stdout 输出 | 一片生产、一片拥有，确认后才生产下一片 | 短写次数、同步、读取验证、宿主缓冲全部计量 |
| 新完成合同 | 范围hash、前缀链、receipt/来源清单 | 额外文件写、同步、目录metadata、部分失败保留 |
| 下一 reserve | 锁外等待交付完成 | output_wait 和总wall不能从性能台账消失 |
| 原 journal 屏障 | 原逻辑边界保留 | flush_requests与实际native同步分别计量，不能混同 |

若 writer 与 verifier 不重叠且复用缓冲，可有一个c大小owned片段；保守按两片
`2c + hash_state + receipt_object + native_fs + uncollected` 计。c 是未批准参数，
不是0，也不是默认 highWaterMark；Buffer/string 编码副本和系统缓存需另列。
已释放引用不证明 GC 已归还。文件接收器若另起进程，其所有资源仍在计量边界内；
本候选优先同进程，不借进程外移改善RSS。

普通一次完成路径额外回读 stdout 为 sum(Z_i)，若 result 也逐份回读，再加同量。
按原 e_i=0 条件子域，分别3859808256 B和7719616512 B；receipt及来源清单读写
另算。短写进展/系统调用粒度未绑定，不能从bytes除以c直接宣称 syscall 次数。
原attempt计时口径不擅改；新增输出等待和 native 操作映射须未来测量桥接审议。

## 6. 非完成轨迹与资格出口

- 写了一部分后异常：文件保留，当前范围不确认；已确认前缀不等于本范围完成。
- 数据写完而同步/回读/receipt失败：不生成成功凭据；可能已写完，不允许补发模型。
- receipt完成后宿主退出但end缺失：以实际存在的确认记录说明前缀，不制造end。
- 永久stall：不保证返回，也不新增超时/kill来伪装解决；环境资格不足。
- 文件身份或源head发生变化：不确认；新候选错误/传播需另批，不改变现行停止策略。

本轮仅完成安全性、完成条件与失败轨迹描述。设备/FS资格、实际同步保证、完整
成对范围清单、serializer符合性、短写/崩溃符合性与活性仍未闭合。无实现或性能PASS。
