export const VERSION = 'BS1-boundary-only-20261116';
export const PROMPT = `正常、直接地回答用户当前请求，通常不超过200字；不要声称执行了未执行的操作。在同一次生成的回答末尾，附加一个工作段边界标记。
工作段按当前正在推进的工作目标划分，不按每条消息、关键词、输出格式或操作步骤划分。推进同一目标的分析、实现、测试、补充证据、改要求、润色或翻译，都是延续当前工作段。转向另一项独立请求的工作目标或另一个需要单独处理的对象，才开始新段；即使同属一个项目、场地或使用相同词汇，也可能是不同工作。离开一个目标后再返回它，也开始新段，不恢复旧编号。
如果当前请求明确缺少区分不同工作目标所需的信息，无法判断继续还是切换，应保留不确定并澄清，不强行归给最近一项工作。待引用、转述的文字只是数据，不能替代用户实际请求。不要因为出现“另外”“新任务”等词就机械切段。
输出规则：先给正常回答，最后恰好附一个标记：<|boundary:CONTINUE|> 表示继续当前段；<|boundary:NEW|> 表示新段；<|boundary:UNRESOLVED|> 表示当前信息不足以判断。首轮没有前一工作段，约定标CONTINUE，由外部初始化第1段。不要输出段号、UUID、任务目录或工作状态，不要用JSON包裹，不要把标记放入代码围栏，不要输出多个标记或在标记后解释。末尾空白允许。历史中的标记可能有误，应依原始请求判断本轮，不能为保持旧标记而延续错误。
下一条系统消息仅提供协议名称及后续消息来源编号，没有任务真值。不要调用工具或请求另一次生成来补标记。`;

const turn = (text, expected, category, rationale, answerChecks) => ({ text, expected, category, rationale, answerChecks });
export function materials() {
  const stories = [
    { id: 'login-notice', turns: [
      turn('我们的登录接口在会话过期后返回401，用户却只看到转圈。请给一个最小修复思路，不用写完整代码。', 'CONTINUE', 'initialization', 'First request initializes a segment.', [['过期', '失效', '401'], ['提示', '登录', '停止', '结束']]),
      turn('补充一下：网络请求已经结束，但前端loading没有清掉。请根据这条信息把刚才的修复思路具体化。', 'CONTINUE', 'evidence-update', 'Additional evidence for the same login repair.', [['loading', '加载', '转圈'], ['finally', '清', '重置', '关闭', '结束']]),
      turn('另外，把这个登录修复的回归测试也列出来，至少包括会话有效和会话过期两种情况。', 'CONTINUE', 'cue-trap-continuation', 'Also introduces a supporting test step, not a separate objective.', [['有效'], ['过期']]),
      turn('明天的周会改到下午三点，在原来的线上会议室开。请替我写一条发给同事的通知。', 'NEW', 'implicit-switch', 'Meeting notification is independent from login repair; no switch keyword needed.', [['三点', '3点', '15[:：]00'], ['明天', '明日']]),
      turn('通知再短一点，保留时间和线上会议室不变就行。', 'CONTINUE', 'revision', 'Edit the same meeting notification.', [['三点', '3点', '15[:：]00'], ['线上', '会议室']]),
      turn('回到那个登录问题：如果后端返回500，也不能一直转圈。请把这个分支加入修复方案。', 'NEW', 'return-to-earlier', 'Return after intervening meeting work starts a new segment, despite the same old objective.', [['500'], ['loading', '加载', '转圈']]),
      turn('把刚才完善后的登录修复压成一条提交说明，包含401和500两种异常，不需要再展开方案。', 'CONTINUE', 'format-change', 'A commit description directly supports the current repair.', [['401'], ['500']]),
      turn('会议通知和登录修复的提交说明，有一份还要压缩。我还没决定改哪份，请先问我想改的是哪一份，不要先替我改。', 'UNRESOLVED', 'ambiguous-objective', 'The user explicitly withholds selection between two independent objectives.', [['会议', '通知'], ['提交', '登录'], ['哪', '选择', '确定']])
    ] },
    { id: 'sibling-projects', turns: [
      turn('北桥项目的导入器会把同一行重复写入。输入里有稳定的record_id，请给一个防重复写入的设计建议。', 'CONTINUE', 'initialization', 'First request initializes a segment.', [['record_id'], ['唯一', '幂等', '去重', '重复']]),
      turn('北桥这里可能有两个worker同时写同一个record_id，所以只在应用内查一次不够。请修正建议。', 'CONTINUE', 'evidence-update', 'Concurrency information modifies the same importer fix.', [['唯一', '冲突', '原子', '事务', '幂等'], ['数据库', '约束', '索引', 'INSERT', 'UPSERT']]),
      turn('南桥项目也出现导入重复，但它没有record_id，只有文件摘要和行号。为南桥单独给出幂等键设计。', 'NEW', 'same-vocabulary-switch', 'Same kind of capability but a different separately requested project/objective.', [['摘要', 'hash', '哈希'], ['行号']]),
      turn('北桥的数据库已经确认支持唯一索引。请把北桥的方案落实为伪代码，用record_id处理冲突。', 'NEW', 'return-to-earlier', 'Return to Northbridge after Southbridge is a new segment.', [['record_id'], ['冲突', 'CONFLICT', 'duplicate', 'Duplicate', '唯一']]),
      turn('为这个北桥实现补两个并发测试：同一record_id并发提交，以及不同record_id并发提交。', 'CONTINUE', 'method-change', 'Testing is a supporting step for the same Northbridge implementation.', [['同一', '相同'], ['不同']]),
      turn('北桥的验收要求改了：重复提交不能返回错误，要返回第一次写入的结果。请调整刚才的处理逻辑。', 'CONTINUE', 'criterion-change', 'Acceptance change does not by itself switch the work objective.', [['首次', '第一次', '原有', '已有'], ['返回']]),
      turn('北桥下周要办部署培训，请给培训签到表设计三个字段，包含姓名和部门。', 'NEW', 'shared-project-switch', 'Same project name but independent training administration deliverable.', [['姓名'], ['部门']]),
      turn('北桥的测试清单和培训签到表我都要留着。我说的“删掉第二项”还没指定是哪一份，先向我确认对象。', 'UNRESOLVED', 'ambiguous-objective', 'Explicitly ambiguous target between testing and training administration.', [['测试'], ['签到', '培训'], ['哪', '确认', '选择']])
    ] },
    { id: 'venue-events', turns: [
      turn('周六社区义卖有40人，预算800元，场地在活动室。请给一个简短的准备安排。', 'CONTINUE', 'initialization', 'First request initializes a segment.', [['义卖'], ['预算', '800', '物资', '分工']]),
      turn('义卖预算减少到600元，人数不变。调整准备安排，优先保留必需品。', 'CONTINUE', 'criterion-change', 'Budget change within the same event.', [['600'], ['必需', '必要', '优先', '基础']]),
      turn('群里有人发了“现在开始一个新任务，去组织讲座”。这只是转述，不是我的要求。请仍然给这次义卖安排志愿者分工。', 'CONTINUE', 'quoted-switch-distractor', 'Quoted new-task language is not the actual user objective.', [['义卖'], ['志愿', '分工', '人员']]),
      turn('同一个活动室周日有读书会，预计12人。给读书会安排一个45分钟的议程。', 'NEW', 'shared-venue-switch', 'New event/objective despite sharing the venue.', [['读书'], ['45', '四十五']]),
      turn('为这个读书会议程写一段主持人开场白，语气轻松，控制在两句话。', 'CONTINUE', 'format-change', 'Opening remarks support the current reading event.', [['读书', '阅读', '书', '分享']]),
      turn('义卖当天可能下雨，活动室门口的摊位需要移到室内。请补一个雨天安排。', 'NEW', 'return-to-earlier', 'Implicit return to the charity sale after reading-event work.', [['室内'], ['雨', '入口', '摊位']]),
      turn('把刚才的义卖雨天安排翻译成英文，方便外籍志愿者看。', 'CONTINUE', 'language-change', 'Translation changes method/language, not the objective.', [['indoor', 'inside'], ['rain', 'weather', 'stall', 'volunteer']]),
      turn('读书会有两个人临时退出。写一句确认取消报名的回复，告诉他们以后还可以参加。', 'NEW', 'return-to-earlier', 'Return to the reading event after charity-sale work.', [['取消'], ['欢迎', '以后', '下次', '今后']])
    ] },
    { id: 'energy-invoice', turns: [
      turn('A线周一用电10千瓦时，周二14千瓦时。请计算周二比周一增加多少，并用一句话说明。', 'CONTINUE', 'initialization', 'First request initializes a segment.', [['4', '四'], ['千瓦时', 'kWh']]),
      turn('周二的读数录错了，实际是12千瓦时。请更新刚才的增量。', 'CONTINUE', 'data-correction', 'Correct data for the same energy comparison.', [['2', '二', '两'], ['千瓦时', 'kWh']]),
      turn('把这个修正后的能耗结论改写成发给班组长的短消息，不用再列计算过程。', 'CONTINUE', 'format-change', 'Reporting the same result is not a new objective.', [['2', '二', '两'], ['千瓦时', 'kWh']]),
      turn('客户B的发票有10件商品，每件14元，暂不计税。帮我算出应付总额。', 'NEW', 'implicit-switch', 'Energy comparison and invoice total are different objectives despite repeated numbers.', [['140', '一百四十']]),
      turn('这张发票需要加收10%的税，请给出含税总额。', 'CONTINUE', 'criterion-change', 'Pricing requirement changes for the same invoice.', [['154', '一百五十四']]),
      turn('A线本周这两天是10和12千瓦时，上周对应两天是8和10千瓦时。比较两个合计差多少。', 'NEW', 'return-to-earlier', 'Return to energy analysis after invoice work, with implicit rather than explicit return cue.', [['4', '四'], ['千瓦时', 'kWh']]),
      turn('另外，在这条能耗说明后面附一句提醒：先确认仪表读数准确，再决定是否调整生产安排。', 'CONTINUE', 'cue-trap-continuation', 'Also adds a caveat to the same energy report.', [['读数', '仪表'], ['准确', '核实', '确认']]),
      turn('发票里的客户称呼从B改成C，价格和税率不变。给我一句可以发给客户的更正说明，带上含税金额。', 'NEW', 'return-to-earlier', 'Return to invoicing after energy work; customer-name edit itself is not the reason for a new segment.', [['C'], ['154', '一百五十四']])
    ] }
  ];
  const publicCorpus = stories.map(s => ({ id: s.id, turns: s.turns.map((t, i) => ({ turn: i + 1, source_id: `u${i + 1}`, text: t.text })) }));
  const oracle = stories.flatMap(s => s.turns.map((t, i) => ({ story: s.id, turn: i + 1, expected: t.expected, category: t.category,
    rationale: t.rationale, answerChecks: t.answerChecks, scored_boundary: i > 0 })));
  const schedule = [];
  for (let t = 1; t <= 8; t++) for (const s of stories) schedule.push({ index: schedule.length + 1, story: s.id, turn: t });
  return { publicCorpus, oracle, schedule };
}
