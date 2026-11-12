import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { readEvaluation, score } from '../phase-0.9.15/score.mjs'
import { packetFor } from './design.mjs'
import pin from './frozen.json' with { type: 'json' }
import { readLinkProposals } from './link.mjs'

export function decideLink(hostOK, { A, B }, stopped = null) {
  if (stopped) return 'INCONCLUSIVE_STOPPED'
  if (!hostOK) return 'HOST_GATE_NOT_MET'
  const pass = B.userExact >= 10 && B.assistantExact >= 10 && B.userExact >= A.userExact && B.assistantExact - A.assistantExact >= 2
    && B.targetedBoth >= 4 && B.linkedTargeted >= 4 && !B.linkControls && !B.falseNewTargeted && B.trueNewBoth === 2
    && !B.wrongExisting && !B.wrongAnchorInheritance && B.answerPassed >= 10 && B.answerPassed >= A.answerPassed
  return pass ? 'PASS_SCOPED_MODEL' : 'PASS_HOST_MODEL_GATE_NOT_MET'
}

export function scoreLink(data) {
  const r = score(data, { recompose: packetFor, readRaw: readLinkProposals, expectedExposed: 5 })
  const arms = Object.fromEntries(Object.entries(r.arms).map(([arm, base]) => {
    const rows = r.details.filter(x => x.arm === arm)
    const count = fn => rows.filter(fn).length
    return [arm, { ...base, linkedTargeted: count(x => x.targeted && x.proposals.link === 'resolved'),
      linkControls: count(x => !x.targeted && x.proposals.link !== 'absent'),
      linkRejected: count(x => x.proposals.link === 'rejected'),
      falseNewTargeted: count(x => x.targeted && [x.proposals.user, x.proposals.assistant].some(p => p?.kind === 'propose_new')),
      trueNewBoth: count(x => x.expectedGoal !== null && x.userExact && x.assistantExact),
      clarificationAnswer: count(x => x.targeted && x.answerPassed) }]
  }))
  return { ...r, arms, outcome: decideLink(r.hostOK, arms, r.stopped) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [corpus, evaluation, out] = process.argv.slice(2)
  assert(corpus && evaluation && out, 'Usage: node score.mjs <corpus> <evaluation> <new-result>')
  writeFileSync(out, JSON.stringify(scoreLink(readEvaluation(corpus, evaluation, pin)), null, 2) + '\n', { flag: 'wx' })
}
