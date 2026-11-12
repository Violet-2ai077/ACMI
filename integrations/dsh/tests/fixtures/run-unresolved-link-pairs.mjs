import assert from 'node:assert/strict'
import { frozen, inputs, catalogs, packetFor } from '../../../../scripts/phase-0.9.16/design.mjs'
import pin from '../../../../scripts/phase-0.9.16/frozen.json' with { type: 'json' }
import { projectLink } from '../../../../scripts/phase-0.9.16/link.mjs'
import { runTextPairs } from './run-relative-pairs.mjs'

const [exe, weights, root, ...extra] = process.argv.slice(2)
assert(exe && weights && root && !extra.length, 'Usage: node run-unresolved-link-pairs.mjs <pinned-server> <pinned-weights> <new-run-dir>')
await runTextPairs({ exe, weights, root, inputs, catalogs, packetFor, frozen, pin, project: projectLink })
