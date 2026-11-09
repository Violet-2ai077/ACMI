import { isAbsolute } from 'node:path'
import { createStorageIsolationMarker } from '@acmi/dsh-integration'

const [journalRoot, workspace, encoding, ...extra] = process.argv.slice(2)
if (!journalRoot || !workspace || !isAbsolute(journalRoot) || !isAbsolute(workspace)
  || (encoding !== 'none' && encoding !== 'zstd') || extra.length > 0) {
  console.error('Usage: pnpm --filter @acmi/dsh-quickstart prepare-root <absolute-empty-journal-root> <absolute-workspace> <none|zstd>')
  process.exitCode = 1
} else {
  const { partitionId } = await createStorageIsolationMarker(journalRoot, workspace, encoding)
  console.log(`Provisioned dedicated ACMI journal root: ${partitionId}`)
}
