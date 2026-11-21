// TC5-B Experiment B: Verbatim TC5 Two-Story 24-Turn Closed-Loop Corpus
// Exact reconstruction of worktrees/th1-publication/research/phase-0.9.19/continuity-implicit-v1/materials.mjs

function freezeDeep(value) {
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      freezeDeep(value[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const t = (text, task, rationale, answerChecks) => ({ text, task, rationale, answerChecks });

function buildStoriesCorpus() {
  const stories = [
    {
      id: 'pottery-notices',
      turns: [
        t('给成人陶艺课写一份独立的报名确认短信：周六10:00在南楼A室，请带围裙和湿巾。', 'adult', 'Birth of adult pottery confirmation.', [['周六'], ['10[:：]00', '十点'], ['南楼'], ['围裙']]),
        t('另写亲子陶艺课的独立报名确认短信：周六15:00在北楼B室，也请带围裙和湿巾。不要合成两场的总通知。', 'family', 'Independent family artifact shares pottery/apron/wipes/Saturday words.', [['周六'], ['15[:：]00', '三点'], ['北楼'], ['围裙']]),
        t('独自来体验的成年学员可能是第一次接触泥巴，语气放轻松些，时间地点和用品保留。', 'adult', 'Adult recipient uniquely selects first artifact through semantic paraphrase.', [['10[:：]00', '十点'], ['南楼']]),
        t('还有一个独立工作：写一份场地设备检查清单，只查水龙头和照明，不是发给学员的报名短信。', 'equipment', 'Third noncandidate artifact breaks immediate discourse focus on confirmations.', [['水龙头'], ['照明', '灯']]),
        t('再简短一点，只保留需要检查的两项。', 'equipment', 'Immediate ellipsis naturally continues preceding equipment checklist; do not force clarification.', [['水龙头'], ['照明', '灯']]),
        t('把周六陶艺课的报名确认短信压缩成一句，保留上课时间和地点。', null, 'Both established confirmations fit; immediately previous artifact is equipment, not a candidate. Strict oracle asks clarification; earlier candidate recency remains a pragmatic alternative.', [['哪', '确认.*场', '请.*场', '成人.*还是.*亲子', '亲子.*还是.*成人'], ['成人', '亲子']]),
        t('给带小朋友一起动手的家长看的那份。', 'family', 'Fixed clarification selects older family candidate, regardless of preceding assistant guess.', [['15[:：]00', '三点'], ['北楼']]),
        t('不带孩子、自己来做陶器的学员，确认文案里提醒围裙容易弄脏，时间地点也要在。', 'adult', 'Unique adult audience resumes first identity despite shared apron cue.', [['10[:：]00', '十点'], ['南楼'], ['围裙']]),
        t('场地开门前，把检查水龙头和灯是否正常的清单整理成两个勾选项。', 'equipment', 'Return to third artifact; both candidate confirmations now noncurrent.', [['水龙头'], ['灯', '照明']]),
        t('给需要带围裙和湿巾的学员，那条报名确认再写得亲切一点，保留活动安排。', null, 'Both audiences need apron and wipes; no discriminating wording. Latest artifact is checklist; prior candidate recency is recorded, not treated as latent intention.', [['哪', '确认.*场', '请.*场', '成人.*还是.*亲子', '亲子.*还是.*成人'], ['成人', '亲子']]),
        t('是自己来体验、不带小朋友的那场。', 'adult', 'Clarification selects existing adult identity, not new task.', [['10[:：]00', '十点'], ['南楼']]),
        t('家长带孩子做陶器的确认短信也给一版亲切文案，保留时间地点和用品。', 'family', 'Clearly specified family return is the nonabstention contrast.', [['15[:：]00', '三点'], ['北楼'], ['围裙']])
      ]
    },
    {
      id: 'warehouse-queries',
      turns: [
        t('为冷库库存单独写去重查询：表cold_stock，按sku分组，保留updated_at最新的记录。给一段完整SQL。', 'cold', 'Birth of cold-storage inventory query.', [['cold_stock'], ['sku'], ['updated_at'], ['DESC', '最新', '降序']]),
        t('常温仓也需要独立的库存去重查询：表ambient_stock，同样按sku分组、保留updated_at最新记录。给完整SQL，不和冷库合并。', 'ambient', 'Same schema/rule, independent ambient warehouse artifact.', [['ambient_stock'], ['sku'], ['updated_at'], ['DESC', '最新', '降序']]),
        t('需要低温保存的那批商品，时间相同时再按row_id倒序选择一条，给更新后的查询。', 'cold', 'Temperature purpose uniquely selects cold query without table identifier.', [['cold_stock'], ['row_id'], ['updated_at']]),
        t('另外算一笔独立的配送费用：运费48元、搬运费32元，只给费用合计。', 'delivery', 'Third arithmetic task outside either inventory-query candidate.', [['80', '八十']]),
        t('再加5元包装费，现在合计多少？', 'delivery', 'Natural immediately scoped continuation, not ambiguous merely because names omitted.', [['85', '八十五']]),
        t('把库存去重查询的排序部分单独列出来，分组字段也要有。', null, 'Both inventory queries qualify; immediately preceding work is arithmetic. No explicit information-loss warning; strict unique-reference oracle expects clarification.', [['哪', '确认', '冷库.*还是.*常温', '常温.*还是.*冷库'], ['冷库', '常温', 'cold_stock', 'ambient_stock']]),
        t('不用控温存放的那些商品。', 'ambient', 'Clarification resolves to older ambient task; fixed despite any prior guess.', [['sku'], ['updated_at'], ['DESC', '最新', '降序']]),
        t('需要冷藏的商品要保留时间并列时的选行规则，请给完整去重查询。', 'cold', 'Clear return with retained tie-break requirement, not full state schema.', [['cold_stock'], ['row_id'], ['updated_at']]),
        t('配送这笔费用的运费从48元改成50元，搬运和包装费不变，重新算合计。', 'delivery', 'Return to arithmetic task, moves immediate focus away from inventory candidates.', [['87', '八十七']]),
        t('按sku保留最新记录的那份库存查询，写成一句便于同事理解的说明。', null, 'Both cold and ambient meet exact key/latest description. Prior cold recency is a possible conversational convention, not a hidden oracle fact.', [['哪', '确认', '冷库.*还是.*常温', '常温.*还是.*冷库'], ['冷库', '常温', 'cold_stock', 'ambient_stock']]),
        t('用于必须低温保存的商品。', 'cold', 'Clarification restores cold identity after unresolved turn.', [['sku'], ['updated_at'], ['row_id']]),
        t('不需要冷藏的商品也给一句去重说明，沿用那个仓库自己的保留规则。', 'ambient', 'Unique semantic source restores ambient task; unnecessary abstention would fail.', [['sku'], ['updated_at'], ['DESC', '最新', '降序']])
      ]
    }
  ];

  const publicCorpus = stories.map(s => ({
    id: s.id,
    turns: s.turns.map((x, i) => ({
      turn: i + 1,
      source_id: `u${i + 1}`,
      text: x.text
    }))
  }));

  const oracle = [];
  for (const s of stories) {
    const seen = new Map();
    let previous;
    for (const [i, x] of s.turns.entries()) {
      const fresh = x.task !== null && !seen.has(x.task);
      if (fresh) seen.set(x.task, { marker: String(seen.size + 1), turn: i + 1 });
      const birth = seen.get(x.task);
      const kind =
        x.task === null
          ? 'ambiguous'
          : fresh
            ? 'birth'
            : previous === x.task
              ? 'continue'
              : 'return';
      oracle.push({
        story: s.id,
        turn: i + 1,
        task_key: x.task,
        expected: birth?.marker ?? 'UNRESOLVED',
        birth_turn: birth?.turn ?? null,
        kind,
        category: kind === 'return' ? (previous === null ? 'clarified-return' : 'clear-return') : kind,
        rationale: x.rationale,
        answerChecks: x.answerChecks,
        ...(kind === 'ambiguous'
          ? {
              candidate_markers: ['1', '2'],
              most_recent_candidate: '1',
              immediate_previous_marker: '3'
            }
          : {})
      });
      previous = x.task;
    }
  }

  const schedule = [];
  for (let n = 1; n <= 12; n++) {
    for (const s of stories) {
      schedule.push({
        index: schedule.length + 1,
        story: s.id,
        turn: n
      });
    }
  }

  return { stories, publicCorpus, oracle, schedule };
}

export const TC5_CORPUS = freezeDeep(buildStoriesCorpus());
export const STORIES = TC5_CORPUS.stories;
export const PUBLIC_CORPUS = TC5_CORPUS.publicCorpus;
export const ORACLE = TC5_CORPUS.oracle;
export const SCHEDULE = TC5_CORPUS.schedule;
