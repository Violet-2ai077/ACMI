# Phase 0.9.8 本机模型评测复现

预注册见[本机评测协议](../qualification/phase-0.9.8-local-model-preregistration.md)。本轮使用 [Qwen 官方 8B GGUF](https://huggingface.co/Qwen/Qwen3-8B-GGUF) 和 [llama.cpp b12283 Windows Vulkan](https://github.com/ggml-org/llama.cpp/releases/tag/b12283)。须核验发行 ZIP、EXE、GGUF 哈希，见阶段配置；权重和二进制不入 Git/交付 ZIP。输入目录使用 0.9.7 独立核验过的 benchmark，所有摘要必须匹配。

本机运行命令（只在一次授权的新批次执行）：

```powershell
node scripts/phase-0.9.8/run-local.mjs <pinned-exe> <pinned-gguf> <frozen-benchmark-dir> <new-run-dir>
node scripts/phase-0.9.8/score-local.mjs <run-dir> <frozen-benchmark-dir> <new-report.json>
```

推理程序只监听 127.0.0.1，运行时进程不继承用户环境，只允许本地模型文件，结束关闭。模板、tokenize 只是预检，不计为生成；实际发送的 token IDs 就是预检计量对象。先落盘一次性消费标记和逐案 attempt，再调用；如果已经消费，不为复现删除标记或重发旧样本。独立复验应仅用保留的原始本机响应、生成 ledger、预检和冻结输入重跑 scorer。模型温度 0 不保证不同 GPU、驱动、推理 build 的 logits 逐字节相同。

不修正模型的引用坐标，不以请求级 schema 约束代替 0.9.7 的证据与身份评分。不把模型建议写到 Task/Graph。没有云端调用或费用；公开下载只包含运行时和权重，不上传题面。
