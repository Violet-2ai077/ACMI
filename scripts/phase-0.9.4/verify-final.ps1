[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Evidence,
  [switch]$CleanClone
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$root = [IO.Path]::GetFullPath($Evidence)
if (Test-Path -LiteralPath $root) { throw 'Choose a new evidence directory' }
[void][IO.Directory]::CreateDirectory($root)
$steps = [Collections.Generic.List[string]]::new()
function Run([string]$Name, [string]$Program, [string[]]$Arguments) {
  $log = Join-Path $root "$Name.txt"
  "COMMAND $Program $($Arguments -join ' ')" | Set-Content -Encoding utf8 -LiteralPath $log
  & $Program @Arguments *>&1 | Out-File -Append -Encoding utf8 -LiteralPath $log
  $code = $LASTEXITCODE
  "EXIT $code" | Out-File -Append -Encoding utf8 -LiteralPath $log
  $steps.Add("$Name EXIT $code")
  $steps | Set-Content -Encoding utf8 -LiteralPath (Join-Path $root 'exit-codes.txt')
  "$Name EXIT $code"
  if ($code) { Get-Content -Tail 60 -LiteralPath $log; throw "$Name failed: $code" }
}

Push-Location -LiteralPath $repo
try {
  $env:CI = '1'
  if ($CleanClone) {
    Run 'offline-frozen-install' 'pnpm' @('install','--offline','--frozen-lockfile','--ignore-scripts')
    Run 'clean-clone-full' 'pnpm' @('check')
    $env:ACMI_TEST_BUILT = '1'
    try {
      Run 'clean-clone-built-shadow' 'pnpm' @('exec','vitest','run','integrations/dsh/tests/layered-shadow.test.mjs','--reporter=verbose','--silent=false')
    } finally { Remove-Item Env:ACMI_TEST_BUILT }
  } else {
    Run 'lint-final' 'pnpm' @('lint')
    Run 'build-final' 'pnpm' @('build')
    Run 'typecheck-final' 'pnpm' @('typecheck')
  }
  Run 'phase-0.9.4-tests-final' 'node' @('--test','scripts/phase-0.9.4/*.node-test.mjs')
  Run 'phase-0.9.4-corpus-final' 'node' @('scripts/phase-0.9.4/corpus.mjs',(Join-Path $root 'corpus'))
  Run 'phase-0.9.4-evaluation-final' 'node' @('scripts/phase-0.9.4/evaluate.mjs',(Join-Path $root 'evaluation'))
  $corpus = Join-Path $root 'corpus'
  Run 'phase-0.9.4-empty-annotation-final' 'node' @('scripts/phase-0.9.4/annotation.mjs','compare',
    (Join-Path $corpus 'reviewer-a-packet.json'),(Join-Path $corpus 'reviewer-b-packet.json'),
    (Join-Path $corpus 'coordinator-map.rehearsal.json'),'-','-',(Join-Path $root 'empty-annotation.json'))
  Run 'git-status-final' 'git' @('status','--porcelain=v2')
} finally { Pop-Location }
