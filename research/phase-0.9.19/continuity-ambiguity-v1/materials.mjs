export { PROMPT } from '../continuity-v1/materials.mjs';
export const VERSION = 'TC4-ambiguity-continuity-20261117';
const t = (text, task, rationale, answerChecks) => ({ text, task, rationale, answerChecks });
export function materials() {
  const stories = [
    { id: 'shared-reading', turns: [
      t('写一条周日亲子读书场的报名确认短信：14:00在东馆二楼，请带纸质书，可两人共读。它是一份独立通知。', 'family', 'First registration artifact, family audience.', [['14[:：]00', '两点', '二点'], ['东馆'], ['纸质书']]),
      t('另写周日成人读书场的报名确认短信：16:00在西馆二楼，也请带纸质书，也可两人共读。它与亲子场是两份独立通知。', 'adult', 'Same vocabulary and medium but independent adult artifact.', [['16[:：]00', '四点'], ['西馆'], ['纸质书']]),
      t('给带孩子参加的人写得活泼一点，让小朋友知道忘带书也可以和家长一起读，活动时间地点要有。', 'family', 'Paraphrased audience uniquely selects family artifact despite shared book cue.', [['14[:：]00', '两点', '二点'], ['东馆']]),
      t('还有一项独立工作：为两场活动的志愿者写集合通知，周日13:00到中庭服务台，不是给报名者的确认短信。', 'volunteers', 'Third artifact distinct audience and purpose; no merge by event.', [['13[:：]00', '一点', '一时'], ['中庭']]),
      t('不带孩子的参与者希望语气稳重些。请给他们的报名确认文案，保留带书与共读安排、时间和地点。', 'adult', 'Adult recipient cue selects second task without original title.', [['16[:：]00', '四点'], ['西馆']]),
      t('收到一条脱离上下文的修改意见：“报名确认短信再短一点，时间地点保留。”反馈没有场次标注，可能指这两场中的任意一场。请处理这条修改要求。', null, 'Explicitly detached feedback could refer to either registration artifact; recency is not evidence of intended referent.', [['哪', '哪一', '确认.*场', '请.*场'], ['亲子', '成人']]),
      t('反馈来自带孩子报名的家长，请修改他们收到的短信。', 'family', 'Clarification resolves preceding ambiguity to established first artifact, not a new task.', [['14[:：]00', '两点', '二点'], ['东馆']]),
      t('成年读者独自参加也能找同伴共读，把这句话放进他们的确认短信，时间地点保留。', 'adult', 'Same shared-reading vocabulary, different intended artifact.', [['16[:：]00', '四点'], ['西馆']]),
      t('负责接待的人到达后先在服务台签到。把这个动作合进集合通知，保留时间和地点。', 'volunteers', 'Paraphrased role restores third artifact.', [['13[:：]00', '一点', '一时'], ['中庭'], ['签到']]),
      t('又收到一张没有来源的便条：“把共读那条报名确认改得亲切一点。”两场都安排了共读，便条没有其他信息。请处理。', null, 'Both artifacts include common reading; no unique referent even though latest task is volunteers.', [['哪', '哪一', '确认.*场', '请.*场'], ['亲子', '成人']]),
      t('便条来自不带孩子的那场读者，按他们的活动安排改。', 'adult', 'Clarification selects established second artifact.', [['16[:：]00', '四点'], ['西馆']]),
      t('要和孩子一起来的人不用额外准备书袋。整合成最终报名确认短信，时间地点和忘带书可共读都保留。', 'family', 'Return to first artifact via audience, not shared book/bag terms alone.', [['14[:：]00', '两点', '二点'], ['东馆'], ['共读', '一起读']])
    ] },
    { id: 'shared-ingestion', turns: [
      t('为网页点击日志单独设计去重导入：表web_clicks，用event_id判重，同一事件保留received_at最新的一条。给最小排序片段。', 'web', 'Independent web import with event key and latest-received rule.', [['event_id'], ['received_at'], ['DESC', '最新', '降序']]),
      t('手机端点击日志也要单独做导入方案，表app_clicks，同样按event_id去重并保留received_at最新记录。请给这份独立方案的排序片段。', 'app', 'Same schema and rule, different independently requested source/table.', [['event_id'], ['received_at'], ['DESC', '最新', '降序']]),
      t('浏览器里发生的那些点击，给一段完整的窗口函数去重查询，目标表和保留规则不要换。', 'web', 'Browser source paraphrases web, no need to repeat table name.', [['web_clicks'], ['event_id'], ['received_at']]),
      t('另有一个独立工作：付款回调导入payments，以payment_id判重，保留paid_at最早的一条。给去重查询。', 'payments', 'Distinct ingestion objective despite same dedup capability.', [['payments'], ['payment_id'], ['paid_at'], ['ASC', '最早', '升序']]),
      t('安装在手机里的客户端产生的点击，时间相同时再按row_id倒序选一条。请写完整查询，目标表沿用。', 'app', 'App source selects task two; refinement preserves identity.', [['app_clicks'], ['event_id'], ['row_id']]),
      t('同事只发来一句“点击日志的去重查询加个测试样例”，表名和来源在转发时丢失了，网页端或手机端都有可能。请处理这个要求。', null, 'Explicit lost source means either established click task, not default recent one.', [['哪', '确认', '请.*来源', '请.*端'], ['网页', 'web', '手机', 'app']]),
      t('他说的是浏览器页面产生的那一路，给一个重复事件的简单样例即可。', 'web', 'Clarification selects old web identity.', [['event_id'], ['received_at'], ['最新', '较晚', '更晚', '后', 'DESC']]),
      t('装在手机上的客户端数据也写一个重复事件样例，沿用这一路的时间排序和并列规则。', 'app', 'Shared event terminology must not merge web/app artifacts.', [['event_id'], ['received_at'], ['row_id']]),
      t('钱到账后发来的回调，如果同一笔重复送达两次，解释为什么这里只留最早那条，并写出判重字段。', 'payments', 'Semantic purpose and earliest rule restore payment import.', [['payment_id'], ['最早', '首次', '第一']]),
      t('又有一条脱离上下文的评论：“点击去重的说明再简短点。”它没有表名、设备信息或查询原文，两个点击方案都符合这句描述。请处理。', null, 'No discriminating clue; distinct from latest payments task.', [['哪', '确认', '请.*来源', '请.*端'], ['网页', 'web', '手机', 'app']]),
      t('评论针对装在手机里的客户端，给那一路的简短去重说明。', 'app', 'Clarification selects second identity and existing tie-break refinement.', [['event_id'], ['received_at'], ['row_id']]),
      t('浏览器页面的点击导入最后整理成一段查询，保持本路的原始保留规则，不要混入付款字段。', 'web', 'Final web restoration via semantic source, not repeated table identifier.', [['web_clicks'], ['event_id'], ['received_at'], ['DESC', '最新', '降序']])
    ] }
  ];
  const publicCorpus = stories.map(s => ({ id: s.id, turns: s.turns.map((x, i) => ({ turn: i + 1, source_id: `u${i + 1}`, text: x.text })) }));
  const oracle = [];
  for (const s of stories) {
    const seen = new Map(); let previous;
    for (const [i, x] of s.turns.entries()) {
      const fresh = x.task !== null && !seen.has(x.task);
      if (fresh) seen.set(x.task, { marker: String(seen.size + 1), turn: i + 1 });
      const birth = seen.get(x.task);
      oracle.push({ story: s.id, turn: i + 1, task_key: x.task, expected: birth?.marker ?? 'UNRESOLVED', birth_turn: birth?.turn ?? null,
        kind: x.task === null ? 'ambiguous' : fresh ? 'birth' : 'return', category: x.task === null ? 'ambiguous' : fresh ? 'birth' : previous === null ? 'clarified-return' : 'clear-return',
        rationale: x.rationale, answerChecks: x.answerChecks });
      previous = x.task;
    }
  }
  const schedule = [];
  for (let n = 1; n <= 12; n++) for (const s of stories) schedule.push({ index: schedule.length + 1, story: s.id, turn: n });
  return { publicCorpus, oracle, schedule };
}
