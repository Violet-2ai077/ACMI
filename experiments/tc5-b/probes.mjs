// TC5-B Frozen Single-Turn Prefix Probes (32 Probes = 4 Domains x 8 Probes)
// Experiment A: 2x2 Recency/Primacy Counterbalanced Implicit Ambiguity + Over-Abstention Control

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      freezeDeep(value[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const DOMAIN_SPECS = [
  // =========================================================================
  // Domain 1: warehouse-queries (cold_stock vs ambient_stock, intervening: delivery fee)
  // =========================================================================
  {
    domain: 'warehouse-queries',
    title: 'Warehouse Deduplication SQL (cold_stock vs ambient_stock)',
    exclusive_tokens: {
      task1: ['冷库', '低温', '冷藏', 'cold_stock'],
      task2: ['常温', '不控温', '不用控温', '不需要冷藏', 'ambient_stock']
    },
    prefixes: {
      '1': [
        {
          turn: 1,
          marker: '1',
          user: '为冷库库存单独写去重查询：表cold_stock，按sku分组，保留updated_at最新的记录。给一段完整SQL。',
          assistant:
            '```sql\nSELECT *\nFROM (\n    SELECT\n        cs.*,\n        ROW_NUMBER() OVER (\n            PARTITION BY sku\n            ORDER BY updated_at DESC\n        ) AS rn\n    FROM cold_stock cs\n) t\nWHERE rn = 1;\n```\n\n这条查询针对冷库 `cold_stock`，按 `sku` 分组并保留每组 `updated_at` 最新的一条记录。<|task:1|>',
          reasoning_content:
            'First task in conversation: cold_stock deduplication SQL grouped by sku keeping latest updated_at. Assign marker 1.'
        },
        {
          turn: 2,
          marker: '2',
          user: '常温仓也需要独立的库存去重查询：表ambient_stock，同样按sku分组、保留updated_at最新记录。给完整SQL，不和冷库合并。',
          assistant:
            '```sql\nSELECT *\nFROM (\n    SELECT\n        a.*,\n        ROW_NUMBER() OVER (\n            PARTITION BY sku\n            ORDER BY updated_at DESC\n        ) AS rn\n    FROM ambient_stock a\n) t\nWHERE rn = 1;\n```\n\n这条查询独立针对常温仓 `ambient_stock`，按 `sku` 分组并保留 `updated_at` 最新的一条记录。<|task:2|>',
          reasoning_content:
            'Independent second task: ambient_stock deduplication SQL, explicitly separate from cold_stock. Assign marker 2.'
        },
        {
          turn: 3,
          marker: '1',
          user: '需要低温保存的那批商品，时间相同时再按row_id倒序选择一条，给更新后的查询。',
          assistant:
            '```sql\nSELECT *\nFROM (\n    SELECT\n        cs.*,\n        ROW_NUMBER() OVER (\n            PARTITION BY sku\n            ORDER BY updated_at DESC, row_id DESC\n        ) AS rn\n    FROM cold_stock cs\n) t\nWHERE rn = 1;\n```\n\n低温冷库 `cold_stock` 查询已加上 `updated_at` 相同时按 `row_id DESC` 排序。<|task:1|>',
          reasoning_content:
            'Low-temperature goods uniquely identify cold_stock (task 1). Update ORDER BY with row_id DESC and keep marker 1.'
        },
        {
          turn: 4,
          marker: '3',
          user: '另外算一笔独立的配送费用：运费48元、搬运费32元，只给费用合计。',
          assistant: '费用合计：80元。<|task:3|>',
          reasoning_content:
            'Independent third task: delivery fee arithmetic (48 + 32 = 80). Assign marker 3.'
        },
        {
          turn: 5,
          marker: '3',
          user: '再加5元包装费，现在合计多少？',
          assistant: '合计：85元。<|task:3|>',
          reasoning_content:
            'Immediate continuation of delivery fee calculation (80 + 5 = 85). Keep marker 3.'
        }
      ],
      '2': [
        {
          turn: 1,
          marker: '1',
          user: '为冷库库存单独写去重查询：表cold_stock，按sku分组，保留updated_at最新的记录。给一段完整SQL。',
          assistant:
            '```sql\nSELECT *\nFROM (\n    SELECT\n        cs.*,\n        ROW_NUMBER() OVER (\n            PARTITION BY sku\n            ORDER BY updated_at DESC\n        ) AS rn\n    FROM cold_stock cs\n) t\nWHERE rn = 1;\n```\n\n这条查询针对冷库 `cold_stock`，按 `sku` 分组并保留每组 `updated_at` 最新的一条记录。<|task:1|>',
          reasoning_content:
            'First task in conversation: cold_stock deduplication SQL grouped by sku keeping latest updated_at. Assign marker 1.'
        },
        {
          turn: 2,
          marker: '2',
          user: '常温仓也需要独立的库存去重查询：表ambient_stock，同样按sku分组、保留updated_at最新记录。给完整SQL，不和冷库合并。',
          assistant:
            '```sql\nSELECT *\nFROM (\n    SELECT\n        a.*,\n        ROW_NUMBER() OVER (\n            PARTITION BY sku\n            ORDER BY updated_at DESC\n        ) AS rn\n    FROM ambient_stock a\n) t\nWHERE rn = 1;\n```\n\n这条查询独立针对常温仓 `ambient_stock`，按 `sku` 分组并保留 `updated_at` 最新的一条记录。<|task:2|>',
          reasoning_content:
            'Independent second task: ambient_stock deduplication SQL, explicitly separate from cold_stock. Assign marker 2.'
        },
        {
          turn: 3,
          marker: '2',
          user: '不用控温存放的那批普通商品，时间相同时再按row_id倒序选择一条，给更新后的查询。',
          assistant:
            '```sql\nSELECT *\nFROM (\n    SELECT\n        a.*,\n        ROW_NUMBER() OVER (\n            PARTITION BY sku\n            ORDER BY updated_at DESC, row_id DESC\n        ) AS rn\n    FROM ambient_stock a\n) t\nWHERE rn = 1;\n```\n\n常温仓 `ambient_stock` 查询已加上 `updated_at` 相同时按 `row_id DESC` 排序。<|task:2|>',
          reasoning_content:
            'Non-temperature-controlled goods uniquely identify ambient_stock (task 2). Update ORDER BY with row_id DESC and keep marker 2.'
        },
        {
          turn: 4,
          marker: '3',
          user: '另外算一笔独立的配送费用：运费48元、搬运费32元，只给费用合计。',
          assistant: '费用合计：80元。<|task:3|>',
          reasoning_content:
            'Independent third task: delivery fee arithmetic (48 + 32 = 80). Assign marker 3.'
        },
        {
          turn: 5,
          marker: '3',
          user: '再加5元包装费，现在合计多少？',
          assistant: '合计：85元。<|task:3|>',
          reasoning_content:
            'Immediate continuation of delivery fee calculation (80 + 5 = 85). Keep marker 3.'
        }
      ]
    },
    ambiguous_triggers: [
      {
        suffix: 'a',
        text: '把库存去重查询的排序部分单独列出来，分组字段也要有。',
        answerChecks: [
          ['哪', '确认', '澄清', '指定', '冷库.*还是.*常温', '常温.*还是.*冷库'],
          ['冷库', '低温', 'cold_stock'],
          ['常温', 'ambient_stock']
        ]
      },
      {
        suffix: 'b',
        text: '按sku保留最新记录的那份库存查询，写成一句便于同事理解的说明。',
        answerChecks: [
          ['哪', '确认', '澄清', '指定', '冷库.*还是.*常温', '常温.*还是.*冷库'],
          ['冷库', '低温', 'cold_stock'],
          ['常温', 'ambient_stock']
        ]
      }
    ],
    unambiguous_triggers: {
      '1': {
        text: '需要低温保存的那批商品，把它的库存去重查询改成只查询sku和updated_at两列，给出完整SQL。',
        answerChecks: [['cold_stock'], ['sku'], ['updated_at']]
      },
      '2': {
        text: '不用控温存放的那些商品，把它的库存去重查询改成只查询sku和updated_at两列，给出完整SQL。',
        answerChecks: [['ambient_stock'], ['sku'], ['updated_at']]
      }
    }
  },

  // =========================================================================
  // Domain 2: pottery-notices (adult class vs family class, intervening: equipment checklist)
  // =========================================================================
  {
    domain: 'pottery-notices',
    title: 'Pottery Class Confirmation SMS (Adult vs Family)',
    exclusive_tokens: {
      task1: ['成人', '成年', '独自', '不带孩子', '10:00', '南楼', 'A室'],
      task2: ['亲子', '家长', '小朋友', '孩子', '15:00', '北楼', 'B室']
    },
    prefixes: {
      '1': [
        {
          turn: 1,
          marker: '1',
          user: '给成人陶艺课写一份独立的报名确认短信：周六10:00在南楼A室，请带围裙和湿巾。',
          assistant:
            '【陶艺课报名确认】您好，您已成功报名成人陶艺课。上课时间为周六10:00，地点在南楼A室。请携带围裙和湿巾，准时参加。祝您体验愉快！<|task:1|>',
          reasoning_content:
            'First task: standalone registration confirmation SMS for adult pottery class (Sat 10:00, South Building Room A). Assign marker 1.'
        },
        {
          turn: 2,
          marker: '2',
          user: '另写亲子陶艺课的独立报名确认短信：周六15:00在北楼B室，也请带围裙和湿巾。不要合成两场的总通知。',
          assistant:
            '【亲子陶艺课报名确认】您好，您已成功报名亲子陶艺课。上课时间为周六15:00，地点在北楼B室。请携带围裙和湿巾，准时参加。祝您和孩子体验愉快！<|task:2|>',
          reasoning_content:
            'Second independent task: registration confirmation SMS for family pottery class (Sat 15:00, North Building Room B). Assign marker 2.'
        },
        {
          turn: 3,
          marker: '1',
          user: '独自来体验的成年学员可能是第一次接触泥巴，语气放轻松些，时间地点和用品保留。',
          assistant:
            '【成人陶艺课报名确认】您好！您报名的成人陶艺课已确认：周六10:00在南楼A室。一个人来、第一次接触泥巴都没关系，放轻松就好；记得带上围裙和湿巾，期待和您见面！<|task:1|>',
          reasoning_content:
            'Solo adult learners uniquely identify the adult pottery confirmation (task 1). Soften tone and keep marker 1.'
        },
        {
          turn: 4,
          marker: '3',
          user: '还有一个独立工作：写一份场地设备检查清单，只查水龙头和照明，不是发给学员的报名短信。',
          assistant:
            '**场地设备检查清单（内部使用）**\n1. 水龙头：逐个开启，检查出水、关闭及是否漏水。\n2. 照明：逐区开启，检查灯具是否正常点亮、闪烁或损坏。<|task:3|>',
          reasoning_content:
            'Third independent task: internal facility equipment checklist for faucets and lighting. Assign marker 3.'
        },
        {
          turn: 5,
          marker: '3',
          user: '再简短一点，只保留需要检查的两项。',
          assistant:
            '场地设备检查清单：\n1. 水龙头：检查出水、关闭是否正常，有无漏水。\n2. 照明：检查灯具是否正常点亮，有无闪烁或损坏。<|task:3|>',
          reasoning_content:
            'Immediate continuation of facility equipment checklist (task 3). Keep marker 3.'
        }
      ],
      '2': [
        {
          turn: 1,
          marker: '1',
          user: '给成人陶艺课写一份独立的报名确认短信：周六10:00在南楼A室，请带围裙和湿巾。',
          assistant:
            '【陶艺课报名确认】您好，您已成功报名成人陶艺课。上课时间为周六10:00，地点在南楼A室。请携带围裙和湿巾，准时参加。祝您体验愉快！<|task:1|>',
          reasoning_content:
            'First task: standalone registration confirmation SMS for adult pottery class (Sat 10:00, South Building Room A). Assign marker 1.'
        },
        {
          turn: 2,
          marker: '2',
          user: '另写亲子陶艺课的独立报名确认短信：周六15:00在北楼B室，也请带围裙和湿巾。不要合成两场的总通知。',
          assistant:
            '【亲子陶艺课报名确认】您好，您已成功报名亲子陶艺课。上课时间为周六15:00，地点在北楼B室。请携带围裙和湿巾，准时参加。祝您和孩子体验愉快！<|task:2|>',
          reasoning_content:
            'Second independent task: registration confirmation SMS for family pottery class (Sat 15:00, North Building Room B). Assign marker 2.'
        },
        {
          turn: 3,
          marker: '2',
          user: '带小朋友一起来玩泥巴的家长，短信语气改得更活泼温馨些，时间地点和用品保留。',
          assistant:
            '【亲子陶艺课报名确认】您好！周六15:00在北楼B室，期待您和小朋友一起来开心玩泥巴！请记得带上围裙和湿巾，我们不见不散！<|task:2|>',
          reasoning_content:
            'Parents bringing children uniquely identify the family pottery confirmation (task 2). Make tone livelier and keep marker 2.'
        },
        {
          turn: 4,
          marker: '3',
          user: '还有一个独立工作：写一份场地设备检查清单，只查水龙头和照明，不是发给学员的报名短信。',
          assistant:
            '**场地设备检查清单（内部使用）**\n1. 水龙头：逐个开启，检查出水、关闭及是否漏水。\n2. 照明：逐区开启，检查灯具是否正常点亮、闪烁或损坏。<|task:3|>',
          reasoning_content:
            'Third independent task: internal facility equipment checklist for faucets and lighting. Assign marker 3.'
        },
        {
          turn: 5,
          marker: '3',
          user: '再简短一点，只保留需要检查的两项。',
          assistant:
            '场地设备检查清单：\n1. 水龙头：检查出水、关闭是否正常，有无漏水。\n2. 照明：检查灯具是否正常点亮，有无闪烁或损坏。<|task:3|>',
          reasoning_content:
            'Immediate continuation of facility equipment checklist (task 3). Keep marker 3.'
        }
      ]
    },
    ambiguous_triggers: [
      {
        suffix: 'a',
        text: '把周六陶艺课的报名确认短信压缩成一句，保留上课时间和地点。',
        answerChecks: [
          ['哪', '确认.*场', '请.*场', '澄清', '指定', '成人.*还是.*亲子', '亲子.*还是.*成人'],
          ['成人', '10[:：]00', '南楼'],
          ['亲子', '15[:：]00', '北楼']
        ]
      },
      {
        suffix: 'b',
        text: '给需要带围裙和湿巾的学员，那条报名确认再写得亲切一点，保留活动安排。',
        answerChecks: [
          ['哪', '确认.*场', '请.*场', '澄清', '指定', '成人.*还是.*亲子', '亲子.*还是.*成人'],
          ['成人', '10[:：]00', '南楼'],
          ['亲子', '15[:：]00', '北楼']
        ]
      }
    ],
    unambiguous_triggers: {
      '1': {
        text: '不带孩子、自己来体验做陶器的成年学员，确认文案里补充“提供免费储物柜”，保留原本的时间地点和用品。',
        answerChecks: [['10[:：]00', '十点'], ['南楼'], ['围裙']]
      },
      '2': {
        text: '家长带小朋友一起动手做陶器的那场，确认文案里补充“提供儿童洗手液”，保留原本的时间地点和用品。',
        answerChecks: [['15[:：]00', '三点'], ['北楼'], ['围裙']]
      }
    }
  },

  // =========================================================================
  // Domain 3: api-rate-limit (pro_tier vs free_tier, intervening: alert email regex)
  // =========================================================================
  {
    domain: 'api-rate-limit',
    title: 'API Gateway Rate-Limit Config (pro_tier vs free_tier)',
    exclusive_tokens: {
      task1: ['付费', '商业', '签约', 'pro_tier', '1200'],
      task2: ['免费', '体验', '试用', '未付费', 'free_tier', '60次']
    },
    prefixes: {
      '1': [
        {
          turn: 1,
          marker: '1',
          user: '为付费商业版租户单独写一份网关限流配置：策略名pro_tier，按api_key统计60秒滑动窗口，上限1200次请求，超限返回HTTP 429。请给出YAML格式配置。',
          assistant:
            '```yaml\npolicy: pro_tier\nkey_by: api_key\nwindow_seconds: 60\nwindow_type: sliding\nmax_requests: 1200\nreject_status: 429\n```\n\n这是付费商业版租户 `pro_tier` 的独立限流配置。<|task:1|>',
          reasoning_content:
            'First task: rate-limit YAML config for paid commercial tenants (pro_tier, 1200 req / 60s sliding window by api_key). Assign marker 1.'
        },
        {
          turn: 2,
          marker: '2',
          user: '免费体验版租户也需要一份独立的网关限流配置：策略名free_tier，同样按api_key统计60秒滑动窗口，上限60次请求，超限返回HTTP 429。给独立YAML配置，不要和付费版合并。',
          assistant:
            '```yaml\npolicy: free_tier\nkey_by: api_key\nwindow_seconds: 60\nwindow_type: sliding\nmax_requests: 60\nreject_status: 429\n```\n\n这是免费体验版租户 `free_tier` 的独立限流配置。<|task:2|>',
          reasoning_content:
            'Second independent task: rate-limit YAML config for free trial tenants (free_tier, 60 req / 60s sliding window by api_key). Assign marker 2.'
        },
        {
          turn: 3,
          marker: '1',
          user: '已签约购买商业套餐的客户，限流配置里增加retry_after_header: true，其余窗口和配额保持不变，给更新后的YAML。',
          assistant:
            '```yaml\npolicy: pro_tier\nkey_by: api_key\nwindow_seconds: 60\nwindow_type: sliding\nmax_requests: 1200\nreject_status: 429\nretry_after_header: true\n```\n\n付费商业版 `pro_tier` 已开启 `retry_after_header: true`。<|task:1|>',
          reasoning_content:
            'Paid commercial package customers uniquely match pro_tier (task 1). Add retry_after_header: true and keep marker 1.'
        },
        {
          turn: 4,
          marker: '3',
          user: '另外处理一个独立需求：写一条校验运维告警接收邮箱后缀必须为@ops.example.com的正则表达式，与网关限流无关。',
          assistant:
            '校验正则：`^[a-zA-Z0-9._%+-]+@ops\\.example\\.com$`<|task:3|>',
          reasoning_content:
            'Third independent task: regex validation for alert email suffix @ops.example.com. Assign marker 3.'
        },
        {
          turn: 5,
          marker: '3',
          user: '邮箱前缀只允许小写字母、数字和点号，更新这条正则。',
          assistant:
            '更新后的校验正则：`^[a-z0-9.]+@ops\\.example\\.com$`<|task:3|>',
          reasoning_content:
            'Immediate continuation of alert email regex validation (task 3). Keep marker 3.'
        }
      ],
      '2': [
        {
          turn: 1,
          marker: '1',
          user: '为付费商业版租户单独写一份网关限流配置：策略名pro_tier，按api_key统计60秒滑动窗口，上限1200次请求，超限返回HTTP 429。请给出YAML格式配置。',
          assistant:
            '```yaml\npolicy: pro_tier\nkey_by: api_key\nwindow_seconds: 60\nwindow_type: sliding\nmax_requests: 1200\nreject_status: 429\n```\n\n这是付费商业版租户 `pro_tier` 的独立限流配置。<|task:1|>',
          reasoning_content:
            'First task: rate-limit YAML config for paid commercial tenants (pro_tier, 1200 req / 60s sliding window by api_key). Assign marker 1.'
        },
        {
          turn: 2,
          marker: '2',
          user: '免费体验版租户也需要一份独立的网关限流配置：策略名free_tier，同样按api_key统计60秒滑动窗口，上限60次请求，超限返回HTTP 429。给独立YAML配置，不要和付费版合并。',
          assistant:
            '```yaml\npolicy: free_tier\nkey_by: api_key\nwindow_seconds: 60\nwindow_type: sliding\nmax_requests: 60\nreject_status: 429\n```\n\n这是免费体验版租户 `free_tier` 的独立限流配置。<|task:2|>',
          reasoning_content:
            'Second independent task: rate-limit YAML config for free trial tenants (free_tier, 60 req / 60s sliding window by api_key). Assign marker 2.'
        },
        {
          turn: 3,
          marker: '2',
          user: '未付费的试用体验账号，限流配置里增加retry_after_header: true，其余窗口和配额保持不变，给更新后的YAML。',
          assistant:
            '```yaml\npolicy: free_tier\nkey_by: api_key\nwindow_seconds: 60\nwindow_type: sliding\nmax_requests: 60\nreject_status: 429\nretry_after_header: true\n```\n\n免费体验版 `free_tier` 已开启 `retry_after_header: true`。<|task:2|>',
          reasoning_content:
            'Unpaid trial accounts uniquely match free_tier (task 2). Add retry_after_header: true and keep marker 2.'
        },
        {
          turn: 4,
          marker: '3',
          user: '另外处理一个独立需求：写一条校验运维告警接收邮箱后缀必须为@ops.example.com的正则表达式，与网关限流无关。',
          assistant:
            '校验正则：`^[a-zA-Z0-9._%+-]+@ops\\.example\\.com$`<|task:3|>',
          reasoning_content:
            'Third independent task: regex validation for alert email suffix @ops.example.com. Assign marker 3.'
        },
        {
          turn: 5,
          marker: '3',
          user: '邮箱前缀只允许小写字母、数字和点号，更新这条正则。',
          assistant:
            '更新后的校验正则：`^[a-z0-9.]+@ops\\.example\\.com$`<|task:3|>',
          reasoning_content:
            'Immediate continuation of alert email regex validation (task 3). Keep marker 3.'
        }
      ]
    },
    ambiguous_triggers: [
      {
        suffix: 'a',
        text: '把按api_key统计60秒滑动窗口的那份网关限流配置，转换成JSON格式并保留原有的请求上限。',
        answerChecks: [
          ['哪', '确认', '澄清', '指定', '付费.*还是.*免费', '免费.*还是.*付费', 'pro_tier.*还是.*free_tier', 'free_tier.*还是.*pro_tier'],
          ['付费', '商业', 'pro_tier'],
          ['免费', '体验', 'free_tier']
        ]
      },
      {
        suffix: 'b',
        text: '超限返回HTTP 429的那套按api_key限流策略，写成一句给值班研发看的规则摘要。',
        answerChecks: [
          ['哪', '确认', '澄清', '指定', '付费.*还是.*免费', '免费.*还是.*付费', 'pro_tier.*还是.*free_tier', 'free_tier.*还是.*pro_tier'],
          ['付费', '商业', 'pro_tier'],
          ['免费', '体验', 'free_tier']
        ]
      }
    ],
    unambiguous_triggers: {
      '1': {
        text: '已签约付费的商业客户那套网关限流配置，把burst_allowance设为200，保留原有的60秒滑窗和请求上限，给出完整YAML。',
        answerChecks: [['pro_tier'], ['1200'], ['200']]
      },
      '2': {
        text: '未付费注册的试用体验账号那套网关限流配置，把burst_allowance设为10，保留原有的60秒滑窗和请求上限，给出完整YAML。',
        answerChecks: [['free_tier'], ['60'], ['10']]
      }
    }
  },

  // =========================================================================
  // Domain 4: release-checklist (mobile_rel vs server_rel, intervening: changelog semver)
  // =========================================================================
  {
    domain: 'release-checklist',
    title: 'Release Verification Checklist (mobile_rel vs server_rel)',
    exclusive_tokens: {
      task1: ['移动端', '手机', 'App', '应用商店', '客户端', '崩溃率', '0.2%', 'mobile_rel'],
      task2: ['服务端', '后端', '容器集群', 'P99', '180ms', 'server_rel']
    },
    prefixes: {
      '1': [
        {
          turn: 1,
          marker: '1',
          user: '为移动端App单独写一份发版检查单：代号mobile_rel，包含灰度开关核对、崩溃率监控（阈值0.2%）和回滚命令，发布渠道为应用商店。请列出清单。',
          assistant:
            '**移动端发版检查单（`mobile_rel` / 应用商店）**\n1. 灰度开关：核对新功能灰度比例配置。\n2. 崩溃率监控：确认线上崩溃率低于 `0.2%`。\n3. 回滚命令：准备应用商店版本紧急回退指令。<|task:1|>',
          reasoning_content:
            'First task: release checklist for mobile App (mobile_rel, app store, crash rate < 0.2%, canary switch, rollback command). Assign marker 1.'
        },
        {
          turn: 2,
          marker: '2',
          user: '服务端集群也需要一份独立的发版检查单：代号server_rel，同样包含灰度开关核对、P99延迟监控（阈值180ms）和回滚命令，部署在容器集群。请单独列出，不要和移动端合并。',
          assistant:
            '**服务端发版检查单（`server_rel` / 容器集群）**\n1. 灰度开关：核对网关流量灰度路由开关。\n2. P99延迟监控：确认接口 P99 延迟低于 `180ms`。\n3. 回滚命令：准备容器集群镜像回滚指令。<|task:2|>',
          reasoning_content:
            'Second independent task: release checklist for backend server cluster (server_rel, container cluster, P99 < 180ms). Assign marker 2.'
        },
        {
          turn: 3,
          marker: '1',
          user: '面向手机用户上架应用商店的那份客户端发版清单，回滚部分补充“暂停热更新补丁下发”，其余项保留。',
          assistant:
            '**移动端发版检查单（`mobile_rel` / 应用商店）**\n1. 灰度开关：核对新功能灰度比例配置。\n2. 崩溃率监控：确认线上崩溃率低于 `0.2%`。\n3. 回滚命令：先暂停热更新补丁下发，再执行应用商店版本回退指令。<|task:1|>',
          reasoning_content:
            'Mobile users and app store uniquely identify mobile_rel (task 1). Update rollback step and keep marker 1.'
        },
        {
          turn: 4,
          marker: '3',
          user: '另外有一项独立的文档规范工作：定义CHANGELOG标题的版本号格式为vMAJOR.MINOR.PATCH并附上日期YYYY-MM-DD，给一个示例标题。',
          assistant: 'CHANGELOG 标题示例：`## v2.4.0 (2026-11-22)`<|task:3|>',
          reasoning_content:
            'Third independent task: CHANGELOG semantic version heading format example. Assign marker 3.'
        },
        {
          turn: 5,
          marker: '3',
          user: '标题括号里的日期后面再加7位Git短哈希，更新这个示例。',
          assistant: '更新后的 CHANGELOG 标题示例：`## v2.4.0 (2026-11-22, a1b2c3d)`<|task:3|>',
          reasoning_content:
            'Immediate continuation of CHANGELOG heading format example (task 3). Keep marker 3.'
        }
      ],
      '2': [
        {
          turn: 1,
          marker: '1',
          user: '为移动端App单独写一份发版检查单：代号mobile_rel，包含灰度开关核对、崩溃率监控（阈值0.2%）和回滚命令，发布渠道为应用商店。请列出清单。',
          assistant:
            '**移动端发版检查单（`mobile_rel` / 应用商店）**\n1. 灰度开关：核对新功能灰度比例配置。\n2. 崩溃率监控：确认线上崩溃率低于 `0.2%`。\n3. 回滚命令：准备应用商店版本紧急回退指令。<|task:1|>',
          reasoning_content:
            'First task: release checklist for mobile App (mobile_rel, app store, crash rate < 0.2%, canary switch, rollback command). Assign marker 1.'
        },
        {
          turn: 2,
          marker: '2',
          user: '服务端集群也需要一份独立的发版检查单：代号server_rel，同样包含灰度开关核对、P99延迟监控（阈值180ms）和回滚命令，部署在容器集群。请单独列出，不要和移动端合并。',
          assistant:
            '**服务端发版检查单（`server_rel` / 容器集群）**\n1. 灰度开关：核对网关流量灰度路由开关。\n2. P99延迟监控：确认接口 P99 延迟低于 `180ms`。\n3. 回滚命令：准备容器集群镜像回滚指令。<|task:2|>',
          reasoning_content:
            'Second independent task: release checklist for backend server cluster (server_rel, container cluster, P99 < 180ms). Assign marker 2.'
        },
        {
          turn: 3,
          marker: '2',
          user: '部署在后端容器集群的那份发版清单，回滚部分补充“先摘除负载均衡节点流量”，其余项保留。',
          assistant:
            '**服务端发版检查单（`server_rel` / 容器集群）**\n1. 灰度开关：核对网关流量灰度路由开关。\n2. P99延迟监控：确认接口 P99 延迟低于 `180ms`。\n3. 回滚命令：先摘除负载均衡节点流量，再执行容器集群镜像回滚指令。<|task:2|>',
          reasoning_content:
            'Backend container cluster uniquely identifies server_rel (task 2). Update rollback step and keep marker 2.'
        },
        {
          turn: 4,
          marker: '3',
          user: '另外有一项独立的文档规范工作：定义CHANGELOG标题的版本号格式为vMAJOR.MINOR.PATCH并附上日期YYYY-MM-DD，给一个示例标题。',
          assistant: 'CHANGELOG 标题示例：`## v2.4.0 (2026-11-22)`<|task:3|>',
          reasoning_content:
            'Third independent task: CHANGELOG semantic version heading format example. Assign marker 3.'
        },
        {
          turn: 5,
          marker: '3',
          user: '标题括号里的日期后面再加7位Git短哈希，更新这个示例。',
          assistant: '更新后的 CHANGELOG 标题示例：`## v2.4.0 (2026-11-22, a1b2c3d)`<|task:3|>',
          reasoning_content:
            'Immediate continuation of CHANGELOG heading format example (task 3). Keep marker 3.'
        }
      ]
    },
    ambiguous_triggers: [
      {
        suffix: 'a',
        text: '把包含灰度开关核对和回滚命令的那份发版检查单，压缩成三行速查口诀。',
        answerChecks: [
          ['哪', '确认', '澄清', '指定', '移动端.*还是.*服务端', '服务端.*还是.*移动端', 'mobile_rel.*还是.*server_rel', 'server_rel.*还是.*mobile_rel'],
          ['移动端', 'App', 'mobile_rel'],
          ['服务端', '容器', 'server_rel']
        ]
      },
      {
        suffix: 'b',
        text: '给那份带有灰度开关与回滚命令的发版清单，补一句发在上线群里的核对提醒。',
        answerChecks: [
          ['哪', '确认', '澄清', '指定', '移动端.*还是.*服务端', '服务端.*还是.*移动端', 'mobile_rel.*还是.*server_rel', 'server_rel.*还是.*mobile_rel'],
          ['移动端', 'App', 'mobile_rel'],
          ['服务端', '容器', 'server_rel']
        ]
      }
    ],
    unambiguous_triggers: {
      '1': {
        text: '提交到应用商店供手机用户下载的客户端版本，发版检查单里加一项“核对双端安装包签名证书”，保留原有的灰度开关、崩溃率阈值和回滚项。',
        answerChecks: [['mobile_rel', '移动端', 'App', '应用商店'], ['0\\.2%', '崩溃'], ['签名', '证书']]
      },
      '2': {
        text: '部署在后端容器集群的服务版本，发版检查单里加一项“核对数据库连接池上限”，保留原有的灰度开关、P99延迟阈值和回滚项。',
        answerChecks: [['server_rel', '服务端', '容器'], ['180\\s*ms', 'P99'], ['连接池', '数据库']]
      }
    }
  }
];

function buildProbes() {
  const list = [];

  for (const spec of DOMAIN_SPECS) {
    // 4 Ambiguous probes: 2 with recent_relevant="1", 2 with recent_relevant="2"
    for (const recent of ['1', '2']) {
      for (const trig of spec.ambiguous_triggers) {
        list.push({
          id: `${spec.domain}-ambig-r${recent}-${trig.suffix}`,
          domain: spec.domain,
          kind: 'ambiguous',
          expected: 'UNRESOLVED',
          recent_relevant: recent,
          older_relevant: recent === '1' ? '2' : '1',
          candidate_markers: ['1', '2'],
          intervening_marker: '3',
          exclusive_tokens: spec.exclusive_tokens,
          prefix_turns: spec.prefixes[recent],
          trigger_text: trig.text,
          answerChecks: trig.answerChecks
        });
      }
    }

    // 4 Unambiguous return control probes: 2x2 (expected in {"1","2"} x recent_relevant in {"1","2"})
    for (const expected of ['1', '2']) {
      for (const recent of ['1', '2']) {
        const trig = spec.unambiguous_triggers[expected];
        list.push({
          id: `${spec.domain}-unambig-e${expected}-r${recent}`,
          domain: spec.domain,
          kind: 'unambiguous',
          expected,
          recent_relevant: recent,
          older_relevant: recent === '1' ? '2' : '1',
          congruent_recency: expected === recent,
          candidate_markers: ['1', '2'],
          intervening_marker: '3',
          exclusive_tokens: spec.exclusive_tokens,
          prefix_turns: spec.prefixes[recent],
          trigger_text: trig.text,
          answerChecks: trig.answerChecks
        });
      }
    }
  }

  return list;
}

export const PROBES = freezeDeep(buildProbes());

export const PROBE_MAP = freezeDeep(
  Object.fromEntries(PROBES.map(p => [p.id, p]))
);

export function buildProbeConversationMessages(probe) {
  const messages = [];
  const sourceIds = [];

  for (const t of probe.prefix_turns) {
    const uId = `u${t.turn}`;
    const aId = `a${t.turn}`;
    sourceIds.push(uId, aId);
    messages.push({
      source_id: uId,
      role: 'user',
      content: t.user
    });
    messages.push({
      source_id: aId,
      role: 'assistant',
      content: t.assistant,
      reasoning_content: t.reasoning_content
    });
  }

  const currentSourceId = `u${probe.prefix_turns.length + 1}`;
  sourceIds.push(currentSourceId);
  messages.push({
    source_id: currentSourceId,
    role: 'user',
    content: probe.trigger_text
  });

  return { messages, sourceIds, currentSourceId };
}
