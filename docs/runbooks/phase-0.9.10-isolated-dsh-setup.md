# Phase 0.9.10 隔离 dsh 设置

用 Node 24.16.0 与仓库固定 pnpm 11.28.5，从离线 store 安装：`pnpm install --offline --frozen-lockfile --ignore-scripts`。若机器默认命令是 pnpm 10，使用本机已缓存的 11.28.5；不要升级安装的 dsh。先运行 `pnpm check`；另以 `ACMI_TEST_BUILT=1` 跑 `pnpm exec vitest run integrations/dsh/tests`。实验 fixture 明确挂载 stock 依赖，不使用 CLI 的用户配置。

新 run 目录下单独初始化 DSH_HOME、DSH_AGENTS_HOME、workspace、带 marker 的 Journal 和空 Graph 目录。Host 不提供 Graph writer、Binding writer 或真实外部工具。请求 Auth 只限该 loopback 进程，日志不能打包令牌、环境变量或原始用户 Journal。验收只对实验产生的合成 Journal 做检查，不打开原始 Journal 验证内容。
