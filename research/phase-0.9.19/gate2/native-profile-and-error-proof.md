# MC-N - Native 资格描述与错误子域证明

日期：2026-11-15。状态：**PARTIAL_STATIC_PROOF / NATIVE_DOMAIN_NOT_CLOSED**。
仅执行 Owner 批准的静态取证；没有 Fetch 请求、异常注入、评分或运行配置变更。
本文件补充 S2-E，不改写其结论或历史材料。候选契约未生效，G1 未批准。

## 1. 身份证据及适用边界

本轮证据目录：
`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-2/offline-mc-static-qualification-20261115/`。
`native-profile-observation.json`、`runtime-path-metadata.json`、内置源码原字节及
`upstream-retrieval.json` 分别保留当前观测和来源。没有读取密钥或启动研究入口。

| 项 | 静态观测 | 不能据此推出 |
| --- | --- | --- |
| 实际执行文件 | `C:/Users/SiChuchen/AppData/Local/pnpm/node.exe`，Node v24.16.0，win32/x64 | PATH 中其他两个 Node 与其等价 |
| SHA-256 | `b3094d0b49f9ad602262a9921551737bb97637c05dd357a06ae98188d7290aa3` | 旧批次一定用了同一字节的文件 |
| 官方对应物 | HTTPS 获取的 v24.16.0 SHASUMS 中 win-x64/node.exe 与上述摘要一致 | 已验证分离签名、可复现构建或全部供应链 |
| 组成 | V8 13.6.233.17-node.49、Undici 7.25.0、libuv 1.52.1、OpenSSL 3.5.6 | 所有 native 异常出口已枚举 |
| 宿主 | Windows 10 Pro，release 10.0.19045 | 文件系统/设备/掉电行为已获资格 |
| 启动环境 | 本次元数据进程 NODE_OPTIONS 不存在；没有导入研究模块 | 历史进程或未来完整启动链无 preload/patch |

通过 `process.binding('natives')` 只读导出实际二进制中的 Undici、bootstrap、
ReadableStream、stream util、internal/errors、fs 模块源码；不加载或调用 Fetch。
原始文件 `builtin-0.js.raw` 至 `builtin-5.js.raw` 的摘要在观测记录中。
官方 fs.js 与 builtin fs 原始摘要不同，**仅 CRLF/LF 归一后相同**；两份原件均保留，
不能写成原字节一致。C++/V8 源码使用官方同版本 tag，依赖官方发布映射，不声称反汇编证明。

旧 r4 `development/execution-pin.json` 有 node_version/native-fetch 等记录，但无
可执行文件摘要、完整启动参数和 dispatcher 身份；本轮不能为其追认完整 native 资格。
globalThis.fetch 可写/可配置；Undici 全局 dispatcher 可被设置。当前研究关键入口未
发现设置点，不等于完整依赖及宿主启动链已被封闭。此依赖仍为 unknown。

## 2. producer -> 暴露字段 -> 编码：分支证明

行号对应本轮保存的内置源码；e_i/j_i 沿用 S2-E 定义，而非新增保存字段。

| 生产者/位置 | 实际传播 | 原研究读取及次数 | 资格结果 |
| --- | --- | --- | --- |
| Undici fetch2 Request 构造，builtin-0:12775 起 | catch 原样 reject(e) | deadline 读外层 string code，否则 transport_error；首次失败后封口 | 构造/输入转换/原型域未全闭合，不能给统一 e_max |
| 网络 response.error，12816 | TypeError("fetch failed")，原错误仅为 cause | 不读取 cause.code/message | 在原型未改的该路径，外层无 code，非固定 e 增量为 0 |
| body terminated，13625 | TypeError("terminated")，原错误在 cause | reader 拒绝后同样读取外层 code | 同一条件下 e 增量为 0；不能拿 DNS/TLS cause 的长度当外层 e |
| 请求已 abort / abortFetch，12873；body aborted，13619 | 原 abort reason / serializedAbortReason | pending/outer catch；不保证所有 reason 有相同类型 | 须闭合 reason 的实际生产者及全局环境，仍 unknown |
| ReadableStream，builtin-2:2347 起 | storedError 原样交给 readRequest | 研究一次只持有一个 pending read；late continuation 受 sealed 约束 | stream 不自行给 storedError.code 提供有限枚举 |
| Undici 导出包装，17455 | 调整 stack 后 rethrow 原错误 | 研究不保存整个 stack | 不会将 cause.code 复制到外层 code |
| cancel/cleanup | 原实现吞掉详情或固定 cleanup_unconfirmed | 固定失败字段 | 不新增保存整个 OS Error 的义务；不推导 cleanup 必完成 |
| SSE 自有码/record 失败 | transport 固定 code / evidence_write_failed | 沿 S2-E 去重及副本关系 | 固定生产者子域维持原界 |
| JSON.parse 普通语法异常 | V8 JsonParse 模板产生 message | frozen parser 保存 message；report 可能输出两份 | 第 3 节只证明这一子域 |
| Buffer/clone/字符串分配、native fs、非语法 TypeError/RangeError | 部分直抛、部分进入 parser catch | 按实际 catch 区分 j_i 与宿主诊断 | 未穷尽；不能把语法模板界推广到整个 j_i |

通用 fetchImpl/clock 注入域仍没有短 code 合同；live 禁止这些参数不等于全局 Fetch
不可修改。共同结论：两条网络包装路径已收窄，但整个 native live 域仍未闭合。
不得设置全体 e_i=0，不截断/改码，不增加错误长度停止阈值。

## 3. V8 普通 JSON 语法诊断的条件上界

来源为官方 v24.16.0 的 `deps/v8/src/json/json-parser.h:345-347`、
`json-parser.cc:339-501`、`src/common/message-template.h:536-582`。

- context 常数为 10，短源边界 21；上下文/短源参数至多 20 个 UTF-16 code units。
- unexpected token 参数最多一个 UTF-16 code unit；special string 枚举最长 15。
- 相关模板常量部分均小于 128 个 code units；位置/行/列来自 int/Smi，按每项最多
  11 个十进制字符保守计。即使把互斥参数相加，128+20+1+15+3*11=197 < 256。
- 在普通模板格式化、未修改内建行为、没有先存异常的条件下，`.message` 可用
  256 UTF-16 code units 的保守界；JSON 字符串 token <=6*256+2=1538 B，单元素
  JSON 数组 <=1540 B。这是源码子域推导，**不是异常样本实验或全域 j_max**。

ReportUnexpectedToken 检查既有 exception 后可直接返回；内存/栈失败不在上述域。
该路径还创建关联 original_source 的 Script，因此**短 message 不等于短 Error
驻留对象**。原整行源可能仍可达，MC-M 必须计入，不得以 1540 B 代替其 RSS。
模板界不改变冻结 parser 的任何消息，也不重新产生/修复旧输出。

## 4. 新发现：flush 请求与 native 完成不等价

实际 builtin fs:2402-2454 / 官方 fs.js 同一行段中，UTF-8 字符串分支直接
`return binding.writeFileUtf8(path, data, flags, mode)`；flush 参数不传入，后面的
`if (flush) fs.fsyncSync(fd)` 仅在非该分支路径。appendFileSync:2492 起委托此函数。
官方 `src/node_file.cc:2587-2670` 的对应四参数 WriteFileUtf8 执行 open/write/close，
没有 fsync。冻结 r4 journal append 和结果 JSON 写入使用字符串及 flush:true。

因此，**对本次已绑定二进制及该字符串路径，flush:true 不能证明执行了 fsync**。
这是新静态资格缺口，不是实测 syscall 轨迹，更不是已发生数据丢失的证据。
不改原计数定义、620->496/20%/P-G FAIL 或历史验收结果；原要求的屏障仍须保留。
MC-S 的候选耐久确认必须证明实际到达同步调用及存储合同，而非再重复检查 option。
改变编码输入/显式同步等均涉及实现，**本轮未实施也未获自动批准**。

## 5. 审核出口

当前二进制身份、两个网络包装子域、普通语法 message 子域可追溯；历史精确身份、
完整入口/dispatcher/abort 域、其他 native 异常及存储完成仍 unknown/未闭合。
没有统一 e_max/j_max、完整客户端 Q/N/F/头域或无条件 native 资格证书。

原始官方来源（本轮均另存，不依赖网页未来保持不变）：
[发布摘要](https://nodejs.org/dist/v24.16.0/SHASUMS256.txt)、
[fs.js](https://raw.githubusercontent.com/nodejs/node/v24.16.0/lib/fs.js)、
[node_file.cc](https://raw.githubusercontent.com/nodejs/node/v24.16.0/src/node_file.cc)、
[JSON parser](https://raw.githubusercontent.com/nodejs/node/v24.16.0/deps/v8/src/json/json-parser.cc)、
[JSON parser constants](https://raw.githubusercontent.com/nodejs/node/v24.16.0/deps/v8/src/json/json-parser.h)、
[message templates](https://raw.githubusercontent.com/nodejs/node/v24.16.0/deps/v8/src/common/message-template.h)。
