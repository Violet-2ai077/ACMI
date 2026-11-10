import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const source = new URL('../../docs/research/phase-0.9.2-annotation/pilot-inputs.json', import.meta.url);

function generate(outputDirectory) {
  const bytes = readFileSync(source);
  const cases = JSON.parse(bytes);
  const packetId = sha256(bytes);
  const lanes = ['A', 'B'].map(reviewLane => {
    const ranked = cases.map(row => ({
      row,
      key: sha256([packetId, reviewLane, row.caseId].join(':')),
    }));
    ranked.sort((a, b) => a.key < b.key ? -1 : Number(a.key !== b.key));
    return {
      schemaVersion: '0.9.2-pilot-v1',
      packetId,
      reviewLane,
      usage: 'open_unscored_annotation_dry_run',
      cases: ranked.map(x => x.row),
    };
  });
  if (lanes[0].cases.every((row, i) => row.caseId === lanes[1].cases[i].caseId)) {
    throw new Error('Review lanes must have distinct case orders');
  }
  const paths = lanes.map(lane => join(outputDirectory, 'reviewer-' + lane.reviewLane.toLowerCase() + '.json'));
  if (paths.some(existsSync)) throw new Error('Refusing to overwrite a reviewer packet');
  mkdirSync(outputDirectory, { recursive: true });
  lanes.forEach((lane, i) => writeFileSync(paths[i], JSON.stringify(lane, null, 2) + '\n', { flag: 'wx' }));
  process.stdout.write('Wrote ' + lanes.length + ' lanes of ' + cases.length + ' open, unscored cases.\n');
}

try {
  if (process.argv.length !== 3) throw new Error('Usage: node annotation.mjs <output-directory>');
  generate(process.argv[2]);
} catch (error) {
  process.stderr.write(error.message + '\n');
  process.exitCode = 1;
}
