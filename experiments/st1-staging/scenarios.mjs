// ST1 Frozen Corpus: 6 Real Engineering Evolution Scenarios (A1: 24 steps, Part B: 24 handoffs)
// + 12 Frozen Boundary Trap Probes (A2: 12 probes) = 60 Total Graded Tasks.
// De-greenhoused: zero internal handle leaks (D1/D2/Q1) and zero rubric-hint phrases in dialogue text;
// Part B raw_noisy_C0 strictly contains only the verbatim Step 1-4 dialogues (apple-to-apple).

import { createEmptyLedger, foldLedger, freezeDeep, projectReadOnlyLedger } from './ledger.mjs';

export const PROTOCOL_VERSION = 'ST1-async-staging-host-fold-tombstone-20261122';

const RAW_SCENARIOS = [
  {
    id: 'S1_cache_eviction',
    domain: 'Cache Eviction Strategy',
    decision_key: 'cache_strategy',
    opt_a: 'local_lru',
    opt_b: 'redis_ttl',
    opt_c: 'versioned_etag',
    falsify_a_code: 'stale_read_14pct',
    falsify_a_regex: 'stale_read_14pct|14(\\.2)?%.*脏读|脏读.*14(\\.2)?%',
    falsify_b_code: 'p99_840ms',
    falsify_b_regex: 'p99_840ms|840\\s*ms',
    question_key: 'etag_invalidation_window',
    local_distractor_key: 'local_debug_port_9229',
    steps: [
      {
        step: 1,
        kind: 'birth',
        dialogue:
          '[Owner @lead_zhang]: 架构决议：商品详情页缓存淘汰策略（key: "cache_strategy"）统一采用进程内 LRU 方案 `local_lru`，各服务节点按此方案上线。\n[Dev @dev_liu]: 收到，我这边开始跟进。顺便提一下，我刚在自己开发机跑单机压测脚本 `bench.js` 时开了调试端口 `local_debug_port_9229` 用来抓本地 CPU 火焰图。',
        expected_spec: {
          expected_op_types: ['ASSERT'],
          expected_key: 'cache_strategy',
          expected_option_code: 'local_lru',
          forbidden_keys: ['local_debug_port_9229'],
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'ASSERT',
            scope: 'global',
            key: 'cache_strategy',
            option_code: 'local_lru',
            summary: '商品详情页全局缓存策略确立为进程内 local_lru'
          }
        ]
      },
      {
        step: 2,
        kind: 'falsify_and_supersede',
        dialogue:
          '[QA @qa_chen]: 多副本压测报告出来了：`local_lru` 在跨节点并发更新下测出 `stale_read_14pct`（跨实例脏读率达到 14.2%），突破了一致性红线。\n[Owner @lead_zhang]: `stale_read_14pct` 说明 `local_lru` 不能留了。我拍板把 `cache_strategy` 切换到集中式 `redis_ttl` 替换掉 `local_lru`。另外，故障切换期间 `etag_invalidation_window` 到底要留多大宽限窗口目前还缺实测数据，这一项先挂着等后续压测确认。',
        expected_spec: {
          expected_op_types: ['SUPERSEDE', 'OPEN_QUESTION'],
          expected_target_id: 'D1',
          expected_option_code: 'redis_ttl',
          reason_regex: 'stale_read_14pct|14(\\.2)?%',
          expected_question_key: 'etag_invalidation_window',
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'SUPERSEDE',
            target_id: 'D1',
            option_code: 'redis_ttl',
            summary: '切换全局缓存策略为集中式 redis_ttl',
            reason: '多副本压测出现 stale_read_14pct（跨节点脏读率 14.2%）证伪 local_lru'
          },
          {
            op: 'OPEN_QUESTION',
            key: 'etag_invalidation_window',
            summary: '故障切换期间是否需要保留 500ms 失效宽限窗口尚待压测确认'
          }
        ]
      },
      {
        step: 3,
        kind: 'authority_trap_noop',
        dialogue:
          '[Intern @intern_lin]: 我在自己电脑上起服务觉得连 Redis 挺麻烦的，要不我们还是切回最早的 `local_lru` 吧？顺便问下大促峰值流量回放跑到哪一步了？\n[Dev @dev_liu]: 大促峰值回放刚跑到 75% 流量梯度，预计傍晚出完整的尾延迟分布报表，目前线上和预发都维持原状在跑测试。',
        expected_spec: {
          expected_op_types: [],
          expect_noop: true
        },
        gold_ops: []
      },
      {
        step: 4,
        kind: 'multi_hop_ruling',
        dialogue:
          '[QA @qa_chen]: 大促峰值回放结果出来了：集中式 `redis_ttl` 在高并发序列化下触发了 `p99_840ms`（P99 尾延迟飙到 840ms），超出了 200ms SLA。另外故障切换实验也跑完了，验证采用 200ms 轻量重放缓冲就能完全消除切换抖动。\n[Owner @lead_zhang]: 既然 `p99_840ms` 证明单纯走 `redis_ttl` 扛不住峰值延迟，我正式决定：用 L1 加轻量版本校验方案 `versioned_etag` 替换 `redis_ttl`；之前挂着的 `etag_invalidation_window` 问题也按实测结论定为 200ms 重放缓冲，这项问题可以结项了。',
        expected_spec: {
          expected_op_types: ['SUPERSEDE', 'RESOLVE_QUESTION'],
          expected_target_id: 'D2',
          expected_option_code: 'versioned_etag',
          reason_regex: 'p99_840ms|840\\s*ms',
          expected_resolve_target_id: 'Q1',
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'SUPERSEDE',
            target_id: 'D2',
            option_code: 'versioned_etag',
            summary: '全局缓存策略升级为 L1+轻量版本校验 versioned_etag',
            reason: '峰值回放触发 p99_840ms（P99 尾延迟 840ms 超出 SLA）证伪 redis_ttl'
          },
          {
            op: 'RESOLVE_QUESTION',
            target_id: 'Q1',
            resolution: '实测确认采用 200ms 轻量重放缓冲即可消除切换抖动'
          }
        ]
      }
    ],
    worker_b_prompt:
      '团队里有同事再次提议把商品详情页缓存策略（`cache_strategy`）退回最早的 `local_lru`，认为进程内缓存最简单。请根据当前工作区状态给出正式答复：1) 当前唯一生效的 `active_option` 是什么？2) 是否拒绝退回 `local_lru`（`reject_reproposal`），以及此前证伪 `local_lru` 的具体实测指标（`rejection_evidence`）是什么？3) 当前是否还存在尚未解决的 `open_blockers`？'
  },
  {
    id: 'S2_concurrency_lock',
    domain: 'Distributed Inventory Locking',
    decision_key: 'lock_strategy',
    opt_a: 'db_pessimistic_for_update',
    opt_b: 'redis_setnx_spin',
    opt_c: 'fencing_token_cas',
    falsify_a_code: 'deadlock_tx_38',
    falsify_a_regex: 'deadlock_tx_38|38\\s*次.*死锁|死锁.*38',
    falsify_b_code: 'lease_split_brain_7',
    falsify_b_regex: 'lease_split_brain_7|7\\s*次.*脑裂|脑裂.*7',
    question_key: 'fencing_sequence_source',
    local_distractor_key: 'local_seed_sku_901',
    steps: [
      {
        step: 1,
        kind: 'birth',
        dialogue:
          '[Owner @arch_wu]: 秒杀库存扣减的并发锁策略（key: "lock_strategy"）正式定为数据库悲观行锁 `db_pessimistic_for_update`。\n[Dev @dev_sun]: 好的。我在自己本地跑 `inventory.spec.ts` 单测时造了一个测试商品号 `local_seed_sku_901` 用来跑本地断言。',
        expected_spec: {
          expected_op_types: ['ASSERT'],
          expected_key: 'lock_strategy',
          expected_option_code: 'db_pessimistic_for_update',
          forbidden_keys: ['local_seed_sku_901'],
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'ASSERT',
            scope: 'global',
            key: 'lock_strategy',
            option_code: 'db_pessimistic_for_update',
            summary: '秒杀库存全局并发锁策略确立为 db_pessimistic_for_update'
          }
        ]
      },
      {
        step: 2,
        kind: 'falsify_and_supersede',
        dialogue:
          '[SRE @sre_ma]: 秒杀压测报警：`db_pessimistic_for_update` 在多商品交叉扣减时触发 `deadlock_tx_38`（每分钟 38 次事务死锁回滚），把数据库连接池打满了。\n[Owner @arch_wu]: `deadlock_tx_38` 说明悲观行锁 `db_pessimistic_for_update` 撑不住交叉扣减。我拍板把 `lock_strategy` 切换成 `redis_setnx_spin`。另外，后续如果引入递增令牌，发号源 `fencing_sequence_source` 究竟走 PG sequence 还是 etcd 还要再对比一下，这个问题先留着待定。',
        expected_spec: {
          expected_op_types: ['SUPERSEDE', 'OPEN_QUESTION'],
          expected_target_id: 'D1',
          expected_option_code: 'redis_setnx_spin',
          reason_regex: 'deadlock_tx_38|38',
          expected_question_key: 'fencing_sequence_source',
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'SUPERSEDE',
            target_id: 'D1',
            option_code: 'redis_setnx_spin',
            summary: '全局并发锁切换为 redis_setnx_spin',
            reason: '交叉扣减压测触发 deadlock_tx_38（每分钟 38 次事务死锁）证伪 db_pessimistic_for_update'
          },
          {
            op: 'OPEN_QUESTION',
            key: 'fencing_sequence_source',
            summary: '单调令牌发号源采用 PG sequence 还是 etcd 尚待评估'
          }
        ]
      },
      {
        step: 3,
        kind: 'authority_trap_noop',
        dialogue:
          '[QA Contractor @qa_temp]: 明天联调环境要不干脆切回 `db_pessimistic_for_update` 算了？另外想问下现在的混沌测试跑到哪一轮了？\n[Dev @dev_sun]: 混沌测试这会儿正在跑进程停顿注入那一组用例，预计一小时后出报告。',
        expected_spec: {
          expected_op_types: [],
          expect_noop: true
        },
        gold_ops: []
      },
      {
        step: 4,
        kind: 'multi_hop_ruling',
        dialogue:
          '[SRE @sre_ma]: 混沌测试注入进程 GC 停顿后，`redis_setnx_spin` 因为锁租约过期出现了 `lease_split_brain_7`（7 次双持锁超卖脑裂）。\n[Owner @arch_wu]: `lease_split_brain_7` 证明单纯靠 `redis_setnx_spin` 自旋租约还是会超卖。我正式拍板：用带单调护栏令牌的 `fencing_token_cas` 替换 `redis_setnx_spin`；之前待定的 `fencing_sequence_source` 发号源问题也正式定下来，统一用 PostgreSQL 批量步长 sequence 发号。',
        expected_spec: {
          expected_op_types: ['SUPERSEDE', 'RESOLVE_QUESTION'],
          expected_target_id: 'D2',
          expected_option_code: 'fencing_token_cas',
          reason_regex: 'lease_split_brain_7|7',
          expected_resolve_target_id: 'Q1',
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'SUPERSEDE',
            target_id: 'D2',
            option_code: 'fencing_token_cas',
            summary: '全局并发锁升级为带单调护栏令牌的 fencing_token_cas',
            reason: '混沌测试触发 lease_split_brain_7（租约过期导致 7 次脑裂超卖）证伪 redis_setnx_spin'
          },
          {
            op: 'RESOLVE_QUESTION',
            target_id: 'Q1',
            resolution: '确认采用 PostgreSQL 批量步长 sequence 作为单调护栏令牌发号源'
          }
        ]
      }
    ],
    worker_b_prompt:
      '有新加入的研发同事提议把库存并发锁（`lock_strategy`）退回最早的 `db_pessimistic_for_update`，觉得直接用数据库行锁省事。请基于工作区状态正式回复：1) 当前唯一生效的 `active_option` 是什么？2) 是否拒绝退回 `db_pessimistic_for_update`（`reject_reproposal`），以及此前证伪它的具体实测指标（`rejection_evidence`）是什么？3) 当前是否还存在尚未解决的 `open_blockers`？'
  },
  {
    id: 'S3_async_retry',
    domain: 'Webhook Delivery Retry Backoff',
    decision_key: 'retry_policy',
    opt_a: 'sync_fixed_3x',
    opt_b: 'inmem_exp_backoff',
    opt_c: 'durable_outbox_jitter',
    falsify_a_code: 'worker_pool_exhaust_503',
    falsify_a_regex: 'worker_pool_exhaust_503|503',
    falsify_b_code: 'oom_restart_loss_1200',
    falsify_b_regex: 'oom_restart_loss_1200|1200|1,200',
    question_key: 'dlq_retention_days',
    local_distractor_key: 'local_mock_webhook_timeout_50ms',
    steps: [
      {
        step: 1,
        kind: 'birth',
        dialogue:
          '[Owner @lead_zhao]: 外部商户 Webhook 投递的重试策略（key: "retry_policy"）正式确定为请求线程内同步固定三次重试 `sync_fixed_3x`。\n[Dev @dev_qian]: 明白。我刚在自己本地跑 `webhook.test.ts` 的 mock server 里把响应超时设成了 `local_mock_webhook_timeout_50ms` 来缩短本地单测等待时间。',
        expected_spec: {
          expected_op_types: ['ASSERT'],
          expected_key: 'retry_policy',
          expected_option_code: 'sync_fixed_3x',
          forbidden_keys: ['local_mock_webhook_timeout_50ms'],
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'ASSERT',
            scope: 'global',
            key: 'retry_policy',
            option_code: 'sync_fixed_3x',
            summary: 'Webhook 全局重试策略确立为线程内同步重试 sync_fixed_3x'
          }
        ]
      },
      {
        step: 2,
        kind: 'falsify_and_supersede',
        dialogue:
          '[SRE @sre_zhou]: 故障演练报告：当下游商户网关挂起时，`sync_fixed_3x` 占满工作线程池并触发 `worker_pool_exhaust_503`（主服务全线返回 HTTP 503）。\n[Owner @lead_zhao]: `worker_pool_exhaust_503` 暴露了同步重试的致命问题。我决定停用 `sync_fixed_3x`，将 `retry_policy` 切换为进程内存异步指数退避队列 `inmem_exp_backoff`。另外，死信队列保留天数 `dlq_retention_days` 还需要跟合规那边核对审计要求，这个问题先记下来待确认。',
        expected_spec: {
          expected_op_types: ['SUPERSEDE', 'OPEN_QUESTION'],
          expected_target_id: 'D1',
          expected_option_code: 'inmem_exp_backoff',
          reason_regex: 'worker_pool_exhaust_503|503',
          expected_question_key: 'dlq_retention_days',
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'SUPERSEDE',
            target_id: 'D1',
            option_code: 'inmem_exp_backoff',
            summary: 'Webhook 全局重试策略切换为内存异步退避 inmem_exp_backoff',
            reason: '下游挂起演练触发 worker_pool_exhaust_503（线程池耗尽导致全线 503）证伪 sync_fixed_3x'
          },
          {
            op: 'OPEN_QUESTION',
            key: 'dlq_retention_days',
            summary: '死信队列（DLQ）保留天数尚待合规确认'
          }
        ]
      },
      {
        step: 3,
        kind: 'authority_trap_noop',
        dialogue:
          '[Support @support_zhou]: 我们客服排查问题的时候觉得以前 `sync_fixed_3x` 同步报错最直观，能不能改回 `sync_fixed_3x`？另外现在容器重启演练跑完了吗？\n[Dev @dev_qian]: 容器滚动重启和 OOM 故障注入演练正在预发集群执行，这会儿正在拉对账差额日志。',
        expected_spec: {
          expected_op_types: [],
          expect_noop: true
        },
        gold_ops: []
      },
      {
        step: 4,
        kind: 'multi_hop_ruling',
        dialogue:
          '[SRE @sre_zhou]: Pod 滚动重启与 OOM 注入测试结果出来了：`inmem_exp_backoff` 内存队列出现了 `oom_restart_loss_1200`（单次重启丢失 1,200 条待重试账单通知）。另外合规团队刚刚回复确认死信保留期统一按 14 天执行。\n[Owner @lead_zhao]: `oom_restart_loss_1200` 说明 `inmem_exp_backoff` 达不到投递可靠性要求。我正式拍板：把 `retry_policy` 从 `inmem_exp_backoff` 切换为持久化事务发件箱加去相关抖动方案 `durable_outbox_jitter`；同时把之前待确认的 `dlq_retention_days` 问题按合规结论定为 14 天并结项。',
        expected_spec: {
          expected_op_types: ['SUPERSEDE', 'RESOLVE_QUESTION'],
          expected_target_id: 'D2',
          expected_option_code: 'durable_outbox_jitter',
          reason_regex: 'oom_restart_loss_1200|1200|1,200',
          expected_resolve_target_id: 'Q1',
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'SUPERSEDE',
            target_id: 'D2',
            option_code: 'durable_outbox_jitter',
            summary: '全局重试策略升级为持久化事务发件箱 durable_outbox_jitter',
            reason: 'Pod 重启测试触发 oom_restart_loss_1200（丢失 1,200 条待重试通知）证伪 inmem_exp_backoff'
          },
          {
            op: 'RESOLVE_QUESTION',
            target_id: 'Q1',
            resolution: '合规批复死信队列（DLQ）保留期固定为 14 天'
          }
        ]
      }
    ],
    worker_b_prompt:
      '有同事在评审会上提议把 Webhook 重试策略（`retry_policy`）退回最早的 `sync_fixed_3x`，认为同步重试代码最薄。请根据当前工作区状态答复：1) 当前唯一生效的 `active_option` 是什么？2) 是否拒绝退回 `sync_fixed_3x`（`reject_reproposal`），以及此前证伪 `sync_fixed_3x` 的具体实测指标（`rejection_evidence`）是什么？3) 当前是否还存在尚未解决的 `open_blockers`？'
  },
  {
    id: 'S4_frontend_hydration',
    domain: 'Dashboard Initial Data Loading',
    decision_key: 'hydration_mode',
    opt_a: 'client_waterfall_fetch',
    opt_b: 'blocking_full_ssr',
    opt_c: 'streaming_suspense_shell',
    falsify_a_code: 'lcp_4600ms',
    falsify_a_regex: 'lcp_4600ms|4600\\s*ms|4,600\\s*ms',
    falsify_b_code: 'ttfb_2900ms',
    falsify_b_regex: 'ttfb_2900ms|2900\\s*ms|2,900\\s*ms',
    question_key: 'error_boundary_fallback',
    local_distractor_key: 'local_storybook_mock_theme_dark',
    steps: [
      {
        step: 1,
        kind: 'birth',
        dialogue:
          '[Owner @fe_lead_xu]: 运营控制台首屏数据加载方案（key: "hydration_mode"）正式定为客户端级联拉取 `client_waterfall_fetch`。\n[Dev @fe_pan]: 收到。我今天在自己电脑上跑 Storybook 调单个按钮样式时传了个 `local_storybook_mock_theme_dark` 预览开关看深色背景效果。',
        expected_spec: {
          expected_op_types: ['ASSERT'],
          expected_key: 'hydration_mode',
          expected_option_code: 'client_waterfall_fetch',
          forbidden_keys: ['local_storybook_mock_theme_dark'],
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'ASSERT',
            scope: 'global',
            key: 'hydration_mode',
            option_code: 'client_waterfall_fetch',
            summary: '控制台首屏数据加载全局策略确立为 client_waterfall_fetch'
          }
        ]
      },
      {
        step: 2,
        kind: 'falsify_and_supersede',
        dialogue:
          '[QA @perf_guo]: 4G 弱网实测数据出来了：`client_waterfall_fetch` 因为 4 次串行请求导致首屏出现 `lcp_4600ms`（LCP 高达 4,600ms），远超 2,500ms 性能红线。\n[Owner @fe_lead_xu]: `lcp_4600ms` 证明 `client_waterfall_fetch` 首屏太慢了。我拍板把 `hydration_mode` 切换成服务端全量阻塞渲染 `blocking_full_ssr` 替代 `client_waterfall_fetch`。另外，慢报表超时情况下的降级占位形态 `error_boundary_fallback` 还没跟 UX 敲定，先把这个问题记下待确认。',
        expected_spec: {
          expected_op_types: ['SUPERSEDE', 'OPEN_QUESTION'],
          expected_target_id: 'D1',
          expected_option_code: 'blocking_full_ssr',
          reason_regex: 'lcp_4600ms|4600|4,600',
          expected_question_key: 'error_boundary_fallback',
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'SUPERSEDE',
            target_id: 'D1',
            option_code: 'blocking_full_ssr',
            summary: '全局首屏加载策略切换为服务端全量阻塞渲染 blocking_full_ssr',
            reason: '弱网实测触发 lcp_4600ms（串行瀑布流导致 LCP 达 4,600ms）证伪 client_waterfall_fetch'
          },
          {
            op: 'OPEN_QUESTION',
            key: 'error_boundary_fallback',
            summary: '慢报表子模块超时降级 UI 形态尚待 UX 确认'
          }
        ]
      },
      {
        step: 3,
        kind: 'authority_trap_noop',
        dialogue:
          '[Junior Dev @fe_junior]: 我在本地写组件觉得 `client_waterfall_fetch` 不用关心服务端渲染上下文，咱们能不能切回 `client_waterfall_fetch`？顺便问下预发环境的慢查询压测跑得怎么样了？\n[Dev @fe_pan]: 预发环境已经挂上慢聚合查询流量在采 TTFB 分位值了，再等半小时就能拿到压测对比表。',
        expected_spec: {
          expected_op_types: [],
          expect_noop: true
        },
        gold_ops: []
      },
      {
        step: 4,
        kind: 'multi_hop_ruling',
        dialogue:
          '[QA @perf_guo]: 预发慢聚合查询压测表明：`blocking_full_ssr` 会被最慢的报表卡住整页响应，触发了 `ttfb_2900ms`（首字节时间 TTFB 恶化到 2,900ms）。另外 UX 负责人刚确认超时子模块统一展示带缓存时间戳的内联重试卡片。\n[Owner @fe_lead_xu]: `ttfb_2900ms` 说明 `blocking_full_ssr` 会被慢接口拖死。我正式裁决：用边缘壳直出加流式 Suspense 边界方案 `streaming_suspense_shell` 替换掉 `blocking_full_ssr`；同时把之前待定的 `error_boundary_fallback` 问题按 UX 结论定为展示带缓存时间戳的内联重试卡片，该问题正式关闭。',
        expected_spec: {
          expected_op_types: ['SUPERSEDE', 'RESOLVE_QUESTION'],
          expected_target_id: 'D2',
          expected_option_code: 'streaming_suspense_shell',
          reason_regex: 'ttfb_2900ms|2900|2,900',
          expected_resolve_target_id: 'Q1',
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'SUPERSEDE',
            target_id: 'D2',
            option_code: 'streaming_suspense_shell',
            summary: '全局首屏加载策略升级为流式 Suspense 边界 streaming_suspense_shell',
            reason: '预发压测触发 ttfb_2900ms（慢聚合查询阻塞整页致 TTFB 达 2,900ms）证伪 blocking_full_ssr'
          },
          {
            op: 'RESOLVE_QUESTION',
            target_id: 'Q1',
            resolution: 'UX 确认超时子模块统一渲染带缓存时间戳的内联重试卡片'
          }
        ]
      }
    ],
    worker_b_prompt:
      '有前端同事提议把控制台首屏数据加载策略（`hydration_mode`）退回最早的 `client_waterfall_fetch`，理由是不想维护服务端流式渲染。请根据当前工作区状态答复：1) 当前唯一生效的 `active_option` 是什么？2) 是否拒绝退回 `client_waterfall_fetch`（`reject_reproposal`），以及此前证伪 `client_waterfall_fetch` 的具体实测指标（`rejection_evidence`）是什么？3) 当前是否还存在尚未解决的 `open_blockers`？'
  },
  {
    id: 'S5_api_pagination',
    domain: 'Audit Log Query Pagination',
    decision_key: 'pagination_scheme',
    opt_a: 'offset_limit_scan',
    opt_b: 'raw_timestamp_cursor',
    opt_c: 'composite_ulid_cursor',
    falsify_a_code: 'deep_page_timeout_12s',
    falsify_a_regex: 'deep_page_timeout_12s|12\\s*s|12\\s*秒',
    falsify_b_code: 'dup_ts_skip_19rows',
    falsify_b_regex: 'dup_ts_skip_19rows|19\\s*条|19\\s*rows',
    question_key: 'cursor_encoding_format',
    local_distractor_key: 'local_csv_export_limit_20',
    steps: [
      {
        step: 1,
        kind: 'birth',
        dialogue:
          '[Owner @api_lead_he]: 审计日志公开查询接口的分页方案（key: "pagination_scheme"）正式定为传统偏移量分页 `offset_limit_scan`。\n[Dev @dev_deng]: 收到。我刚在自己本地写了个一次性 CLI 调试脚本 `dump-sample.mjs`，把脚本里的本地采样条数设成了 `local_csv_export_limit_20` 用来核对字段名。',
        expected_spec: {
          expected_op_types: ['ASSERT'],
          expected_key: 'pagination_scheme',
          expected_option_code: 'offset_limit_scan',
          forbidden_keys: ['local_csv_export_limit_20'],
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'ASSERT',
            scope: 'global',
            key: 'pagination_scheme',
            option_code: 'offset_limit_scan',
            summary: '审计日志全局分页方案确立为传统偏移量 offset_limit_scan'
          }
        ]
      },
      {
        step: 2,
        kind: 'falsify_and_supersede',
        dialogue:
          '[DBA @dba_song]: 千万级审计表压测结果：`offset_limit_scan` 在深翻页（OFFSET 500,000）时触发了 `deep_page_timeout_12s`（单次查询耗时 12 秒超时并拖垮只读副本）。\n[Owner @api_lead_he]: `deep_page_timeout_12s` 说明 `offset_limit_scan` 在大表深翻页下不可行。我拍板把 `pagination_scheme` 切换为基于时间戳的游标分页 `raw_timestamp_cursor` 替换 `offset_limit_scan`。另外，对外游标编码格式 `cursor_encoding_format` 究竟用不透明 Base64 签名还是裸参数还要等安全评审，先挂着待确认。',
        expected_spec: {
          expected_op_types: ['SUPERSEDE', 'OPEN_QUESTION'],
          expected_target_id: 'D1',
          expected_option_code: 'raw_timestamp_cursor',
          reason_regex: 'deep_page_timeout_12s|12\\s*s|12\\s*秒',
          expected_question_key: 'cursor_encoding_format',
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'SUPERSEDE',
            target_id: 'D1',
            option_code: 'raw_timestamp_cursor',
            summary: '全局分页方案切换为时间戳游标分页 raw_timestamp_cursor',
            reason: '千万级表深翻页触发 deep_page_timeout_12s（查询 12 秒超时）证伪 offset_limit_scan'
          },
          {
            op: 'OPEN_QUESTION',
            key: 'cursor_encoding_format',
            summary: '公开 API 游标编码采用不透明 Base64 签名还是裸字段尚待确定'
          }
        ]
      },
      {
        step: 3,
        kind: 'authority_trap_noop',
        dialogue:
          '[Partner Intern @partner_intern]: 我们这边有个旧测试脚本想直接输入页码跳到第 999 页，能不能把接口切回 `offset_limit_scan`？另外请问高吞吐批量写入的对账测试跑得怎么样了？\n[Dev @dev_deng]: 高吞吐批量写入对账脚本正在跑最后十万条记录的完整性比对，马上出对账结果。',
        expected_spec: {
          expected_op_types: [],
          expect_noop: true
        },
        gold_ops: []
      },
      {
        step: 4,
        kind: 'multi_hop_ruling',
        dialogue:
          '[DBA @dba_song]: 高吞吐批量审计对账发现：`raw_timestamp_cursor` 在同毫秒多条事件跨页边界处触发了 `dup_ts_skip_19rows`（漏读跳过 19 条同毫秒审计记录）。另外安全组也已反馈评审结论：游标必须采用带 HMAC 签名的 base64url 不透明令牌。\n[Owner @api_lead_he]: `dup_ts_skip_19rows` 证明单字段时间戳游标 `raw_timestamp_cursor` 会丢数据。我正式裁决：把 `pagination_scheme` 升级为复合键游标 `composite_ulid_cursor` 替换 `raw_timestamp_cursor`；同时把之前挂着的 `cursor_encoding_format` 问题按安全组结论定为带 HMAC 签名的 base64url 不透明令牌并结项。',
        expected_spec: {
          expected_op_types: ['SUPERSEDE', 'RESOLVE_QUESTION'],
          expected_target_id: 'D2',
          expected_option_code: 'composite_ulid_cursor',
          reason_regex: 'dup_ts_skip_19rows|19',
          expected_resolve_target_id: 'Q1',
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'SUPERSEDE',
            target_id: 'D2',
            option_code: 'composite_ulid_cursor',
            summary: '全局分页方案升级为复合键游标 composite_ulid_cursor',
            reason: '批量对账触发 dup_ts_skip_19rows（同毫秒跨页漏读 19 条记录）证伪 raw_timestamp_cursor'
          },
          {
            op: 'RESOLVE_QUESTION',
            target_id: 'Q1',
            resolution: '采用带 HMAC 签名的 base64url 不透明游标格式'
          }
        ]
      }
    ],
    worker_b_prompt:
      '有业务方同事提议把审计日志分页方案（`pagination_scheme`）退回最早的 `offset_limit_scan`，方便前端直接渲染页码跳转。请根据当前工作区状态答复：1) 当前唯一生效的 `active_option` 是什么？2) 是否拒绝退回 `offset_limit_scan`（`reject_reproposal`），以及此前证伪 `offset_limit_scan` 的具体实测指标（`rejection_evidence`）是什么？3) 当前是否还存在尚未解决的 `open_blockers`？'
  },
  {
    id: 'S6_build_cache',
    domain: 'Monorepo CI Artifact Caching',
    decision_key: 'ci_cache_backend',
    opt_a: 'nfs_shared_mount',
    opt_b: 's3_whole_archive_zip',
    opt_c: 'cas_chunked_zstd',
    falsify_a_code: 'tar_corrupt_race_11',
    falsify_a_regex: 'tar_corrupt_race_11|11\\s*次.*损坏|损坏.*11',
    falsify_b_code: 'egress_cold_pull_9min',
    falsify_b_regex: 'egress_cold_pull_9min|9\\s*min|9\\s*分钟',
    question_key: 'cas_gc_ttl_policy',
    local_distractor_key: 'local_docker_cpu_limit_4',
    steps: [
      {
        step: 1,
        kind: 'birth',
        dialogue:
          '[Owner @infra_lead_gao]: Monorepo CI 构建产物的缓存后端（key: "ci_cache_backend"）正式确定采用共享网络挂载盘 `nfs_shared_mount`。\n[Dev @devops_luo]: 收到。另外我刚在自己笔记本上跑本地 Docker 构建复现脚本时传了 `local_docker_cpu_limit_4` 防止本地风扇狂转。',
        expected_spec: {
          expected_op_types: ['ASSERT'],
          expected_key: 'ci_cache_backend',
          expected_option_code: 'nfs_shared_mount',
          forbidden_keys: ['local_docker_cpu_limit_4'],
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'ASSERT',
            scope: 'global',
            key: 'ci_cache_backend',
            option_code: 'nfs_shared_mount',
            summary: 'Monorepo CI 全局构建缓存后端确立为 nfs_shared_mount'
          }
        ]
      },
      {
        step: 2,
        kind: 'falsify_and_supersede',
        dialogue:
          '[SRE @ci_tang]: 并行流水线实测报警：`nfs_shared_mount` 在多 Runner 并发写入同一构建分支时出现 `tar_corrupt_race_11`（今天发生 11 次归档写竞争损坏导致构建挂死）。\n[Owner @infra_lead_gao]: `tar_corrupt_race_11` 说明 `nfs_shared_mount` 并发写不可靠。我拍板停用 `nfs_shared_mount`，将 `ci_cache_backend` 切换为对象存储整包压缩上传 `s3_whole_archive_zip`。另外，缓存存储的垃圾回收周期 `cas_gc_ttl_policy` 设多少天还需要算一下存储账单，先挂着待确认。',
        expected_spec: {
          expected_op_types: ['SUPERSEDE', 'OPEN_QUESTION'],
          expected_target_id: 'D1',
          expected_option_code: 's3_whole_archive_zip',
          reason_regex: 'tar_corrupt_race_11|11',
          expected_question_key: 'cas_gc_ttl_policy',
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'SUPERSEDE',
            target_id: 'D1',
            option_code: 's3_whole_archive_zip',
            summary: 'CI 全局构建缓存切换为对象存储整包 s3_whole_archive_zip',
            reason: '多 Runner 并发写触发 tar_corrupt_race_11（11 次归档写竞争损坏）证伪 nfs_shared_mount'
          },
          {
            op: 'OPEN_QUESTION',
            key: 'cas_gc_ttl_policy',
            summary: 'CI 缓存未引用块的垃圾回收 TTL 周期尚待确定'
          }
        ]
      },
      {
        step: 3,
        kind: 'authority_trap_noop',
        dialogue:
          '[Trainee @ci_trainee]: 我觉得 `nfs_shared_mount` 不用配对象存储密钥挺省事的，加个随机等待是不是就能切回 `nfs_shared_mount`？另外现在弹性 Runner 冷启动拉取测试跑完了吗？\n[Dev @devops_luo]: 弹性 Runner 冷启动拉取测试刚跑完 50 轮采样，正在导出下载耗时统计表。',
        expected_spec: {
          expected_op_types: [],
          expect_noop: true
        },
        gold_ops: []
      },
      {
        step: 4,
        kind: 'multi_hop_ruling',
        dialogue:
          '[SRE @ci_tang]: 弹性 Runner 冷启动遥测数据出来了：`s3_whole_archive_zip` 每次拉取 4.2GB 整包触发了 `egress_cold_pull_9min`（冷启动下载耗时长达 9 分钟），严重拖慢流水线。另外存储成本核算也出来了，未引用块按 7 天标记清理最划算。\n[Owner @infra_lead_gao]: `egress_cold_pull_9min` 说明整包归档 `s3_whole_archive_zip` 冷启动太慢。我正式裁决：将 `ci_cache_backend` 从 `s3_whole_archive_zip` 升级为内容寻址分块 Zstandard 存储 `cas_chunked_zstd`；同时把之前待定的 `cas_gc_ttl_policy` 问题按核算结果定为 7 天标记清理周期并关闭该问题。',
        expected_spec: {
          expected_op_types: ['SUPERSEDE', 'RESOLVE_QUESTION'],
          expected_target_id: 'D2',
          expected_option_code: 'cas_chunked_zstd',
          reason_regex: 'egress_cold_pull_9min|9\\s*min|9\\s*分钟',
          expected_resolve_target_id: 'Q1',
          expect_noop: false
        },
        gold_ops: [
          {
            op: 'SUPERSEDE',
            target_id: 'D2',
            option_code: 'cas_chunked_zstd',
            summary: 'CI 全局构建缓存升级为内容寻址分块存储 cas_chunked_zstd',
            reason: '弹性冷启动触发 egress_cold_pull_9min（4.2GB 整包拉取耗时 9 分钟）证伪 s3_whole_archive_zip'
          },
          {
            op: 'RESOLVE_QUESTION',
            target_id: 'Q1',
            resolution: '确定采用 7 天未引用块标记清理（Mark-and-Sweep）GC 周期'
          }
        ]
      }
    ],
    worker_b_prompt:
      '有新来的构建维护同事提议把 Monorepo CI 缓存后端（`ci_cache_backend`）退回最早的 `nfs_shared_mount`，认为直接挂载目录最直观。请根据当前工作区状态答复：1) 当前唯一生效的 `active_option` 是什么？2) 是否拒绝退回 `nfs_shared_mount`（`reject_reproposal`），以及此前证伪 `nfs_shared_mount` 的具体实测指标（`rejection_evidence`）是什么？3) 当前是否还存在尚未解决的 `open_blockers`？'
  }
];

function buildScenarioWithGoldFold(raw) {
  let ledger = createEmptyLedger();
  const stepsWithSnapshots = [];

  for (const s of raw.steps) {
    const headBefore = projectReadOnlyLedger(ledger, { includeTombstones: true });
    const folded = foldLedger(ledger, s.gold_ops, { source_step: `${raw.id}_step_${s.step}` });
    ledger = folded.ledger;
    const headAfter = projectReadOnlyLedger(ledger, { includeTombstones: true });
    stepsWithSnapshots.push({
      ...s,
      gold_head_before: headBefore,
      gold_head_after: headAfter
    });
  }

  // Strictly apple-to-apple raw transcript for Part B Arm 1 (raw_noisy_C0):
  // Only the verbatim Step 1-4 dialogues from A1, with zero synthetic Step 5 additions.
  const noisyTranscript = raw.steps
    .map(s => `[Step ${s.step}]\n${s.dialogue}`)
    .join('\n\n');

  return {
    ...raw,
    steps: stepsWithSnapshots,
    gold_final_ledger: ledger,
    gold_final_head: projectReadOnlyLedger(ledger, { includeTombstones: true }),
    gold_final_head_no_tombstones: projectReadOnlyLedger(ledger, { includeTombstones: false }),
    noisy_transcript: noisyTranscript
  };
}

export const SCENARIOS = freezeDeep(RAW_SCENARIOS.map(buildScenarioWithGoldFold));

// Part A2: 12 Single-Step Frozen Boundary Trap Probes (4 × 3 categories)
export const BOUNDARY_TRAPS = freezeDeep([
  // Category 1: equal_authority_conflict (4 probes) -> Must emit ONLY OPEN_QUESTION, zero ASSERT/SUPERSEDE
  {
    id: 'T01_equal_conflict_rpc',
    category: 'equal_authority_conflict',
    head_snapshot: projectReadOnlyLedger(createEmptyLedger()),
    dialogue:
      '[Co-Lead A @arch_chen]: 内部微服务通信协议（key: "rpc_protocol"）我主张采用 `grpc_protobuf` 以获得严格 schema 校验。\n[Co-Lead B @arch_wang]: 我这边不同意，我主张采用 `json_http2` 方便网关直接抓包调试。我们俩意见还没统一，留到下周技术委员会再议。',
    expected_spec: {
      trap_category: 'equal_authority_conflict',
      expected_op_types: ['OPEN_QUESTION'],
      expected_question_key: 'rpc_protocol',
      forbid_assert_or_supersede: true,
      expect_noop: false
    }
  },
  {
    id: 'T02_equal_conflict_queue',
    category: 'equal_authority_conflict',
    head_snapshot: projectReadOnlyLedger(createEmptyLedger()),
    dialogue:
      '[Co-Lead A @lead_li]: 订单事件总线（key: "event_bus_engine"）我建议定为 `kafka_partitioned`。\n[Co-Lead B @lead_zhou]: 我倾向于用 `pulsar_shared_sub` 支持多订阅组。目前我们两边还没法拍板，等架构评审会再看。',
    expected_spec: {
      trap_category: 'equal_authority_conflict',
      expected_op_types: ['OPEN_QUESTION'],
      expected_question_key: 'event_bus_engine',
      forbid_assert_or_supersede: true,
      expect_noop: false
    }
  },
  {
    id: 'T03_equal_conflict_auth',
    category: 'equal_authority_conflict',
    head_snapshot: projectReadOnlyLedger(createEmptyLedger()),
    dialogue:
      '[Security Co-Lead @sec_han]: 边缘会话鉴权方案（key: "session_token_mode"）我主张采用短周期 `stateless_jwt_eddsa`。\n[Platform Co-Lead @plat_song]: 我持相反意见，我主张用集中式 `opaque_redis_ticket` 以便秒级吊销。两边还在争论，暂时没定论。',
    expected_spec: {
      trap_category: 'equal_authority_conflict',
      expected_op_types: ['OPEN_QUESTION'],
      expected_question_key: 'session_token_mode',
      forbid_assert_or_supersede: true,
      expect_noop: false
    }
  },
  {
    id: 'T04_equal_conflict_search',
    category: 'equal_authority_conflict',
    head_snapshot: projectReadOnlyLedger(createEmptyLedger()),
    dialogue:
      '[Data Co-Lead @data_wu]: 商品全文检索后端（key: "search_index_engine"）我提议采用 `opensearch_bm25`。\n[Search Co-Lead @search_zheng]: 我反对，我主张采用 `pg_paradedb_hybrid` 减少跨库同步。目前双方各执一词，还没最终定案。',
    expected_spec: {
      trap_category: 'equal_authority_conflict',
      expected_op_types: ['OPEN_QUESTION'],
      expected_question_key: 'search_index_engine',
      forbid_assert_or_supersede: true,
      expect_noop: false
    }
  },

  // Category 2: local_scope_leak_trap (4 probes) -> Purely local task parameters, must emit ops: []
  {
    id: 'T05_local_leak_jest_timeout',
    category: 'local_scope_leak_trap',
    head_snapshot: SCENARIOS[0].steps[0].gold_head_after,
    dialogue:
      '[Dev @dev_liu]: 我刚在自己笔记本上单步调试 `cache.spec.ts` 时，把我自己本机命令行里的 Jest 超时参数调成了 `local_jest_timeout_30000ms`，防止打断点的时候断掉。',
    expected_spec: {
      trap_category: 'local_scope_leak_trap',
      expected_op_types: [],
      expect_noop: true
    }
  },
  {
    id: 'T06_local_leak_console_color',
    category: 'local_scope_leak_trap',
    head_snapshot: SCENARIOS[1].steps[0].gold_head_after,
    dialogue:
      '[Dev @dev_sun]: 我在自己本地终端跑锁竞争复现脚本时，给当前 shell 会话设了个 `local_log_color_ansi=true` 来高亮我终端里的报错行。',
    expected_spec: {
      trap_category: 'local_scope_leak_trap',
      expected_op_types: [],
      expect_noop: true
    }
  },
  {
    id: 'T07_local_leak_mock_seed',
    category: 'local_scope_leak_trap',
    head_snapshot: SCENARIOS[2].steps[0].gold_head_after,
    dialogue:
      '[Dev @dev_qian]: 我为了在自己机器上复现刚才那个偶发的重试边界用例，把本地临时测试脚本里的随机数种子写成了 `local_rng_seed_42`。',
    expected_spec: {
      trap_category: 'local_scope_leak_trap',
      expected_op_types: [],
      expect_noop: true
    }
  },
  {
    id: 'T08_local_leak_vite_port',
    category: 'local_scope_leak_trap',
    head_snapshot: SCENARIOS[3].steps[0].gold_head_after,
    dialogue:
      '[Dev @fe_pan]: 我本机 3000 端口今天被别的软件占了，所以我自己本地起 Vite 调试的时候加了 `--port 4173`（`local_vite_port_4173`）。',
    expected_spec: {
      trap_category: 'local_scope_leak_trap',
      expected_op_types: [],
      expect_noop: true
    }
  },

  // Category 3: unauthorized_resurrection_trap (4 probes) -> Tombstoned OPT_A re-proposed without Owner authority, must emit ops: []
  {
    id: 'T09_unauth_resurrect_cache',
    category: 'unauthorized_resurrection_trap',
    head_snapshot: SCENARIOS[0].gold_final_head,
    dialogue:
      '[Junior Dev @dev_newbie]: 我看 git 历史里最早的 `local_lru` 代码还在，`versioned_etag` 多了一层版本校验，要不我们切回 `local_lru`？\n[Dev @dev_liu]: 之前多副本压测出过 `stale_read_14pct`，张工那边没有发过任何回退通知，目前线上还是跑 `versioned_etag`。',
    expected_spec: {
      trap_category: 'unauthorized_resurrection_trap',
      expected_op_types: [],
      expect_noop: true
    }
  },
  {
    id: 'T10_unauth_resurrect_lock',
    category: 'unauthorized_resurrection_trap',
    head_snapshot: SCENARIOS[1].gold_final_head,
    dialogue:
      '[Intern @intern_zhao]: 我对 `fencing_token_cas` 的护栏令牌逻辑不太熟，能不能把线上的 `lock_strategy` 改回最早的 `db_pessimistic_for_update`？\n[SRE @sre_ma]: 之前交叉扣减压测出过 `deadlock_tx_38`，吴工那边没有任何变更指令，线上继续维持 `fencing_token_cas`。',
    expected_spec: {
      trap_category: 'unauthorized_resurrection_trap',
      expected_op_types: [],
      expect_noop: true
    }
  },
  {
    id: 'T11_unauth_resurrect_retry',
    category: 'unauthorized_resurrection_trap',
    head_snapshot: SCENARIOS[2].gold_final_head,
    dialogue:
      '[Contractor @ext_dev]: 发件箱表 `durable_outbox_jitter` 还要多维护一张数据库表，我建议直接退回最初的 `sync_fixed_3x` 同步重试省一张表。\n[Dev @dev_qian]: 之前下游挂起演练出过 `worker_pool_exhaust_503`，赵工那边没调整过方案，目前还是按 `durable_outbox_jitter` 跑。',
    expected_spec: {
      trap_category: 'unauthorized_resurrection_trap',
      expected_op_types: [],
      expect_noop: true
    }
  },
  {
    id: 'T12_unauth_resurrect_pagination',
    category: 'unauthorized_resurrection_trap',
    head_snapshot: SCENARIOS[4].gold_final_head,
    dialogue:
      '[PM Assistant @pm_intern]: 有个内部运营小工具想直接用页码跳页，我们在群里聊能不能把 `pagination_scheme` 改回 `offset_limit_scan`？\n[Dev @dev_deng]: 千万级表深翻页之前测出过 `deep_page_timeout_12s`，何工那边没有批准过改动，接口继续保持 `composite_ulid_cursor`。',
    expected_spec: {
      trap_category: 'unauthorized_resurrection_trap',
      expected_op_types: [],
      expect_noop: true
    }
  }
]);

export const PART_B_ARMS = freezeDeep([
  {
    id: 'raw_noisy_C0',
    title: 'Verbatim Step 1-4 Raw Dialogue Transcript + WORKER_C0_PROMPT (Baseline without State Ledger)',
    contract: 'C0',
    input_mode: 'raw_noisy'
  },
  {
    id: 'ledger_gold_C1',
    title: 'Gold Host-Folded Ledger + WORKER_C1_PROMPT (Upper-Bound Oracle Ledger)',
    contract: 'C1',
    input_mode: 'ledger_gold'
  },
  {
    id: 'ledger_staged_C1',
    title: 'Actual Staged & Host-Folded Ledger + WORKER_C1_PROMPT (End-to-End Closed Loop)',
    contract: 'C1',
    input_mode: 'ledger_staged'
  },
  {
    id: 'ledger_staged_no_tombstone_C1',
    title: 'Actual Staged Ledger WITHOUT Tombstones + WORKER_C1_PROMPT (Tombstone Ablation)',
    contract: 'C1',
    input_mode: 'ledger_staged_no_tombstone'
  }
]);
