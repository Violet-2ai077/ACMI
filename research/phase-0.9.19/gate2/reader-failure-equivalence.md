# MC-R - Reader 失败分支与候选等价合同

日期：2026-11-15。状态：**STATIC_MAPPING / CONTRACT_NOT_ENABLED / CONFORMANCE_UNPROVED**。
范围是冻结 r4 JSONL reader 和 S2-R 全 D_old 接受域，不是当前离线 v5/v6 的新协议。
逐项核对 r4 `development-r4/evaluator/gate2/run-ledger.mjs`、`revision-policy.mjs`。
不运行 reader、不生成旧异常、不改变冻结模型 parser/report/score 或任何错误文本。

## 1. 模拟关系及必须保留的可观察行为

正常前缀保持同一 seq/head、attempt 顺序与字段、chunks 顺序/字节、结算和 halted、
预算及 checkpoint；完整扫描通过后才发布新状态。重复 key、非规范数值/空白、
属性顺序、深结构及 Base64 接受规则继续沿 S2-R，不能以新 schema 缩小旧合法域。
对非法输入维持原语句顺序、短路和最早决定性分支；候选只放宽 native 诊断措辞
逐字节等价，实际 cause 与原输入仍保存。未知位置为 null，不猜测偏移。

**清理优先级补充：** exclusive 的 finally 先 closeSync(fd)，后 unlinkSync(lockPath)。
close 抛出会覆盖 fn 的异常并跳过 unlink；unlink 抛出也覆盖 fn 异常或成功返回。
因此“首个失败”等价指保持原控制流及最终外显异常优先级，不能一律返回最早异常。
若要求对外统一返回最早异常，则是额外契约改变，本候选不包含。可另记已知先前
phase，但不得伪造被覆盖 cause，也不得以 cleanup 错误宣称账本内容已判非法。

## 2. 原显式分支映射

下列 stable_code 均为候选 ASCII 标签，并非现行运行接口。同一行中用 `/` 标出的
不同文本逐一对应各标签；共享文本通过 phase 保持来源差别。原 OR 表达式不拆成
旧实现不存在的外显诊断；短路次序保留。

| phase | 原条件/原 throw 文本 | 候选 stable_code |
| --- | --- | --- |
| setup.revision | invalid protocol revision | REVISION_INVALID |
| setup.id | invalid run id | RUN_ID_INVALID |
| setup.freeze | invalid freeze hash | FREEZE_HASH_INVALID |
| setup.revision_mode | revision requires extended uncapped ledger | REVISION_MODE_INVALID |
| setup.evidence | invalid evidence kind | EVIDENCE_KIND_INVALID |
| setup.limits | invalid run limits | RUN_LIMITS_INVALID |
| path.root | outside Gate 2 evidence root | PATH_OUTSIDE_ROOT |
| path.components | linked evidence path | PATH_LINKED |
| lock.paths | linked evidence path（manifest/journal/lock 顺序） | PATH_LINKED |
| lock.acquire | EEXIST -> writer lock busy or stale | LOCK_BUSY_OR_STALE |
| audit.manifest | foreign or altered manifest | MANIFEST_CHANGED |
| append.manifest | foreign or altered manifest | MANIFEST_CHANGED |
| fingerprint.type | invalid journal file | JOURNAL_TYPE_INVALID |
| audit.tail | partial journal；先于任意行 JSON | JOURNAL_PARTIAL |
| audit.json | JSON.parse(line) 原生抛出 | JOURNAL_JSON_SYNTAX 或 NATIVE_UNCLASSIFIED |
| audit.fields | journal fields | JOURNAL_FIELDS |
| audit.chain | journal digest；seq、previous、hash 顺序 | JOURNAL_CHAIN |
| audit.checkpoint | known checkpoint changed；transition 后检查 | CHECKPOINT_CHANGED |
| audit.rollback | known checkpoint rollback；所有行后 | CHECKPOINT_ROLLBACK |
| audit.fingerprint | journal changed during audit | JOURNAL_CHANGED |
| audit.totals | cost accounting precision exceeded；指纹后 | COST_PRECISION |
| reserve.fields | reserve fields | RESERVE_FIELDS |
| reserve.coordinate | invalid coordinate；字段/枚举/arm-stage-track 约束原顺序 | COORDINATE_INVALID |
| reserve.id | attempt coordinate digest | ATTEMPT_COORDINATE_DIGEST |
| reserve.unique | duplicate generation | DUPLICATE_GENERATION |
| reserve.halted | run halted | RUN_HALTED |
| reserve.inflight | in-flight reservation | INFLIGHT_RESERVATION |
| reserve.cost | invalid cost bound | COST_BOUND_INVALID |
| reserve.totals | cost accounting precision exceeded | COST_PRECISION |
| reserve.calls | fixed schedule exhausted / call budget | SCHEDULE_EXHAUSTED / CALL_BUDGET |
| reserve.available | cost budget | COST_BUDGET |
| reserve.d_answer | D answer missing or unsuccessful | D_ANSWER_UNAVAILABLE |
| reserve.d_digest | D answer digest mismatch | D_ANSWER_DIGEST |
| reserve.non_d | unexpected answer digest | ANSWER_DIGEST_UNEXPECTED |
| reserve.decode | request base64 / request byte budget / request digest | REQUEST_BASE64 / REQUEST_BYTES / REQUEST_DIGEST |
| capture.fields | capture fields | CAPTURE_FIELDS |
| capture.lookup | unreserved attempt | ATTEMPT_UNRESERVED |
| capture.settled | attempt settled | ATTEMPT_SETTLED |
| capture.channel | capture channel | CAPTURE_CHANNEL |
| capture.time | non-monotonic capture time | CAPTURE_TIME |
| capture.decode | capture base64 / capture byte budget / capture digest | CAPTURE_BASE64 / CAPTURE_BYTES / CAPTURE_DIGEST |
| capture.total | channel byte budget；decode 和累计后 | CHANNEL_BYTES |
| settle.fields | settlement fields | SETTLEMENT_FIELDS |
| settle.lookup | unreserved attempt | ATTEMPT_UNRESERVED |
| settle.settled | attempt settled | ATTEMPT_SETTLED |
| settle.value | invalid settlement | SETTLEMENT_INVALID |
| transition.kind | unknown journal event | JOURNAL_KIND |
| api.reserve.coordinate | invalid coordinate；进入锁前 | COORDINATE_INVALID |
| api.reserve.bytes | invalid request bytes / request byte budget | REQUEST_TYPE / REQUEST_BYTES |
| api.capture.bytes | invalid capture bytes / capture byte budget | CAPTURE_TYPE / CAPTURE_BYTES |

decode 内 bytes(Buffer.from(...)) 收到 Buffer，类型拒绝分支在该调用点不可达；
API bytes 的类型拒绝仍可达，不能删除。CHANNEL_BYTES=4 MiB 是原 ledger channel
界，不是允许把 live wire 1 MiB 提高。所有阈值及解码规则维持原值。

## 3. D2、native 和完成失败必须单列

auditDiagnosticCensor 使用一个固定 reject 文本；下表是同一 code 的 provenance
子阶段，不假称原实现已输出这些字段。多故障时沿源码顺序。

| 子阶段 | 原失败/传播 | 候选分类 |
| --- | --- | --- |
| d2.eligibility | policy、uncapped、D/marker/FROZEN-REPLAY | D2_EVIDENCE_REJECTED |
| d2.transport_json | transport chunks JSON.parse 原生异常 | D2_JSON_SYNTAX / NATIVE_UNCLASSIFIED；不是固定 reject |
| d2.unique | pre_send、request、response、terminal 各恰好一个，按此顺序 | D2_EVIDENCE_REJECTED |
| d2.boundary | freeze/coordinate/split/request/terminal-last/HTTP/MIME | D2_EVIDENCE_REJECTED |
| d2.termination | policy/deadline/cleanup/完整性/时间/结局等复合条件 | D2_EVIDENCE_REJECTED |
| d2.digests | wires/deliveries 数量、wire/model/reasoning 长度/hash | D2_EVIDENCE_REJECTED |
| d2.delivery | 相邻 metadata JSON.parse（若执行） | D2_JSON_SYNTAX / NATIVE_UNCLASSIFIED |
| d2.delivery | index/bytes/hash/phase/elapsed 与位置复合条件 | D2_EVIDENCE_REJECTED |
| d2.cleanup | cleanup 时间、generation 在 cleanup 后或 deadline 后 | D2_EVIDENCE_REJECTED |
| d2.decoder | parser.push 的 WireError 或 native 抛出 | D2_DECODER；保留真实 code/message，不伪造 reject |
| d2.final | snapshot 与 model/reasoning/finish/done/usage hash | D2_EVIDENCE_REJECTED |
| setup.fs | mkdir、manifest/journal 创建写入 | IO_INCOMPLETE |
| path/fs/lock | lstat/open 非 EEXIST、read 等原生异常 | IO_INCOMPLETE；绑定具体 phase |
| append.fs | append 抛出、写后 fingerprint 抛出 | IO_INCOMPLETE；可能已部分/全部写入，不能推断未写 |
| lock.close | closeSync 抛出 | CLEANUP_INCOMPLETE；覆盖 fn，unlink 未执行 |
| lock.unlink | unlinkSync 抛出 | CLEANUP_INCOMPLETE；覆盖 fn |
| snapshot.clone | exclusive(replay) 返回后 structuredClone 抛出 | MATERIALIZATION_INCOMPLETE；不是 journal 非法 |
| native.other | Buffer/concat/hash/stringify/clone/遍历/分配等原生异常 | NATIVE_UNCLASSIFIED；保存来源，不猜测语义非法 |
| candidate.scratch | 未来外部 reader 的新 create/read/write/同步/清理异常 | READER_INTERNAL_INCOMPLETE；新失败出口，须另批 |

checkRevisionExecution 的 live authorization mismatch 是 reader 外层准入，维持原样，
不纳入 reader 语义拒绝。当前离线 transactional/binary/poisoned 分支不是冻结 v4，
不能借本合同推广其等价性。原 append catch 清 cache 并 rethrow；此映射不赋予重试、
重发或继续资格。资源不足/宿主退出可能无法生成任何 failure 文件，不能保证必有收据。

## 4. ReaderFailureV1 的编码和证据绑定（候选，未启用）

固定字段：version、phase、stable_code、source_id、profile_sha256、
source_fingerprint_sha256、source_head、record_index、byte_range、cause_raw、
audit_complete=false。source_id 为本轮来源清单的 ASCII id，不复制未限定路径。
指纹 hash 绑定原指纹，原文件/来源清单另行保留并计量；不能用 hash 替代原始证据。

- version<=24、phase<=32、code<=64、source_id<=64 个 ASCII 字符；三个 digest/head
  均为64位 hex 或 null。record/range 为非负安全整数或 null，各最多16位十进制。
- cause_raw 仅保存确实取得的原诊断 string 或 null；不调用任意对象的 toString，
  不截断。cause 无法安全取得就如实缺失，原文件保留，非语义完成。
- 所有字段名/标点、最长固定值、数值/null 的 compact JSON+LF 合计保守 <=1024 B；
  原因文本 r 个 UTF-16 code units 增量 <=6r B。若追加其他诊断/字段须另行核算。
  静态序列化算术核对：最长固定字符串/安全整数、空cause时621 B；null替代空串
  多2 B，仍在该额度内。记录见本轮 `mc-conditional-arithmetic.json`。
- 运行数 n_R 个 failure 文件预算为 `1024*n_R + 6*sum(r)`；n_R 不因576槽自动
  有界，人工重复审计/恢复可新增失败证据。未限定次数/原生 cause 域时总量未闭合。

普通 JSON SyntaxError 的小 message 子域见 MC-N，但完整 D_old 整行源/原文件、
native fs 诊断和保留异常对象的内存不能被这个 envelope 吞掉。位置只记录已证明
范围；LF precheck 与全文件更改检测仍需满足原 precedence 和 S2-R 外部 reader 成本。

## 5. 与旧接口的差异及审核出口

候选增加结构化工程失败元数据，并允许 native 句子不同；原函数当前仍抛 Error，
并没有 ReaderFailureV1。未来适配层必须保留 reject/throw 的控制流，不能返回普通
success 值让 catch 后继续。新增 scratch I/O 失败是额外可观察失败，不是免费等价。
冻结模型 parser 的 parser_errors/score.errors 仍保持原文，不受此合同影响。

本轮完成静态分支表与条件编码；**未证明一个尚未实现的外部 reader 已与 v4 等价**。
成功/失败模拟关系、清理覆盖、深结构/非规范合法输入、新 scratch 失败及确切位置
仍需未来另批的实现符合性验证。所有候选字段、诊断兼容变化及新失败出口仍待批准。
