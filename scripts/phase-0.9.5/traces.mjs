import { createHash } from 'node:crypto'

// One authored trajectory per row; transformations are paired tests, not independent utterances.
const development = [
  ['s01', 'en', 'active', 'Ferry Timetable', 'winter crossings', 'Ticket prices', 'Continue winter crossings.'],
  ['s02', 'zh', 'active', '学校运动会补水点', '终点饮水台维修', '终点饮水台地图', '切到终点饮水台维修。'],
  ['s03', 'mix', 'active', '展柜灯光调整', 'left-case dimmer', '展柜清洁计划', '回到 left-case dimmer。'],
  ['s04', 'en', 'active', 'Garden key register', 'spare key receipts', 'Door lock inspection', 'Return to spare key receipts.'],
  ['s05', 'zh', 'active', '校报插图复审', '校报封面线稿', '校报正文排版', '继续校报封面线稿。'],
  ['s06', 'en', 'active', 'Storage bin labels', 'blue crate inventory labels', 'Blue crate hinge replacements', 'Switch to blue crate inventory labels.'],
  ['s07', 'mix', 'active', '纸箱入库模板', 'receiving form', '门卫访客名单', '切回 receiving form。'],
  ['s08', 'zh', 'active', '旧宅门槛测量', '大门高差复核', '大门刷漆报价', '回到大门高差复核。'],
  ['s09', 'en', 'history', 'Spring ramp survey', 'old courtyard grade notes', 'Winter access plan', 'Look up old courtyard grade notes.'],
  ['s10', 'zh', 'history', '停用的借伞登记册', '春季借伞旧台账', '新雨具订购', '查阅春季借伞旧台账。'],
  ['s11', 'en', 'prior', 'Wardrobe hinge test', 'costume cabinet latch', 'Dressing room roster', 'Go back to the one I just confirmed.'],
  ['s12', 'mix', 'prior', '排练表打印稿', 'print rehearsal handout', '排练录音整理', '回到我刚确认的那个任务。'],
]

const validation = [
  ['s13', 'en', 'active', 'Harbor noise log', 'east pier sound readings', 'East pier visit permits', 'Resume east pier sound readings.'],
  ['s14', 'zh', 'active', '社区晒场护栏', '西侧护栏打样', '晒场入场指引', '回到西侧护栏打样。'],
  ['s15', 'mix', 'active', '手语场次字幕', 'evening captions', '晚场场地图', '继续 evening captions。'],
  ['s16', 'en', 'active', 'Orchard frost report', 'morning thermometer check', 'Orchard irrigation', 'Go back to morning thermometer check.'],
  ['s17', 'zh', 'active', '溪谷步道修护', '溪谷步道修护', '溪谷步道照片集', '切回溪谷步道修护。'],
  ['s18', 'mix', 'active', '空调滤芯盘点', 'filter stocktake', '空调噪声测试', 'Switch to filter stocktake.'],
  ['s19', 'en', 'history', 'Library lock audit', 'first-floor obsolete lock report', 'Locksmith visit booking', 'Look up first-floor obsolete lock report.'],
  ['s20', 'zh', 'history', '临时停车场结案', '旧停车位划线方案', '临时站台围栏', '查看旧停车位划线方案。'],
  ['s21', 'mix', 'history', '旧路演讲台验收', 'retired stage clearance', '现行路演字幕', '查一下 retired stage clearance。'],
  ['s22', 'zh', 'prior', '天窗合页测试', '天窗铰链样品', '天窗玻璃报价', '继续我刚选的任务。'],
  ['s23', 'en', 'prior', 'Appliance handover checklist', 'lobby kettle handover', 'Fire alarm drill', 'Return to the task I just confirmed.'],
  ['s24', 'mix', 'prior', '巡展口译排班', 'interpreter roster', '巡展海报校对', 'Go back to 我刚确认的那个任务。'],
]

export const protocol = 'acmi-095-identity-traces-v1'
const rows = (split, stories) => stories.map(([id, language, mode, title, alias, other, text]) => ({
  id, split, language, mode, title, alias, other, text,
}))

export const stories = [...rows('dev', development), ...rows('validation', validation)]
const candidate = (id, objective, workspaceId, fields = {}) => ({
  taskId: id, workspaceId, objective, aliases: [], status: 'open', lastActivity: 1,
  catalogRevision: 1, revision: 1, reason: 'lexical', ...fields,
})
const result = (status, taskId = null) => ({ status, taskId })
const clarify = result('clarify')
const none = result('no_suggestion')
const opaque = (cluster, slot) => createHash('sha256').update(JSON.stringify([protocol, cluster, slot])).digest('hex').slice(0, 20)

function casesFor(story) {
  const { id, mode, title, alias, other, text, language } = story
  const historical = mode === 'history'
  const taskId = opaque(id, 0), alternateId = opaque(id, 1), workspaceId = opaque(id, 2)
  const cut = { workspaceId, sessionId: opaque(id, 3), incarnation: 'run1', cursor: 4,
    graphRevision: 1, bindingRevision: 1, candidateRevision: 1, sourceRevision: 1, authorizationEpoch: 1, policyVersion: protocol }
  const target = candidate(taskId, title, workspaceId, { aliases: [alias], status: historical ? 'closed' : 'open' })
  const alternate = candidate(alternateId, other, workspaceId)
  const dummy = candidate(opaque(id, 4), 'Quarterly handover slips', workspaceId)
  const ordered = taskId < alternateId ? [target, alternate] : [alternate, target]
  const hostTrace = [
    { event: 'catalog_snapshot', cursor: 1, catalogRevision: 1, taskIds: ordered.map(c => c.taskId) },
    { event: 'current_binding_snapshot', cursor: 2, taskId: alternateId },
    ...(mode === 'prior' ? [{ event: 'explicit_user_selection', cursor: 3, eventId: opaque(id, 5), taskId }] : []),
  ]
  const selection = hostTrace.find(e => e.event === 'explicit_user_selection')
  const prior = selection && { kind: selection.event, cut: { ...cut, cursor: selection.cursor },
    eventId: selection.eventId, taskId: selection.taskId, taskRevision: target.revision }
  const base = { context: { cut, current: { id: opaque(id, 6), text, actor: 'user', kind: 'message' },
    binding: { taskId: alternateId }, candidates: ordered }, enabled: true, catalogComplete: true,
    ...(prior ? { prior } : {}) }
  const expected = result(historical ? 'reference_history' : 'suggest_active', taskId)
  const reference = language === 'zh' ? historical ? '查看那个任务。' : '回到之前那个任务。'
    : historical ? 'Look up that task.' : 'Go back to the previous task.'
  const explicit = (historical ? 'Look up ' : 'Switch to ') + 'task:' + taskId + '.'
  const replace = (input, update, props = {}) => ({ ...input, ...props, context: { ...input.context, ...update } })
  const utterance = (line, fields = {}) => ({ ...base.context.current, text: line, ...fields })
  const cases = []
  const add = (transform, input, oracle, { denied = [], invariant = false, trace = hostTrace } = {}) => {
    cases.push({ id: id + '.' + transform, cluster: id, split: story.split, language, transform,
      input, denied, oracle, invariant, trace })
  }
  add('base', base, expected)
  add('reverse_candidates', replace(base, { candidates: [...ordered].reverse() }), expected, { invariant: true })
  add('binding_reversal', replace(base, { binding: { taskId: historical ? null : taskId } }), expected, { invariant: true })
  add('irrelevant_candidate', replace(base, { candidates: [dummy, target, alternate] }), expected, { invariant: true })
  const swappedCandidates = [{ ...target, objective: other, aliases: [], status: 'open' },
    { ...alternate, objective: title, aliases: [alias], status: target.status }]
  const swappedTrace = hostTrace.map(e => e.event === 'explicit_user_selection' ? { ...e, taskId: alternateId }
    : e.event === 'current_binding_snapshot' ? { ...e, taskId } : e)
  add('evidence_points_to_other', replace(base, { candidates: swappedCandidates, binding: { taskId } },
    prior ? { prior: { ...prior, taskId: alternateId } } : {}), result(expected.status, alternateId), { trace: swappedTrace })
  add('remove_disambiguator', replace(base, { current: utterance(reference) }), clarify)
  add('name_collision', replace(base, { candidates: [target, { ...alternate, aliases: [alias] }] }), prior ? expected : clarify)
  add('incomplete_catalog', replace(base, {}, { catalogComplete: false }), prior ? expected : clarify)
  add('explicit_id_incomplete', replace(base, { current: utterance(explicit) }, { catalogComplete: false }), expected)
  add('task_acl_denial', base, clarify, { denied: [taskId] })
  add('foreign_workspace', replace(base, { candidates: [{ ...target, workspaceId: 'separate-workspace' }, alternate] }), clarify)
  add('stale_catalog', replace(base, { candidates: [{ ...target, catalogRevision: 0 }, alternate] }), clarify)
  add('target_missing', replace(base, { candidates: [alternate] }), clarify)
  add('tool_echo', replace(base, { current: utterance(text, { actor: 'tool', kind: 'causal' }) }), none)
  add('quoted_text', replace(base, { current: utterance('"' + text + '"') }), none)
  add('conditional_text', replace(base, { current: utterance('If the slot is free, ' + text) }), none)
  add('status_flip', replace(base, { candidates: [{ ...target, status: historical ? 'open' : 'closed' }, alternate] }),
    historical ? none : clarify)
  if (historical) add('historical_switch', replace(base, { current: utterance('Switch to task:' + taskId + '.') }), clarify)
  if (prior) {
    add('remove_confirmation', replace(base, {}, { prior: undefined }), clarify, { trace: hostTrace.slice(0, -1) })
    add('stale_confirmation', replace(base, {}, { prior: { ...prior, taskRevision: 0 } }), clarify)
    add('foreign_session_confirmation', replace(base, {}, { prior: { ...prior, cut: { ...prior.cut, sessionId: 'other-session' } } }), clarify)
    const retained = [{ kind: 'identity', taskId, revision: 1, cursor: 3, sourceRevision: 1, ref: opaque(id, 7) }]
    add('hypothesis_only', replace(base, { retained }, { prior: undefined }), clarify, { trace: hostTrace.slice(0, -1) })
  }
  return cases
}

export const buildCases = () => stories.flatMap(casesFor)
