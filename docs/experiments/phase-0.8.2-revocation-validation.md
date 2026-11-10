# Phase 0.8.2 撤权证据

- 对照组：Phase 0.8.1 既有用例重跑。撤权之后没有新 ACMI Snapshot，
  但实际下一次脚本 adapter 请求仍含原始包哈希。
- 防护组：撤权、过期、Graph/source cut 变化、Provider 注册释放、守卫重挂
  五组各有两个实际候选请求（普通、原生 Compact），可见旧哈希；adapter
  收到零个。随后新 Session 的普通请求可用且不含旧包。
- 原生 Compact 在撤权前可正常完成，其 adapter 实际看到旧哈希；随后退休
  拦住旧 Session，原始 Snapshot event 仍存在。另测首次曝光前退休为零
  Snapshot、零 adapter 请求，且不假称历史数据已删除。
- 独立进程非正常退出后实际 resume 同一 Session；旧 Snapshot 从原始 native
  Journal 重现但无法到达 adapter。新 Session 可经重新授权恢复 Graph 中的任务。
- 在没有父链接和目标 reservation 的 stock seeded Agent 中，仍拦住带完整
  legacy ACMI 标记的复制品；不推断经摘要/改写的副本同样可识别。
- 原 Journal prefix 字节比对相等；测试允许 stock dsh 自身追加新回合或失败
  状态。没有删除、覆写、重排 Journal，也没有真实 Provider 的保留结论。
