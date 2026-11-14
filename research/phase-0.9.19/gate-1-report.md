# ACMI Phase 0.9.19 Gate 1 离线验收报告

日期：2026-11-14，Asia/Shanghai。

**结论：OFFLINE_HARNESS_READY_FOR_OWNER_REVIEW。** 离线实现与定向验证已完成；不是模型研究 GO，也没有进入 Gate 2。

## 实施位置与范围

原生工作树工具将本聊天附加到：

`C:/Users/SiChuchen/.codex/worktrees/model-native-attribution-research/acmi`

该路径替代计划中的建议 E: 路径，未移动既有 checkout。源变更全部位于 research/phase-0.9.19，主仓库 E:/codex-prj/ACMI/acmi 保持干净，HEAD 仍为 9db1ee7da8209363a1fd76f3bebc83f75dfe9c9d。没有修改生产接口、提交、合并或推送；工作树处于 detached HEAD，变更保留供审核。

## 已实现

- C1/C2/C3 的确定性公开输入构造；C2/C3 不接收 Host 当前状态投影。
- A Structured Sidecar、B Inline 的封闭 schema、重复键/引用/帧检查和正文增量投影。
- 与 wire parser 分离的原始输出 reader，六类操作、UUID 出生映射、UNRESOLVED 和状态七字段族评分。
- CLOSED-LOOP 身份连续性；FROZEN-REPLAY 从冻结出生坐标与可见原始历史标记建立身份映射，不反馈模型。
- 发送前持久化请求和调用预留；原始输出、chunk、实际可见文本、解析错误、usage/时间字段及 hash 链。
- 独立进程 checkpoint 恢复，损坏/跨 scope 拒绝，不用真值修正历史。
- A/B/C0 单次调用限制；D 只允许开发两阶段，失败不重试，不写主提案账本。
- 条件分开的 JSON/Markdown 报告、18 格支持数、SM 主题、D 附表和工程/统计风险边界。

## 验证结果

| 检查 | 实测结果 |
| --- | --- |
| 本研究离线测试 | 37 passed，0 failed，0 skipped |
| .mjs 语法检查 | 21 个文件通过 |
| A/B 流式边界 | 有效 fixture 的每个单字节切分点、逐字节输入都通过；中文、转义、字面 marker、截断反例覆盖 |
| 连续性全链路 | 3 条件 × 2 协议 × 8 turn，共 48 次 fake generation；第四轮后独立进程恢复 |
| 状态反例 | C3-B 第八轮 UUID 正确，但过时验收状态被判错；不能以身份成绩掩盖状态失败 |
| CLI 重评分 | 同一原始归档重算两次，JSON 字节一致 |
| 既有 model-transport 定向回归 | 7 passed，0 failed |
| diff whitespace | git diff --check 通过 |
| 正式模型/provider 调用 | 0 |

以上“生成”均为脚本 fake transport，不是 LLM。全链路控制 fixture 的满分是测试预期，不是模型准确率。既有 model-transport 回归使用自己的临时合成 loopback HTTP server；没有连接实际模型服务或正式 Host。

## 证据

- 测试、重评分和报告目录：`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-1/acceptance-49e565c823/`
- 原始闭环归档：`E:/codex-prj/ACMI/verification/phase-0.9.19/gate-1/e2e-au7XOa/`
- 全量测试日志：acceptance 目录内 research-tests-acceptance.txt。
- 既有定向回归日志：baseline-model-transport.txt。
- 两次重评分：acceptance-rescore-1.json、acceptance-rescore-2.json。
- 两份重评分共同 SHA-256：`AB4B44E363E2FC740ED2C70AAAC2A7FEE7CF4296AE37F1322FA5096253A8EF93`。
- 最终源码差异与文件摘要：gate-1-source-acceptance.patch、source-manifest-acceptance.json。

所有早期失败测试与迭代证据未覆盖删除；最终证据路径以上述目录为准。

## 自查修复与验证限制

自查先加入失败回归，再修正了：非标准 JSON 空白、活动目标一致性、请求迟于生成才存档、重启后调用预算重置、oracle 未钉摘要、生命周期完成漏计、额外任务状态过度计分、replay 历史出生映射和操作顺序丢失。普通 schema 无效输出保留原始证据、不采纳状态，但不阻断下一轮；C1 保留最后有效投影，C2/C3 不注入该投影。没有独立评审代理，本报告不把自查称为独立评审。

历史 phase-0.9.16 回归因新工作树没有 integrations/dsh/dist 产物未启动成功；离线 frozen pnpm 安装因缓存缺少 tarball 失败，没有改为联网下载。因此**完整仓库回归仍未验证**，不能用 7 个定向用例代替。

通用质量/安全扫描器没有识别 .mjs，报告 files_scanned=0，不能算代码扫描通过。模块文档存在性检查通过，但也提示不识别源码布局；另行执行了 Node 语法检查、导入/写入边界自查和针对性安全回归。

正式场景语料、人工审定、真实 prompt、live transport、模型归属/发现/维护能力、真实 Streaming、Token 开销/延迟、确认性统计区间以及生产集成均未验证。当前代码 fixture 只是测试向量，不是已冻结的正式验证集。

## 下一关卡

现在暂停等待 Owner 审核。Gate 2 必须另行审批 live adapter、模型快照、路由、隔离配置与有限开发预算；不自动启动 576 次开发调用，更不运行 8,640 次确认性候选方案。
