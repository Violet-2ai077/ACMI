// Recreate the original relative import layout without editing the frozen files.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const source = dirname(fileURLToPath(import.meta.url));
const parent = realpathSync(tmpdir());
const tmp = mkdtempSync(join(parent, 'acmi-th1-offline-'));
const capture = join(tmp, 'verification', 'phase-0.9.19', 'TH1-handoff');
const depRoot = 'worktrees/finite-mechanism/research/phase-0.9.19';
try {
  mkdirSync(capture, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(source, 'freeze.json'), 'utf8'));
  for (const [key, expected] of Object.entries(manifest.files)) {
    const match = /^\.\.\/\.\.\/\.\.\/worktrees\/finite-mechanism\/research\/phase-0\.9\.19\/((?:gate2|protocol)\/[\w-]+\.mjs)$/.exec(key);
    if (!match && !['PLAN.md', 'protocol.mjs', 'run.mjs', 'tests.mjs'].includes(key)) {
      throw new Error('Unexpected frozen path: ' + key);
    }
    const original = match ? join(dirname(source), match[1]) : join(source, key);
    const target = match ? join(tmp, depRoot, match[1]) : join(capture, key);
    const actual = createHash('sha256').update(readFileSync(original)).digest('hex');
    if (actual !== expected) throw new Error('Frozen file mismatch: ' + key);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(original, target);
  }
  for (const f of ['freeze.json', 'verify.mjs', 'evidence']) {
    cpSync(join(source, f), join(capture, f), { recursive: true });
  }
  for (const args of [['--test', 'tests.mjs'], ['verify.mjs']]) {
    execFileSync(process.execPath, args, { cwd: capture, stdio: 'inherit' });
  }
} finally {
  const target = realpathSync(tmp);
  if (dirname(target) === parent && basename(target).startsWith('acmi-th1-offline-')) {
    rmSync(target, { recursive: true });
  }
}
