import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { createScopeAuthority } from '../../../../packages/core/dist/index.js'
import { openGraphStore } from '../../dist/index.js'

const p = JSON.parse(readFileSync(0, 'utf8'))
if (p.mode === 'crash') {
  const db = new DatabaseSync(p.file)
  db.exec('PRAGMA synchronous=FULL; PRAGMA cache_size=2; BEGIN IMMEDIATE')
  db.exec("UPDATE graph_event SET body=printf('%.*c',20000,'x') WHERE seq=1")
  process.stdout.write('transaction open\n', () => process.exit(17))
} else {
  const read = createScopeAuthority()
  const write = createScopeAuthority()
  const store = openGraphStore({ root: p.root, workspaceId: p.workspaceId, read, write })
  try {
    const cut = store.read(read.grant(p.workspaceId), p.taskId)
    console.log(JSON.stringify({ cut, metrics: store.metrics() }))
  } finally { store.close() }
}
