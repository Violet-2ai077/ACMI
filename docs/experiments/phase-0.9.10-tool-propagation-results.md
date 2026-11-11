# Tool Call 与结果传播

Source/Built scripted 测试进入真实 stock dsh Agent Loop，发出两条不同 Task/WorkNode 的 lookup 和两条对应原生结果。终止工具场景为一次 scripted 调用；普通非终止工具为两次，第二次是工具执行后的正常原生步骤，并非归属 Judge。

另外离线测试了旧 Task 的结果晚到、错误的 Call ID/Workspace/Session incarnation、独立 retry ID、重复及冲突回调，以及两个子执行乱序完成或取消且不自动接受结果、不满足 Join。这些是 Host 因果逻辑证据，不是模型成功标记或真实运行子代理的证据；历史 stock scheduler 回归与本协议的离线 child ledger 测试也不等于完整原生端到端子代理接入。

真实 Pilot 工具兼容性以 `native-results.jsonl`、`pilot-gate.json` 和确定性评分为准，不由 fixture 补分。
