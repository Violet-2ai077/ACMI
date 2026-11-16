export { PROMPT } from '../continuity-v1/materials.mjs';
export const VERSION = 'TC3-natural-task-marker-continuity-20261116';
const turn = (text, task, rationale, answerChecks) => ({ text, task, rationale, answerChecks });
export function materials() {
  const story = { id: 'overlapping-notices', turns: [
    turn('为云栖读书会写报名成功确认短信：周六14:00在南馆三楼开始，请参加者自带纸质书。只写短信，不涉及缴费。', 'south-confirmation', 'Birth: southern venue registration confirmation, with paper book cue.', [['周六'], ['14[:：]00', '两点', '二点'], ['南馆'], ['纸质书']]),
    turn('云溪读书会也需要一条独立的报名成功确认短信：周日10:00在北馆二楼，自带铅笔做阅读批注。请写文案。', 'north-confirmation', 'Birth: separate client and event, similar registration confirmation but pencil cue.', [['周日'], ['10[:：]00', '十点'], ['北馆'], ['铅笔']]),
    turn('纸质书如果忘带，可以两人共读。把这个选择写进确认短信，语气轻松一点，时间地点也保留。', 'south-confirmation', 'Only southern confirmation mentions bringing a paper book; no client or explicit return cue.', [['共读', '一起读', '一起阅读'], ['周六'], ['南馆']]),
    turn('云栖读书会还要单独写一封收款确认邮件：报名费68元已经到账，不是报名确认短信。邮件只说明收到款项并感谢，不写活动时间地点。', 'paid-receipt', 'Birth: same client as task one, independent paid receipt email rather than registration SMS.', [['68', '六十八'], ['收到', '到账', '收讫'], ['谢']]),
    turn('云溪读书会有些报名者还没付费，要另写付款提醒短信：费用48元，周五18:00截止。不要把它当报名成功确认，语气别催得太急。', 'unpaid-reminder', 'Birth: same client as task two but distinct unpaid deadline reminder.', [['48', '四十八'], ['周五'], ['18[:：]00', '六点', '六时']]),
    turn('做批注用普通铅笔就够了，不需要另外买文具。请把这一点合进给参与者的确认短信，保留活动安排。', 'north-confirmation', 'Pencil annotation uniquely identifies northern registration confirmation, not payment work.', [['铅笔'], ['周日'], ['北馆']]),
    turn('溪岸书店还需要一条独立的自提通知：订单P52的书已备好，周一19:00前到柜B3领取。只写取货短信，不关联读书会报名。', 'pickup-notice', 'Birth: fifth independent short-message artifact, pickup rather than event or payment.', [['P52'], ['B3'], ['周一'], ['19[:：]00', '七点', '七时']]),
    turn('钱已经到账的邮件开头不要像催款。给我一个简短主题，正文也写上实收金额和一句感谢。', 'paid-receipt', 'Only receipt email describes money received; selects paid rather than unpaid task.', [['68', '六十八'], ['谢']]),
    turn('南馆参加者可以把书带在手里，不用额外准备袋子。把这个小提醒合进确认短信，保留共读的选择，不要写成物品购买建议。', 'south-confirmation', 'Venue + paper-book/common-reading cues uniquely select first task; last visit until turn 24.', [['南馆'], ['共读', '一起读', '一起阅读'], ['袋']]),
    turn('截止时间要一眼能看到，但不要用逾期处罚来吓人。付款提醒控制在两句话，金额也保留。', 'unpaid-reminder', 'Only unpaid reminder has payment deadline; amount must come from history.', [['48', '四十八'], ['周五'], ['18[:：]00', '六点', '六时']]),
    turn('取书不用带打印单，出示订单号就行。把这个要求放进领取短信，柜号和最晚到店时间也写清楚。', 'pickup-notice', 'Pickup artifact identified by collecting books and order number, not reading-session books.', [['P52'], ['B3'], ['19[:：]00', '七点', '七时']]),
    turn('批注时可以先用铅笔轻轻标记。确认短信不要变成阅读教程，保留星期、开始时间和楼层即可。', 'north-confirmation', 'Annotation pencil selects northern session; request still edits same registration SMS.', [['周日'], ['10[:：]00', '十点'], ['二楼', '2楼']]),
    turn('收款邮件只作缴费确认，别写成发票，也不要承诺税务用途。请给主题和一句正文，金额不能漏。', 'paid-receipt', 'Paid receipt distinct from pending-payment reminder; no billing artifact requested.', [['68', '六十八'], ['收到', '到账', '收讫', '收款']]),
    turn('如果请朋友代领，给他订单号和柜号就可以。把代领选项加进自提短信，别额外索要身份证。', 'pickup-notice', 'Order/cabinet and proxy collection uniquely ground fifth task.', [['P52'], ['B3'], ['代领', '朋友']]),
    turn('还没交费的人看完应该知道最晚什么时候付款、付多少。改成一句友好的提醒，不要写成已经收到款。', 'unpaid-reminder', 'Unpaid recipient and deadline contrast explicitly with paid receipt semantics, no task label.', [['48', '四十八'], ['周五'], ['18[:：]00', '六点', '六时']]),
    turn('铅笔可以向同伴借，别让人因为没带文具就不来。把这个选项并入报名确认，活动安排也保留。', 'north-confirmation', 'Pencil borrowing selects task two, not paper-book common-reading task one.', [['借'], ['周日'], ['北馆']]),
    turn('如果已经转账，就忽略这条提醒。把这句话放在催缴短信末尾，正文仍带金额和截止时间。', 'unpaid-reminder', 'Conditional already-paid exception edits unpaid reminder; not conversion into paid receipt task.', [['48', '四十八'], ['周五'], ['忽略', '无需', '不用']]),
    turn('实收款项的邮件里不要出现付款链接。给一个温和的标题和一行正文，让收件人知道钱确实收到了。', 'paid-receipt', 'Actual received funds and email medium uniquely select receipt after payment reminder.', [['68', '六十八'], ['收到', '到账', '收讫']]),
    turn('柜子位置已经清楚了，短信里把订单号放在柜号前面，领取期限继续保留。给完整文案。', 'pickup-notice', 'Physical cabinet and order number select pickup, not event venue.', [['P52'], ['B3'], ['周一'], ['19[:：]00', '七点', '七时']]),
    turn('阅读批注的参与者有孩子，语气再亲切一点。请给确认短信，别扩写成课程介绍，星期和地点要在。', 'north-confirmation', 'Reading annotation selects northern session through paraphrased purpose, no pencil field repeated.', [['周日'], ['北馆'], ['二楼', '2楼']]),
    turn('确认款项收到就好，不必说名额锁定，也不要附活动日程。写成可以直接发送的简短邮件，包含金额。', 'paid-receipt', 'Received-money email, not registration artifact or payment reminder; distinct deliverable persists.', [['68', '六十八'], ['收到', '到账', '收讫']]),
    turn('缴费期限用24小时制，金额只出现一次，给我一条完整的温和提醒，保留已付可忽略的说明。', 'unpaid-reminder', 'Deadline/reminder + already-paid exception uniquely identifies fourth task without numeric key in user.', [['48', '四十八'], ['周五'], ['18[:：]00'], ['忽略', '无需', '不用']]),
    turn('代领人到店时也是报订单号，不用打印任何东西。整理成最终领取通知，柜号和期限都别漏。', 'pickup-notice', 'Proxy collection and store visit uniquely select pickup notification.', [['P52'], ['B3'], ['周一'], ['19[:：]00', '七点', '七时']]),
    turn('有人忘带纸质书也别让他为难，两个人一起读就行。请给可直接发送的报名确认短信，带上活动的开始时间和地点。', 'south-confirmation', 'Paper-book/shared-reading context uniquely recovers first task after 14 intervening turns, without client/venue/return words.', [['周六'], ['14[:：]00', '两点', '二点'], ['南馆'], ['三楼', '3楼'], ['共读', '一起读', '一起阅读']])
  ] };
  const publicCorpus = [{ id: story.id, turns: story.turns.map((t, i) => ({ turn: i + 1, source_id: `u${i + 1}`, text: t.text })) }];
  const births = new Map(), oracle = []; let previous;
  for (const [i, t] of story.turns.entries()) {
    const fresh = !births.has(t.task);
    if (fresh) births.set(t.task, { marker: String(births.size + 1), turn: i + 1 });
    const b = births.get(t.task);
    oracle.push({ story: story.id, turn: i + 1, task_key: t.task, expected: b.marker, birth_turn: b.turn,
      kind: fresh ? 'birth' : previous === t.task ? 'continue' : 'return', category: fresh ? 'explicit-birth' : 'content-grounded-return',
      rationale: t.rationale, answerChecks: t.answerChecks });
    previous = t.task;
  }
  return { publicCorpus, oracle, schedule: story.turns.map((_, i) => ({ index: i + 1, story: story.id, turn: i + 1 })) };
}
