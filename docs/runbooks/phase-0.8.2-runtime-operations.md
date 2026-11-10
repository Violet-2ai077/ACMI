# Phase 0.8.2 Runtime operations

1. 使用隔离的 stock `0.2.2-rc.1`、本地脚本 adapter、专用 Journal/Graph
   root 和分开的 read/write grants。不要连接既有 dsh Home。
2. 只从可信 Host 挂载 Supervisor；authorize 必须核对预授权的 Session
   对象/标识，不能使用模型文本或扫描磁盘建立授权。生产默认不启用。
3. 观察 phase、队列高水位、dropped range、last drain/reconcile、retry
   和 pending age。先降载再提高限额；上游 4096 行冷读上限仍有效。
4. 优雅关停时等候 `stop(deadlineMs)`；pending 非零或权限分离时不要报告
   全部已保存。由 Host 关闭 SQLite；按需保留 native Journal 以便恢复。
