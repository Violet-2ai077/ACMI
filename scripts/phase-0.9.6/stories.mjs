import { createHash } from 'node:crypto'

export const protocol = 'acmi-096-evidence-pairs-v1'
export const hash = s => createHash('sha256').update(s).digest('hex')
const opaque = (id, slot) => hash(JSON.stringify([protocol, id, slot])).slice(0, 24)

// title/alias and task status are Host catalog fields; the prior text is authored separately.
const dev = [
  ['en', 'literal', 'active', 'Community ferry boarding', 'winter pier queue', 'Ferry ticket refunds', 'missed-trip refunds', 'I was talking about winter pier queue.', 'Go back to the item from my last note.'],
  ['zh', 'literal', 'active', '合唱队服装修改', '袖口贴布试样', '合唱队到场登记', '演出到场表', '刚才我提的是袖口贴布试样。', '回到我刚才说的那件事。'],
  ['mix', 'literal', 'active', '印刷盲文版指引', 'Braille door labels', '场地图彩色版', 'colour floor plan', '我指的是 Braille door labels。', 'Continue 我刚说的那个。'],
  ['en', 'literal', 'active', 'Stair varnish schedule', 'north rail drying test', 'Stair lighting', 'landing lamp trial', 'The task I meant was north rail drying test.', 'Let’s pick up the task in my previous message.'],
  ['zh', 'literal', 'active', '琴房门锁轮换', '备用钥匙清点', '琴房清洁', '琴凳除尘', '我说的是备用钥匙清点。', '继续我上一条提到的任务。'],
  ['en', 'contrast', 'active', 'Crate lid seals', 'foam lid seal', 'Crate loan records', 'crate checkout list', 'I meant foam lid seal, not crate checkout list.', 'Return to what I just mentioned.'],
  ['zh', 'contrast', 'active', '校刊插画投票', '封面线稿表决', '校刊字号核对', '标题字校对', '我指的是不是标题字校对，而是封面线稿表决。', '切回刚才我提的那个。'],
  ['mix', 'contrast', 'active', '搬迁推车安排', 'cart reservation', '搬迁备品统计', 'packing tape count', '我说的是 cart reservation，不是 packing tape count。', 'Pick up the task from my last message.'],
  ['en', 'contrast', 'active', 'Rehearsal floor marks', 'chalk entry arrows', 'Rehearsal lighting checks', 'spot dimmer pass', 'I meant not spot dimmer pass but chalk entry arrows.', 'Please go back to the one I just named.'],
  ['zh', 'history', 'history', '旧仓库开门试行', '一月旧开门记录', '现用收货时刻表', '东门收货表', '前一条说的是一月旧开门记录。', '查阅我刚说的那个。'],
  ['en', 'override', 'alternate', 'Winter seed prices', 'early seed price list', 'Seedling counter', 'new shelf inventory', 'I meant early seed price list.', 'Switch to Seedling counter.'],
  ['mix', 'semantic_gap', 'active', '桌面触感说明', 'tactile counter markers', '桌牌装盒', 'table card cartons', 'I meant the little bumps that tell visitors where to tap.', '回到我刚才说的任务。'],
  ['en', 'semantic_gap', 'active', 'Spill tray audit', 'bottle shelf drip tray', 'Spill procedure card', 'cleanup instructions', 'The puddles are under the bottles; I was asking about what catches them.', 'Pick up what I just described.'],
  ['zh', 'semantic_gap', 'active', '玻璃门回弹检查', '玻璃门弹簧检查', '玻璃门贴膜更换', '门上防撞贴', '我说的是门松手以后会猛地弹回来那件事。', '继续我刚才说的那件事。'],
  ['en', 'ambiguous', 'none', 'Nursery sink repair', 'sink request', 'Kitchen sink repair', 'sink request', 'I meant sink request.', 'Go back to the task from my last note.'],
  ['zh', 'nonaction', 'none', '投影机维护', '风扇清灰', '投影布修补', '布角拉链', '我说的是风扇清灰。', '如果小吴同意，回到我刚说的那个。'],
  ['mix', 'unrelated', 'none', '书柜层板', 'top shelf template', '书箱标签', '箱号样张', 'Lunch is probably after two today.', 'Continue the item from my last note.'],
  ['en', 'quotation', 'none', 'Orchard gate latch', 'spring latch', 'Orchard key register', 'spare key list', 'The note says "I meant spring latch".', 'Return to what I just mentioned.'],
]

const validation = [
  ['en', 'literal', 'active', 'Auditorium mobility route', 'balcony wheelchair turn', 'Auditorium seating count', 'balcony seat count', 'My note was about balcony wheelchair turn.', 'Please pick up the item in my previous message.'],
  ['zh', 'literal', 'active', '内河水位板检修', '南堤水尺补漆', '内河巡检照片', '桥下照片整理', '我指的是南堤水尺补漆。', '切回我上一条提到的任务。'],
  ['mix', 'literal', 'active', '校车迟到公告', 'late-bus notice', '校车雨棚试装', 'rain cover fitting', '刚才我提的是 late-bus notice。', 'Go back to 我刚才说的那件事。'],
  ['en', 'literal', 'active', 'Bicycle workshop count', 'small pump stocktake', 'Bicycle wheel repairs', 'rear wheel rebuild', 'The item I named was small pump stocktake.', "Let's continue that item from my last note."],
  ['en', 'contrast', 'active', 'Hill drainage trial', 'gravel trench flow', 'Hill runoff signage', 'wet slope sign', 'I meant gravel trench flow, not wet slope sign.', 'Switch back to the one I just mentioned.'],
  ['zh', 'contrast', 'active', '戏班散场道具复核', '木扇缺件复查', '戏班返程车次', '返程车名单', '我指的是不是返程车名单，而是木扇缺件复查。', '回到我刚才说的任务。'],
  ['mix', 'contrast', 'active', '社区阅览角换灯', 'reading lamp glare', '社区阅览角借阅单', 'checkout slips', '我说的是 reading lamp glare，不是 checkout slips。', '接着做我刚说的那个。'],
  ['en', 'contrast', 'active', 'Rooftop fan commissioning', 'duct airflow check', 'Roof access roster', 'roof access signups', 'I am referring to not roof access signups, but duct airflow check.', 'Return to the task in my last message.'],
  ['zh', 'contrast_gap', 'active', '木台松动板加固', '第三块木板加固', '木台外观维护', '木台重新上漆', '我说的不是给木台换颜色，是把踩着会翘起来的第三块板固定住。', '回到刚才我提的那个。'],
  ['mix', 'history', 'history', '封存的暑期摆摊地图', 'retired summer stall map', '新摊位编号', 'autumn stall numbers', '我说的是 retired summer stall map。', 'Look up the one I just mentioned.'],
  ['zh', 'override', 'alternate', '儿童队面罩数量', '备用面罩登记', '儿童队晚场入口', '晚场入队通道', '前一条说的是备用面罩登记。', '切到儿童队晚场入口。'],
  ['en', 'semantic_gap', 'active', 'Back gate keybox', 'blue gate lockbox repair', 'Back gate lettering', 'gate opening hours sign', "I meant the metal box by the blue gate that won't hold a key anymore.", 'Continue what I just described.'],
  ['zh', 'semantic_gap', 'active', '夏令营水杯领用表', '水杯借出签领', '夏令营水龙头换管', '水龙头更换软管', '刚才说的是每个小组领杯子都要留个名字的事。', '切回我刚才说的那件事。'],
  ['mix', 'semantic_gap', 'active', '工坊热熔胶排气', 'glue fumes extraction', '工坊冷胶备料', 'water-based glue packs', 'It smells as soon as somebody heats the glue gun; that is the work I meant.', 'Pick up the one I just mentioned.'],
  ['en', 'ambiguous', 'none', 'Main studio sound card', 'audio input check', 'Portable booth sound card', 'audio input check', 'I meant audio input check.', 'Return to the item from my last message.'],
  ['zh', 'nonaction', 'none', '地窖除湿机测试', '湿度计回零', '地窖门板贴标', '门板标签样式', '我指的是湿度计回零。', '「回到我刚说的那个」只是我写的按钮示例。'],
  ['mix', 'unrelated', 'none', '园艺剪刀借还', 'shears register', '园艺手套申购', 'winter gloves count', 'FYI 窗外开始下冰雹了。', '切回我刚才说的任务。'],
  ['en', 'negation_only', 'none', 'Raincoat trial', 'hood fit checks', 'Raincoat inventory', 'adult size counts', 'I meant not hood fit checks.', 'Go back to the item in my previous note.'],
]

function make(row, split, i) {
  const [language, family, disposition, title, alias, alternateTitle, alternateAlias, text, focus] = row
  const id = opaque(split, i)
  const taskId = opaque(id, 1), alternateId = opaque(id, 2)
  const cut = { workspaceId: opaque(id, 3), sessionId: opaque(id, 4), incarnation: opaque(id, 5), cursor: 10,
    graphRevision: 1, bindingRevision: 1, candidateRevision: 1, sourceRevision: 1, authorizationEpoch: 1, policyVersion: protocol }
  const task = (taskId, objective, name, status) => ({ taskId, objective, aliases: [name], status, workspaceId: cut.workspaceId,
    lastActivity: 1, catalogRevision: 1, revision: 1, reason: 'lexical' })
  const candidates = [
    task(taskId, title, alias, disposition === 'history' ? 'closed' : 'open'), task(alternateId, alternateTitle, alternateAlias, 'open'),
  ].sort((a, b) => a.taskId < b.taskId ? -1 : 1)
  const source = { id: opaque(id, 6), cut: { ...cut, cursor: 9 }, actor: 'user', kind: 'message',
    complete: true, text, digest: hash(text) }
  const context = { cut, current: { id: opaque(id, 7), text: focus, actor: 'user', kind: 'message' },
    candidates, binding: { taskId: alternateId } }
  const expected = disposition === 'history' ? { status: 'reference_history', taskId }
    : disposition === 'none' ? null : { status: 'suggest_active', taskId: disposition === 'alternate' ? alternateId : taskId }
  return { id, split, language, family, context, source, taskId, alternateId, alternateAlias, expected }
}
export const stories = [...dev.map((r, i) => make(r, 'dev', i)), ...validation.map((r, i) => make(r, 'validation', i))]
