# ACMI Phase 0.9.13：原文名称线索与 Binding 提示

**结果：`GATE_NOT_MET`。** 字面线索未提高 User 主归属，移除 Binding 提示也未提高；两种处理均不成为默认协议。24/24 原生轮次正常完成，全部同 completion 对账；A 的冻结正文断言 6/8，未过每臂 7/8 的完整协议门槛。

## 设计与证据

沿用 0.9.12 B 的同次生成输出 schema 和 Host decoder。8 个未消费的合成故事分别测试 A：Binding；B：同一 Binding + 名称原文和 UTF-16 区间；C：与 B 相同的原文线索、无 Binding。每个故事的候选、顺序、refs、用户文本相同，各臂独立 Session。B−A 包含线索和解释文本，C−B 只改变 Binding 字段；缺第四臂，不能估计无证据时去 Binding 的效果或交互。提及不是归属；同名候选都保留，匹配器不解释引用、否定或条件。

复用原 Qwen3-14B Q4_K_M、llama.cpp b12283 Vulkan、RTX 3060、隔离 stock dsh 0.2.2-rc.1。24 次真实生成，零重试或事后归属调用；独立 llama.cpp 日志确认 24 次开始。实际请求摘要与冻结 wire 一一对账；C 确实不含 Binding 字段。新增独立的合成 completion sidecar 在原生结算前保存，避免上轮 Journal 失败后只有摘要、没有原始完成记录；sidecar 不入 dsh Journal。

## 结果

| 冻结指标 | A：Binding | B：Binding + 线索 | C：线索 |
| --- | ---: | ---: | ---: |
| 同 completion、原生正常轮 | 8/8 | 8/8 | 8/8 |
| 完整字段无校验警告 | 8/8 | 8/8 | 8/8 |
| User 主归属精确 | 4/8 | 4/8 | 4/8 |
| Assistant 主归属精确 | 4/8 | 4/8 | 4/8 |
| 已有任务 User 精确 / 覆盖 | 2/4、3/4 | 2/4、2/4 | 2/4、2/4 |
| 有错误既有主归属的轮次 | 1 | 0 | 0 |
| 四个非既有场景 User 精确 | 2/4 | 2/4 | 2/4 |
| 新目标身份和名称 | 0/1 | 0/1 | 0/1 |
| 执行意图 / 显式相关任务精确 | 7/8、0/1 | 7/8、0/1 | 7/8、0/1 |
| 正文断言 | 6/8 | 7/8 | 7/8 |

各臂 User 答对的恰好是同四个样例，因此两个配对增益均为 0。错误既有分配在 B/C 减少一例，是一次错指变成了漏标，不是修正：

- **已有、暂不执行：** A 沿用冲突的 Binding，正文和两个角色都标错；B/C 说出了正确任务并标对 Assistant，User 却是 `no_task`。
- **新目标：** 三臂都正确写出新目标名称并输出 `propose`，却都把两个主角色标成 `no_task`。C 还把被明确否定的旧任务标为 related。B 在条件提及样例多标了一个相关任务；二者都不是既有主归属，但不能把零主归属错指解释成全无误导字段。
- **同名歧义：** 三臂正文均用 `whether` 指出印刷/数字二选一，固定断言要求出现 `which`，故全部扣分；没有事后修改断言。正文识别到了歧义，但结构化标签都是 `no_task` 而非 `unresolved`。

## 成本与边界

10,677 输入 + 2,010 输出 = **12,687 tokens**。A/B/C 总量分别 **3,638 / 4,588 / 4,461**（B 比 A +26.1%）；生成 p50 分别 **9,012 / 10,889 / 10,522 ms**。全批生成 p50/p95 **10,522 / 13,918 ms**，总运行 268,579 ms。

24 轮中未观察到 sidecar 泄漏、越界 Graph/Binding/隔离旧 Journal 写入或工具动作。自有 loopback 8980 已退出，既有服务、已安装 dsh、原始用户 Journal 均未触碰；未读现有凭据、未调用外部 Provider。本轮不测试真实工具、Subagent、跨 Session 召回或逐 token streaming。不 Push、不发布 Release、不进入 Phase 1.0。

## 下一步

保留已验证的正文隔离和原始 Call ID 因果链。**不再增加字面提示来弥补工作身份判断。** 下一轮优先区分两种输入：由 Host 捕获的显式用户工作锚点（例如在已授权任务上点击“继续”）与仅有自由文本。前者可以作为当前工作上下文，但不得自动写 Binding；后者由模型输出同次建议或弃权。用全新样本验证否定引用、切换与锚点冲突，以及无锚点时是否安全保留 unresolved。不要用评分真值伪造用户锚点，不以另一个模型作事后 Judge。

## 复现

本地分支 `acmi/phase-0.9.13`；基点 `b0fbb51291a155b2a62e05c4287a4509724e5924`，预注册 `88212ccce8fb5f688cb01d3b45064ae86bb12b52`，冻结运行 `b08e43c19d5de4487884bfb396cb2d32cc7510bb`。构建和回归日志在 `tests/`。模型/运行时哈希见 `evaluation/run-summary.json`。

```powershell
node scripts/phase-0.9.13/score.mjs corpus evaluation replay.json
node scripts/phase-0.9.13/audit-wire.mjs evaluation/generation-ledger.jsonl wire-replay.json
```
