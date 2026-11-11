const cross = [
  { id: 'cross-meter', titles: ['Pump hose routing', 'Water meter overhaul'], aliases: [[], ['meter needle repair']],
    prior: 'I meant meter needle repair.', focus: 'Return to the task from the previous session.' },
  { id: 'cross-ramp', titles: ['背景幕布整理', '舞台轮椅坡道'], aliases: [[], ['backstage ramp fit']],
    prior: '我说的是 backstage ramp fit。', focus: 'Continue the one I named in the other session.' },
  { id: 'cross-map', titles: ['展品入库登记', '盲文展签编排'],
    prior: '我指的是盲文展签编排。', focus: '回到上个会话我指的任务。' },
  { id: 'cross-roof', titles: ['Roof inspection rota', 'Roof latch survey'],
    prior: 'The task I meant was Roof latch survey.', focus: 'Go back to the task from the previous session.' },
]
const binding = [
  { id: 'binding-cabinet', titles: ['Cabinet inventory', 'Cabinet hinge replacement'],
    prior: 'I meant Cabinet inventory.', focus: 'Switch to Cabinet hinge replacement.' },
  { id: 'binding-volunteer', titles: ['义卖志愿者排班', '义卖零钱箱交接'],
    prior: '我指的是义卖志愿者排班。', focus: '切到义卖零钱箱交接。' },
  { id: 'binding-sound', titles: ['礼堂投影清单', 'Stage microphone calibration'],
    prior: '我说的是礼堂投影清单。', focus: '继续 Stage microphone calibration。' },
  { id: 'binding-door', titles: ['Door sign lettering', 'Door closer inspection'],
    prior: 'I meant Door sign lettering.', focus: 'Resume Door closer inspection.' },
]
const negative = [
  { id: 'negative-twin', titles: ['Loading door camera', 'Lobby camera'], aliases: [['door camera check'], ['door camera check']],
    prior: 'I meant door camera check.', focus: 'Return to the task from the previous session.' },
  { id: 'negative-denied', titles: ['储藏室出入记录', '门窗密封检修'], denied: true,
    prior: '我指的是门窗密封检修。', focus: '回到上个会话我指的任务。' },
  { id: 'negative-missing', titles: ['Seed tray labels', 'Garden gate paint'],
    prior: 'I meant the bicycle stand.', focus: 'Go back to the task from the previous session.' },
  { id: 'negative-quote', titles: ['茶室清扫', 'Tea urn cable check'],
    prior: 'I meant Tea urn cable check.', focus: '“Switch to Tea urn cable check” 是培训示例，不是当前指令。' },
]
export const conditions = [
  ...cross.flatMap(story => ['off', 'on'].map(mode => ({ family: 'cross_session', story, mode,
    expectedIndex: mode === 'on' ? 1 : null }))),
  ...binding.map(story => ({ family: 'binding_conflict', story, mode: 'on', expectedIndex: 1 })),
  ...negative.map(story => ({ family: 'insufficient_evidence', story, mode: 'on', expectedIndex: null })),
]
