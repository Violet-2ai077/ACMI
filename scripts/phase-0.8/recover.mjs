import { readFileSync } from 'node:fs'
import { loadTaskContext } from '../../packages/core/dist/index.js'
import { createHash } from 'node:crypto'

const handoffs = JSON.parse(readFileSync(0, 'utf8'))
const digest = text => createHash('sha256').update(text).digest('hex')
const recovered = handoffs.map(({ wire, expected }) => {
  const pkg = loadTaskContext(wire, expected, digest)
  if (!pkg) throw new Error('Rejected recovery handoff')
  return { taskId: pkg.taskId, activeNodeId: pkg.activeNodeId, state: pkg.currentState.work,
    next: pkg.items.filter(item => item.kind === 'next-action').map(item => item.text),
    dependencies: pkg.items.filter(item => item.dependency).map(item => [item.dependency.resultId, item.dependency.stage]) }
})
console.log(JSON.stringify(recovered))
