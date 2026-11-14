import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { hash } from '../protocol/contracts.mjs'
import { selectedDshDefault, selectDshRoute } from './dsh-route.mjs'

// No DSH imports, plugin mounting, network access or credential values in the result.
export function inspectDsh({ packageJson, profilePatch, credentialsFile, env = process.env }) {
  try {
    const packagePath = resolve(packageJson), profilePath = resolve(profilePatch), credentialPath = resolve(credentialsFile)
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))
    if (pkg.name !== '@deepseek-ai/dsh' || typeof pkg.version !== 'string' || !/^[0-9A-Za-z.+-]+$/.test(pkg.version)) throw new Error()
    const require = createRequire(packagePath), { parseDocument } = require('yaml')
    const parse = text => {
      const doc = parseDocument(text, { logLevel: 'silent', prettyErrors: false, uniqueKeys: true })
      if (doc.errors.length) throw new Error()
      return doc
    }
    const entries = parse(readFileSync(profilePath, 'utf8')).toJS({ maxAliasCount: 100 })
    const selected = selectedDshDefault(entries)
    const catalogPath = join(dirname(packagePath), 'node_modules/@earendil-works/pi-ai/dist/providers/data', selected.provider + '.json')
    const catalogBytes = readFileSync(catalogPath)
    const binding = selectDshRoute({ entries, catalog: JSON.parse(catalogBytes) })
    let managed
    try {
      const doc = parse(readFileSync(credentialPath, 'utf8'))
      if (doc.get('version') !== 1) throw new Error()
      managed = doc.getIn(['refs', binding.credential_ref])
      if (managed !== undefined && (typeof managed !== 'string' || !managed.length)) throw new Error()
    } catch (error) { if (error.code !== 'ENOENT') throw new Error() }
    const inherited = env[binding.credential_ref]
    const source = managed !== undefined ? 'dsh-managed-refs' : typeof inherited === 'string' && inherited.length ? 'environment' : null
    return { ...binding, binding_sha256: hash(binding), dsh_version: pkg.version,
      sources: { package_json: packagePath, profile_patch: profilePath, catalog: catalogPath, catalog_sha256: hash(catalogBytes) },
      credential: { reference: binding.credential_ref, available: source !== null, source },
      inspection_scope: 'explicit-profile-patch-only', dotenv_fallback_examined: false,
      network_contacted: false, credentials_copied: false }
  } catch { throw new Error('DSH inspection failed; no configuration or credential values emitted') }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [packageJson, profilePatch, credentialsFile, ...extra] = process.argv.slice(2)
    if (!packageJson || !profilePatch || !credentialsFile || extra.length) throw new Error()
    process.stdout.write(JSON.stringify(inspectDsh({ packageJson, profilePatch, credentialsFile }), null, 2) + '\n')
  } catch {
    process.stderr.write('DSH inspection failed; supply package.json, profile patch and managed credentials path. No values emitted.\n')
    process.exitCode = 1
  }
}
