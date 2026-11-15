# SC-S - 同步边界合同与静态调用链

日期：2026-11-16。**STATIC_CONDITIONAL / NOT_IMPLEMENTED / CONTRACT_NOT_ENABLED**。
执行已批准SC-1有限静态工作；不改任何写路径，不做同步/短写/崩溃实验。
原P-G FAIL、原屏障和live 1 MiB保持。来源清单见本轮SC证据目录。

## 1. 原边界逐项清单

下表以冻结r4为语义基准，同时核对当前源。r4源码根为
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/live-20261115-r4/development-r4/evaluator/`。
当前JSONL与离线transaction/binary实现不能混作同一原运行路径。

| 原位置 | 字节/flags/原生命周期 | 候选同步责任 |
| --- | --- | --- |
| gate2/run-ledger.mjs(r4):137-139 | mkdir后manifest compact字符串、空journal；wx/flush:true；首次exclusive之前 | 各文件独立写完/同fd同步/close；目录可发现性另证 |
| 同文件:148-156 | writer.lock wx；finally close然后unlink；没有flush要求 | 保留锁/清理次序，不给锁偷偷增加耐久屏障 |
| 同文件:181-195 | exclusive内每事件compact JSON+LF，append/flush:true；API内拥有fd | 每个原事件屏障保留，写与同步同fd，不合并，不重开路径后再同步 |
| 当前gate2/run-ledger.mjs:125-153 | transition循环先更新state.seq；JSONL或离线transaction/binary；最后checkpoint/cache | 只作为差异记录；不以v5/v6 poison/batch替代v4失败行为 |
| execution/live.mjs:56,59-62 | execution-pin pretty JSON+LF；wx/flush:true | 与journal初始化不同层；失败进外层CLI，不保证有end |
| execution/live.mjs:57-58 | execution-driver Buffer源码副本；wx/flush:true | Buffer路径原已到fsync分支，不能另添一遍同步并称成本不变 |
| execution/live.mjs:72 | 每槽result-NNNN.json，pretty JSON+LF；wx/flush:true；ledger执行返回后 | 保留独立完整结果字节，外层无ledger锁 |
| execution/live.mjs:73 | 同summary的compact JSON+LF到stdout；原不等待持久化确认 | 本地文件/确认是新增候选契约，不能标作原有同步屏障 |
| execution/live.mjs:75 | execution-end pretty JSON+LF；wx/flush:true；随后设exitCode | end写失败不凭空补end；完成状态与槽前缀分开 |
| execution/report.mjs:121 | 完整report pretty JSON+LF；wx/flush:true；输出前已import/score | 保持原评分/聚合；本轮不运行；compact候选未生效 |
| execution/report.mjs:122 | stdout是report状态摘要，非report完整副本 | 保留此实际差异；不能按槽stdout规则宣称两份report |
| freeze-development及历史离线工具 | 已冻结/已产出的文件，本轮只读 | 不重写历史以补同步，不重新冻结，不宣称全部旧文件获得资格 |
| 候选配对receipt | 当前不存在 | 新wx写/同fd同步/close及其失败/目录成本独立计量 |

**编码要点：** result是pretty而stdout是compact，两者各自与原字节等价，不要求彼此
hash相等。源头同一summary不能代替两份完整字节证据。原report也不能悄悄改compact。

## 2. 已补齐的显式同步调用链

沿MC-N已绑定二进制及同版本官方源码的构建映射：

```text
builtin fs:1281-1285 fsyncSync(fd) -> binding.fsync(fd)
node_file.cc:1565-1588 Fsync (argc==1)
  -> SyncCallAndThrowOnError(..., uv_fs_fsync, fd)
Node v24.16.0 deps/uv/src/win/fs.c:3644 uv_fs_fsync
  -> INIT(UV_FS_FSYNC), req->file.fd=fd, POST
  -> cb==NULL 时同步执行uv__fs_work -> FSYNC分派
  -> fs__fsync:2358 -> fs__sync_impl:2343
  -> FlushFileBuffers(uv__get_osfhandle(fd))
```

失败返回经GetLastError/uv错误映射回Node抛出；该路径不是后台提交即成功。
前置分支不可省略：builtin fsyncSync在Node Permission Model启用时先抛
ERR_ACCESS_DENIED，不进入binding。故上述链要求实际启动环境允许此API；本轮
不修改flags或绕过权限，也不能凭同一版本号给历史/未来入口补签该条件。
该静态来源链可证明候选显式同步的目标API，不证明尚未实现的调用已发生，也不
证明对应磁盘/目录项/设备在掉电下的保证。MC-N字符串快路径缺口仍原样保留。
同版本libuv与实际二进制的关系沿官方发布映射，不是反汇编/运行trace证明。
来源：[官方libuv Windows实现](https://raw.githubusercontent.com/nodejs/node/v24.16.0/deps/uv/src/win/fs.c)。

## 3. state/checkpoint/cleanup的失败合同

r4 transition在append前可能修改cache.state的attempt/chunks；append成功后才更新
state.seq/digest、checkpoint及新fingerprint。append内部catch会清cache，但不回滚
已变的全部局部对象；fingerprint失败时checkpoint可能已更新。exclusive的finally
在这个catch之外：lock close/unlink失败会覆盖返回/异常，且未必清除已成功更新cache。
因此，候选不能宣称“任何抛错都等于磁盘未写、checkpoint未动或cache为空”。

| 故障切点 | 磁盘/内存可知状态 | 对外合同及需保留行为 |
| --- | --- | --- |
| encode/open前失败 | 可能已做transition；没有本次写入证明 | 保留原throw及cache catch边界；不造成功凭据 |
| 部分write失败 | 已写前缀可能存在 | 保留字节；不可整行重写/补发；原失败通路 |
| 全write后fsync失败 | 内容可能完整，持久性未知 | 新失败出口须另批；在原append catch内清cache、不发布本次成功 |
| fsync后数据fd close失败 | 内容同步可能成功但本次API未完成 | 不能成功返回；拟保留finally覆盖语义，不伪称保留了被覆盖原cause |
| 写同步成功后fingerprint失败 | checkpoint可能已更新，cache会清除 | 保留旧次序，不能擅自事务化或回滚历史 |
| lock close失败 | fn可能已成功；unlink未执行 | 原最终外显异常优先级保留；不能假设cache清空 |
| lock unlink失败 | fn可能成功；锁文件可能残留 | 不当作合法继续/可重试依据 |
| result/stdout/receipt失败 | ledger可能已settle且audit完成 | 不反改settlement/原分数；交付失败不变成模型失败或新请求 |

transport record异常沿原evidence_write_failed路径；terminal落盘失败可能只改变内存
返回值。ledger.settle/audit及caller结果输出的异常可直接进入CLI；不保证一定有
终态文件。新增fsync失败须在各实际catch位置映射，不能统一包装成一个新停止条件。

## 4. 时间/操作约束与未闭合项

同步调用会阻塞同一JS线程；原timeout timer不能中断正在执行的同步系统调用。
原写入已具有此问题，显式同步仍无有界服务时间保证。故不能由180000/5000 ms
阈值推出每次磁盘操作必在阈值内返回；不改阈值、不新增kill/timeout。

原逻辑屏障次数和审计/read分母保持；字符串分支增加实际同步，Buffer原同步不得
重复计算为两次。新stdout/配对receipt是额外成本。每个短写片段共享本次fd，只有
写完才同步；零进展、系统永久停滞和资源耗尽均不承诺完成。

已闭合：显式同步到Windows API的条件来源链、原边界/失败顺序静态映射。
未闭合：候选实现符合性、同句柄身份/路径竞态、实际FS资格、硬服务时间及F1/F2。
没有修复现行实现，没有syscall验证或存储故障测试，候选合同未生效。
