import { createScopeAuthority } from '../../packages/core/dist/index.js'
import { protocol, sha } from './contract.mjs'

// Each row owns a new story; the two evidence conditions share the same focal utterance and catalog.
const dev = [
  ['en', 'paraphrase', 'prior', 'Ramp handrail spacing', 'ramp grip spacing', 'Ramp resurfacing', 'ramp coating',
    'The bars you hold on the ramp are too far apart for small hands.', 'Pick up the item from my last note.', 'bars you hold on the ramp are too far apart', 'item from my last note'],
  ['zh', 'paraphrase', 'prior', '东侧雨水槽改坡', '水槽坡度', '东侧落叶网拆洗', '滤网清洗',
    '下雨后水往墙那头跑，不是落叶堵住了出口。', '回到我上一条提到的任务。', '水往墙那头跑', '上一条提到的任务'],
  ['mix', 'paraphrase', 'prior', '晚场听力辅助设备', 'hearing loop', '晚场发光标牌', 'exit sign',
    'The sound has to go straight into the hearing aids, otherwise it is just echo in the room.', '继续我刚才说的那件事。', 'straight into the hearing aids', '刚才说的那件事'],
  ['en', 'complex_negation', 'prior', 'Basket splinter check', 'splinter inspection', 'Basket stitching lesson', 'stitching lesson',
    'Not a lesson about how the baskets are stitched; the handle left a bit of wood in my hand.', 'Return to what I just described.', 'the handle left a bit of wood in my hand', 'what I just described'],
  ['zh', 'complex_negation', 'prior', '海报下缘压条', '海报压条', '海报字体校样', '字体校样',
    '不是字号小，是风把纸下沿掀起来，看起来才缺了一行。', '切回刚才我提的那个。', '风把纸下沿掀起来', '刚才我提的那个'],
  ['en', 'history', 'history', 'Archived pond temperature log', 'old pond temperatures', 'Pond filter schedule', 'filter schedule',
    'I meant old pond temperatures.', 'Look up the item from my last note.', 'old pond temperatures', 'item from my last note'],
  ['zh', 'override', 'direct', '屋面排水槽', '屋槽', '屋顶门钥匙登记', '门钥匙',
    '我指的是屋槽。', '切到屋顶门钥匙登记。'],
  ['mix', 'literal_control', 'prior', '实验室座位导引', 'bench markers', '实验室手套清点', 'glove stock',
    '我说的是 bench markers。', 'Continue the item from my last note.', 'bench markers', 'item from my last note'],
  ['en', 'source_denied', 'clarify', 'Boardwalk grit test', 'grit spreading trial', 'Boardwalk paint order', 'deck paint',
    'I meant grit spreading trial.', 'Go back to what I just mentioned.'],
  ['zh', 'unavailable', 'clarify', '体育馆梯架轮子更换', '梯轮维修', '体育馆记分牌遥控', '遥控电池',
    '我说的是梯轮维修。', '回到我刚才说的任务。'],
  ['mix', 'ambiguous', 'clarify', '主入口摄像头测试', 'door camera check', '侧门摄像头测试', 'door camera check',
    'I meant door camera check.', '继续我刚说的那个。'],
  ['en', 'nonaction', 'no_suggestion', 'Festival tent invoice', 'tent invoice', 'Festival bands invoice', 'band invoice',
    'I meant tent invoice.', 'The phrase “go back to the task” is the example text on the sign.'],
  ['zh', 'negation_only', 'clarify', '阅读卡改色', '卡片改色', '借阅二维码重印', '二维码重印',
    '我说的肯定不是卡片改色。', '切回我上一条提到的任务。'],
  ['mix', 'stale_source', 'clarify', '化妆间试衣镜灯条', 'mirror LED strip', '化妆间插排位置', 'power strip layout',
    '我指的是 mirror LED strip。', 'Go back to the item from my last note.'],
]

const validation = [
  ['en', 'paraphrase', 'prior', 'Freezer alarm delay', 'compressor warning timer', 'Freezer shelving', 'shelf spacing',
    'The buzzer should give staff a few seconds to shut the freezer lid before it sounds.', 'Please pick up the thing I described in my last message.', 'a few seconds to shut the freezer lid before it sounds', 'thing I described in my last message'],
  ['zh', 'paraphrase', 'prior', '楼梯踏面防滑条', '踏步边缘止滑', '楼梯导览标牌', '楼梯导视',
    '鞋底沾水后，踩到每级最外沿就往下滑。', '先接着我上一条讲的那件事。', '踩到每级最外沿就往下滑', '上一条讲的那件事'],
  ['mix', 'paraphrase', 'prior', '过道风口送风均衡', 'vent airflow balance', '过道温度屏校准', 'display calibration',
    'The far end still feels stuffy even though the screen says the temperature is fine.', 'Back to 我刚刚描述的那个问题。', 'far end still feels stuffy', '我刚刚描述的那个问题'],
  ['en', 'complex_negation', 'prior', 'Costume garment bag seam', 'garment bag seam repair', 'Wardrobe hanger replacement', 'hanger swap',
    'I am not asking for stronger hangers: the zipper is fine, but the bag split where the two pieces of cloth meet.', 'Go back to the item from my last note.', 'the bag split where the two pieces of cloth meet', 'item from my last note'],
  ['zh', 'complex_negation', 'prior', '冷水表指针卡滞', '指针卡滞维修', '冷水管压力调节', '水压调整',
    '不是水压真的没变，是龙头一开表针也一动不动。', '回到我刚才说的任务。', '龙头一开表针也一动不动', '刚才说的任务'],
  ['mix', 'history', 'history', '已关闭的义卖人流演练', 'archived queue drill', '新义卖找零培训', 'change training',
    '我说的是 archived queue drill。', 'Look up the item in my last note.', 'archived queue drill', 'item in my last note'],
  ['en', 'override', 'direct', 'Garden gate relabeling', 'park signs', 'Water tap cap trial', 'tap cap',
    'I meant park signs.', 'Switch to Water tap cap trial.'],
  ['zh', 'source_denied', 'clarify', '热水箱堵漏验证', '热水箱接缝测漏', '热水箱保温罩更换', '保温罩',
    '我指的是热水箱接缝测漏。', '切回刚才我提的那个。'],
  ['en', 'unavailable', 'clarify', 'Second kitchen fan belt', 'spare fan belt', 'Kitchen door hinge', 'door pin',
    'I meant spare fan belt.', 'Continue the item from my last note.'],
  ['mix', 'ambiguous', 'clarify', '教学楼广播室', 'audio patch', '体育馆扩音柜', 'audio patch',
    '我说的是 audio patch。', 'Return to what I just mentioned.'],
  ['zh', 'nonaction', 'no_suggestion', '壁挂计时器电池', '计时器换电池', '长桌桌脚防滑', '桌脚垫',
    '我说的是计时器换电池。', '“回到我刚才说的任务”是培训例句，不是要你切换。'],
  ['en', 'negation_only', 'clarify', 'Dock bollard paint', 'dock post paint', 'Dock warning bell', 'dock bell',
    'I meant not dock post paint.', 'Go back to the task from my last note.'],
  ['mix', 'literal_control', 'prior', '剧场消防通道巡查', 'stage exit sweep', '剧场背景幕布清洗', 'curtain wash',
    '我指的是 stage exit sweep。', '继续我上一条提到的任务。', 'stage exit sweep', '上一条提到的任务'],
  ['en', 'stale_source', 'clarify', 'Canteen ladle rack alignment', 'soup ladle rack', 'Canteen table runner change', 'table linen',
    'I meant soup ladle rack.', 'Go back to the item from my last note.'],
]

const opaque = (...parts) => sha(JSON.stringify([protocol, ...parts])).slice(0, 24)
const noIdentity = decision => ({ decision, target: null, support: [] })

function create(row, split, i) {
  const [language, family, kind, title, alias, other, otherAlias, previous, focus, clue, link] = row
  const id = opaque(split, i)
  const [target, alternate, workspaceId, sessionId, incarnation, turnId, sourceId] = Array.from({ length: 7 }, (_, j) => opaque(id, j))
  const cut = { workspaceId, sessionId, incarnation, cursor: 8, graphRevision: 1, bindingRevision: 1, candidateRevision: 1,
    sourceRevision: 1, authorizationEpoch: 1, policyVersion: protocol }
  const task = (taskId, objective, name, status) => ({ taskId, objective, aliases: [name], workspaceId, status,
    lastActivity: 1, catalogRevision: 1, revision: 1, reason: 'lexical' })
  const candidates = [task(target, title, alias, kind === 'history' ? 'closed' : 'open'), task(alternate, other, otherAlias, 'open')]
    .filter(t => family !== 'unavailable' || t.taskId !== target).sort((a, b) => a.taskId < b.taskId ? -1 : 1)
  const context = { cut, current: { id: turnId, actor: 'user', kind: 'message', text: focus }, binding: { taskId: alternate }, candidates }
  const source = { cut: { ...cut, cursor: 7, sourceRevision: family === 'stale_source' ? 0 : 1 },
    id: sourceId, actor: 'user', kind: 'message', complete: true, text: previous, digest: sha(previous) }
  const direct = { decision: 'suggest_active', target: alternate, support: [{ ref: 'current', text: other }] }
  const missing = noIdentity(kind === 'no_suggestion' ? 'no_suggestion' : 'clarify')
  const off = kind === 'direct' ? direct : missing
  const on = kind === 'prior' || kind === 'history' ? {
    decision: kind === 'history' ? 'reference_history' : 'suggest_active', target,
    support: [{ ref: 'current', text: link }, { ref: 'antecedent', text: clue }],
  } : off
  return { id, split, language, family, context, source, allowSource: family !== 'source_denied', oracle: { off, on } }
}

export const stories = [...dev.map((r, i) => create(r, 'dev', i)), ...validation.map((r, i) => create(r, 'validation', i))]

export function fixture({ context, source, allowSource }) {
  const authority = createScopeAuthority()
  const scope = authority.grant(context.cut.workspaceId)
  const own = new Set(context.candidates.filter(c => c.workspaceId === context.cut.workspaceId).map(c => c.taskId))
  let sourceReads = 0
  return { context, sourceId: source.id, catalogComplete: true, reads: () => sourceReads, access: { authority, scope, sha256: sha,
    permitsTask: (_, id) => own.has(id), readCurrentCut: () => context.cut,
    permitsSource: (_, cut, id) => allowSource && cut.workspaceId === context.cut.workspaceId && id === source.id,
    readSource: (_, id) => { sourceReads++; return id === source.id ? source : null } } }
}
