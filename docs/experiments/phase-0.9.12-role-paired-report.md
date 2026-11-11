# ACMI Phase 0.9.12：角色归属与执行意图配对实验

**结论：不采纳 B 为默认协议。** 两臂 10 组基础配对均完成，原生工具因果链通过。B 让相关任务和执行意图可独立验证，但主归属不达标。真实换位/改名阶段因实验适配器的 Windows Session ID 失败而停止；总体为 `INCONCLUSIVE_STOPPED`，不是完整资格通过。

## 设计与实际运行

A 使用 Phase 0.9.11 的 wire 和语义等价的 Host 解码路径；B 使用互斥的既有/新目标/无任务/弃权选择、明确的 whole-task 候选、独立意图和 Assistant `primary + related`。模型只见授权短引用。A/B 同题、同候选和 Binding，顺序交替。B 的多项变化捆绑比较，不能给任何单一变化归因。只使用原 Qwen3-14B Q4_K_M、llama.cpp b12283 Vulkan、RTX 3060、隔离 stock dsh 0.2.2-rc.1。没有事后归属模型，原生工具总结的两步都在正常 Agent Loop。

| 基础配对指标 | A | B |
| --- | ---: | ---: |
| 正常原生轮次 | 10/10 | 10/10 |
| 冻结回答断言 | 8/9 | 9/9 |
| 无校验警告的完整归属字段 | 3/10 | 10/10 |
| User 归属精确 | 7/10 | 6/10 |
| Assistant 主归属精确 | 5/10 | 7/10 |
| 既有 User 覆盖 | 6/7 | 5/7 |
| 有既有身份错指的轮次 | 3 | 1 |
| 把既有任务误判为新目标的轮次 | 1 | 0 |
| 执行意图、相关任务 | 不支持 | 10/10、3/3 |
| 原生动作 / Result 因果正确 | 2/2、2/2 | 2/2、2/2 |

主归属的合计增益为 **+1/20**，低于预注册的 +2；B 的 User、Assistant 主归属、覆盖和零错指也未过线。两组工具均真实观测到第二个工具体先返回，stock dsh 仍按发起顺序提交 Journal；工具体和 Journal 结果分别按原始 Call ID 与来源事件关联。20 个已对账基础轮没有观察到 sidecar 泄漏、越界写入或未预期工具。

## 失败在哪里

- B 在两个「已有工作、暂不执行」样例中都识别正确，A 只对一个；但 B 仍在一个 task-only 样例把 User 标成 `no_task`，同时正确标记 Assistant。
- B 识别出了新目标样例的 `propose` 意图并写对可见名称，但 User/Assistant 都选择了 `no_task`。**格式合法和意图正确都不能保证身份判断正确。**
- B 能把三个多任务样例的次要任务标对；一个显式多任务样例中 User 与 Assistant 主归属仍为 `no_task`，另一个 User 错选了恰好与 Binding 一致的背景任务。后一例不能单独证明 Binding 导致错选。
- 另做了不计分的确定性诊断：用户文本中恰好命中一个完整候选名称时才返回身份，10 例只覆盖 3 例、3 例均正确，其中一例是 B 的漏标。这个低覆盖的小样本不是路由资格。下一轮值得比较**生成前由 Host 提供可核验的名称与来源线索**和有无 Binding 提示，而不是继续扩大 JSON；必须另纳入否定、引用、同名和多任务冲突负例。线索只用于提案，不写 Binding。

## 变体中止及离线修复

第 23 次生成是第一个 B 换位样例，后端 completion 有票据，但隔离 Journal 回执缺失；最后一个改名样例未生成。冻结 fixture 对带两个冒号的实验 ID 只替换了第一个，Windows 上 Session 无法通过文件归属检查。用 stock dsh 的 scripted 用例复现同一错误，修复为规范化所有分隔符并在创建 Session 前验证名称。Source/Built 回归通过；未补跑或替换真实结果。不把变体记作归属失败或成功，也不能确认那条未对账 completion 的 Journal 边界。

## 运行成本与交付

完整运行尝试 23 次，后端记录完成 23 次，其中 22 次（20 个基础请求加 2 个工具续步）有独立原生同次生成证据。输入 7,889 + 输出 1,904 = **9,793 tokens**；全批生成 p50/p95 **9,694 / 20,631 ms**。基础批 A/B 各 11 次（含原生工具续步），总 Token **4,030 / 5,297**（B +31.4%）；生成 p50 **8,344 / 11,360 ms**。一次性 loopback 5975 已退出；未访问原始用户 Journal、云端 Provider 或现有凭据；未修改安装 dsh、Graph、Binding、子结果接受或 Join。未测试真实 Subagent、跨 Session 召回和逐 token streaming。

本地分支 `acmi/phase-0.9.12`；基点 `ab4362b9862670bd68fd567788543e0c74b8a966`，预注册 `27cbe6597d637ee4d8a971fc2e700795ffc68625`，冻结真实入口 `6f934cb5f8cd2824aae8b7dd6f578962a8e3345a`，离线路径修复 `e4d6e110cc1d949aedb8420b344fe10263c24e36`。完整测试和独立复放见交付 `tests/`。无 Push、Release 或 Phase 1.0。

离线复放，不启动模型：

```powershell
node scripts/phase-0.9.12/score.mjs corpus evaluation replay.json
node scripts/phase-0.9.12/diagnose.mjs corpus replay.json diagnostic-replay.json
```
