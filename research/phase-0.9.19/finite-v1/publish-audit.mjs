// Publication-only check: base64 wire must not bypass the selected-secret scan.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { inspectDsh } from '../gate2/dsh-inspect.mjs';
import { hash } from '../protocol/contracts.mjs';
import { verifyFreeze } from './experiment.mjs';
const root = dirname(fileURLToPath(import.meta.url));
const packageJson = join(homedir(), 'AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/package.json');
const credentialsFile = join(homedir(), '.dsh/.credentials.yaml');
const binding = inspectDsh({ packageJson, credentialsFile, profilePatch: join(homedir(), '.dsh/profiles/web/cordis.patch.yml') });
const { parseDocument } = createRequire(packageJson)('yaml');
const doc = parseDocument(readFileSync(credentialsFile, 'utf8'), { logLevel: 'silent', prettyErrors: false });
if (doc.errors.length) throw new Error('credential_inspection_failed');
const secret = doc.getIn(['refs', binding.credential_ref]) ?? process.env[binding.credential_ref];
if (typeof secret !== 'string' || !secret) throw new Error('selected_reference_missing');
const secretBytes = Buffer.from(secret), hashes = {}, hits = [];
let decodedStreams = 0, decodedBytes = 0;
const unsafe = bytes => bytes.includes(secretBytes) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/.test(bytes.toString('utf8'));
function walk(dir) {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, d.name), name = relative(root, path).replaceAll('\\', '/');
    if (d.isDirectory()) { walk(path); continue; }
    const bytes = readFileSync(path);
    hashes[name] = hash(bytes);
    if (unsafe(bytes)) hits.push(name);
    if (d.name === 'events.jsonl') {
      const records = bytes.toString().trim().split('\n').map(JSON.parse);
      for (const channel of ['wire', 'content', 'reasoning']) {
        const decoded = Buffer.concat(records.filter(e => e.kind === channel).map(e => Buffer.from(e.bytes_base64, 'base64')));
        decodedStreams++; decodedBytes += decoded.length;
        if (unsafe(decoded)) hits.push(`${name}:decoded-${channel}`);
      }
    }
  }
}
walk(root);
const audit = { at: new Date().toISOString(), freeze_sha256: verifyFreeze(), safe: hits.length === 0, hits,
  selected_credential_bytes_absent: hits.length === 0, decoded_streams: decodedStreams, decoded_bytes: decodedBytes,
  scanned_files: Object.keys(hashes).length, hashes,
  scope: 'new FM1 artifact tree only; selected credential bytes and strong signatures, not universal detection; synthetic input data',
  generic_security_scanner_coverage: '0 supported files; not counted as coverage' };
writeFileSync(join(root, 'analysis/publication-audit.json'), JSON.stringify(audit, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ ...audit, hashes: undefined }));
if (!audit.safe) process.exitCode = 1;
