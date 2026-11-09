import { readdirSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import ts from 'typescript'

const skip = new Set(['.git', 'node_modules', 'dist', 'coverage'])
const issues = []
const source = []
const root = process.cwd()

function visit(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, item.name)
    const name = relative(root, path).split(sep).join('/')
    if (skip.has(item.name)) continue
    if (item.isSymbolicLink()) issues.push(`${name}: symbolic link`)
    else if (item.isDirectory()) visit(path)
    else if (item.isFile()) source.push({ path, name })
  }
}
visit(root)

for (const { path, name } of source) {
  if (!/\.(?:ts|mjs|cjs|json|ya?ml|md|ps1)$/u.test(name)) continue
  const data = readFileSync(path, 'utf8')
  if (!data.endsWith('\n')) issues.push(`${name}: missing final newline`)
  if (/\0|[\t ]+\r?$/mu.test(data)) issues.push(`${name}: NUL or trailing whitespace`)
  const match = /^packages\/(core|contracts)\/src\//u.exec(name)
  if (!match || !name.endsWith('.ts')) continue
  const sourceRoot = resolve(root, 'packages', match[1], 'src')
  const ast = ts.createSourceFile(name, data, ts.ScriptTarget.Latest, true)
  const allowed = value => {
    if (value === '@acmi/contracts' && match[1] === 'core') return true
    if (!value.startsWith('./') && !value.startsWith('../')) return false
    const rel = relative(sourceRoot, resolve(dirname(path), value))
    return rel !== '..' && !rel.startsWith('..' + sep)
  }
  function walk(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier
      && (!ts.isStringLiteral(node.moduleSpecifier) || !allowed(node.moduleSpecifier.text))) {
      issues.push(`${name}: import/re-export crosses the platform-neutral boundary`)
    }
    if (ts.isImportTypeNode(node) && (!ts.isLiteralTypeNode(node.argument) || !ts.isStringLiteral(node.argument.literal)
      || !allowed(node.argument.literal.text))) issues.push(`${name}: forbidden type import`)
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) issues.push(`${name}: dynamic module load`)
    ts.forEachChild(node, walk)
  }
  if (ast.referencedFiles.length || ast.typeReferenceDirectives.length || ast.libReferenceDirectives.length) {
    issues.push(`${name}: triple-slash dependency`)
  }
  walk(ast)
}

for (const [name, deps] of [['contracts', []], ['core', ['@acmi/contracts']]]) {
  const manifest = JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8'))
  const declared = Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies, ...manifest.peerDependencies })
  if (declared.length !== deps.length || declared.some(dep => !deps.includes(dep))) issues.push(`${name}: dependency manifest crosses boundary`)
}
if (issues.length) {
  process.stderr.write(issues.join('\n') + '\n')
  process.exitCode = 1
} else console.log(`Source checks passed (${source.length} files): formatting and Core/Contracts dependency boundary.`)
