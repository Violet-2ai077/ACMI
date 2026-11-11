# Tool Call、Result 与子执行归属传播（实验）

工具动作携带 action ref、Task/WorkNode 和合成查找键。Adapter 分配 ToolCallId，dsh 以该 ID 发出真实 `tool/call`，再用同一 ID 发出 `tool/result`。Host 看到匹配的 ID、工具名和参数才记账；按 Workspace、Session 实例、Call ID 索引。记录 generation、action ref、调用执行和因果事件序号；结果只查来源记录，找不到则 unresolved，不读取到达时 Binding。

Phase 0.9.10 只运行只读 `lookup`。Terminal lookup 使用 stock `concludeTurn()`；普通工具结果后 stock dsh 会再请求模型，这是正常续步。离线协议还验证晚到旧结果、独立 retry ID、未知 ID、不同 Session incarnation、重复/冲突回调。

子执行只接受 Host 提供的真实执行标识映射接口；当前原型只在离线 fixture 测试接口。无论子结果的完成、失败或取消顺序如何，不接受 Result、不消费 Outcome、不满足 Join。
