export { PROMPT } from '../continuity-v1/materials.mjs';
export const VERSION = 'TC2-long-task-marker-continuity-20261116';

const turn = (text, task, category, rationale, answerChecks) => ({ text, task, category, rationale, answerChecks });
export function materials() {
  const story = { id: 'similar-exports', turns: [
    turn('海棠客户的订单导出有重复记录，order_id稳定不变，重复时保留created_at最早的一条。请给海棠的订单导出一个简单去重方案。', 'haitang-orders', 'initialization', 'Independent order export for Haitang; earliest creation.', [['order_id'], ['created_at'], ['最早', '升序', 'ASC']]),
    turn('海桐客户也要单独处理订单导出去重，同样有order_id，但这家要求保留updated_at最新的一条。请给海桐的订单导出设计方案。', 'haitong-orders', 'new-similar-client-same-objective', 'Distinct client with similar name, same key, different selection rule.', [['order_id'], ['updated_at'], ['最新', '降序', 'DESC']]),
    turn('海棠的订单导出先补一个SQL排序片段，按之前的规则选出每个订单该留下的那条，不用写完整查询。', 'haitang-orders', 'return-similar-client', 'Return to earliest-created order rule, not preceding latest-updated client.', [['order_id'], ['created_at'], ['ASC', '升序', '最早']]),
    turn('海棠另有一份退款导出需要单独去重，不是刚才的订单导出。退款用refund_id判断重复，并保留processed_at最新的记录。请给退款导出一个方案。', 'haitang-refunds', 'new-same-client-different-objective', 'Same client, explicitly independent refund export.', [['refund_id'], ['processed_at'], ['最新', '降序', 'DESC']]),
    turn('海松客户的订单导出也重复，但没有订单号，只有batch_digest和row_no。请为海松单独设计一个重传时不重复写入的去重键。', 'haisong-orders', 'new-similar-export-different-key', 'Fourth independent export; compound key rather than order id.', [['batch_digest'], ['row_no'], ['组合', '联合', '复合', '一起', '\\+']]),
    turn('海桐那份订单导出，同一个订单有两条记录，updated_at分别为09:00和10:00。沿用这家的规则，应该留下哪条？一句话回答。', 'haitong-orders', 'return-after-two-intervening-births', 'Return to second task with concrete latest-updated selection.', [['10[:：]00']]),
    turn('海桐还要另做一份退款导出去重，用refund_id区分退款，但要保留received_at最早的一次。这份退款工作和海桐订单导出分开，请给出方案。', 'haitong-refunds', 'new-overlapping-client-and-objective', 'Fifth task shares client with task two and refund objective with task three.', [['refund_id'], ['received_at'], ['最早', '升序', 'ASC']]),
    turn('海棠订单导出的要求改一下：还是按原来的订单标识去重，但现在保留创建时间最新的一条。更新这份订单导出的排序片段，别混入退款的字段。', 'haitang-orders', 'return-oldest-with-revised-requirement', 'Identity survives changed selection rule; resolve order vs refund for same client.', [['order_id'], ['created_at'], ['DESC', '降序', '最新']]),
    turn('海松订单导出的文件重传时，batch_digest没有变化，row_no也一样。解释为什么应该只保留一次写入，不要另起一套方案。', 'haisong-orders', 'return-compound-key', 'Return to fourth task after both clients intervened.', [['batch_digest'], ['row_no'], ['幂等', '重复', '一次', '唯一']]),
    turn('海棠那份退款导出，请给一个PARTITION BY加ORDER BY片段，沿用之前为退款约定的字段和保留规则。', 'haitang-refunds', 'return-same-client-confusable-objective', 'Return to task three after five intervening turns; not revised order export.', [['refund_id'], ['processed_at'], ['DESC', '降序', '最新']]),
    turn('海桐的退款导出现在写成一句伪代码，仍按这份退款自己的时间字段保留最早记录，不要沿用另一家退款的时间字段。', 'haitong-refunds', 'return-same-objective-confusable-client', 'Return to task five, contrasting task three with same refund key.', [['refund_id'], ['received_at'], ['ASC', '升序', '最早', 'min']]),
    turn('再回到海桐的订单导出。写一个简短的去重排序片段，订单字段和时间规则都沿用那份订单方案，不是退款方案。', 'haitong-orders', 'return-middle-after-five-intervening-turns', 'Return to task two after five intervening turns; latest update not earliest receipt.', [['order_id'], ['updated_at'], ['DESC', '降序', '最新']]),
    turn('没有订单号、靠文件批次摘要和行号识别记录的那家客户，方案里再补一句：不同批次里即使行号一样，也不能当成同一条。请用原字段名解释。', 'haisong-orders', 'return-implicit-unique-object', 'No client name; unique compound-key description points to task four.', [['batch_digest'], ['row_no'], ['不同', '区别', '区分', '不相同']]),
    turn('最后给海棠的订单导出整理一个去重排序片段，采用我们后来改过的保留规则，不是这家退款的规则，也不是最初的旧要求。', 'haitang-orders', 'return-oldest-after-five-intervening-turns', 'Final return to task one; identity remains first despite intervening similar tasks.', [['order_id'], ['created_at'], ['DESC', '降序', '最新']])
  ] };
  const publicCorpus = [{ id: story.id, turns: story.turns.map((t, i) => ({ turn: i + 1, source_id: `u${i + 1}`, text: t.text })) }];
  const births = new Map(), oracle = []; let previous;
  for (const [i, t] of story.turns.entries()) {
    const fresh = !births.has(t.task);
    if (fresh) births.set(t.task, { marker: String(births.size + 1), turn: i + 1 });
    const b = births.get(t.task);
    oracle.push({ story: story.id, turn: i + 1, task_key: t.task, expected: b.marker, birth_turn: b.turn,
      kind: fresh ? 'birth' : previous === t.task ? 'continue' : 'return', category: t.category, rationale: t.rationale, answerChecks: t.answerChecks });
    previous = t.task;
  }
  return { publicCorpus, oracle, schedule: story.turns.map((_, i) => ({ index: i + 1, story: story.id, turn: i + 1 })) };
}
