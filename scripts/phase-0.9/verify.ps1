[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Evidence,
  [switch]$CleanClone,
  [string]$CompareBenchmark
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$env:CI = '1'
New-Item -ItemType Directory -Path $Evidence -Force | Out-Null
$root = (Resolve-Path -LiteralPath $Evidence).Path
Set-Location -LiteralPath $repo
$steps = [Collections.Generic.List[string]]::new()
function Run([string]$Name, [string]$Program, [string[]]$Arguments) {
  $log = Join-Path $root "$Name.txt"
  "COMMAND $Program $($Arguments -join ' ')" | Set-Content -Encoding utf8 -LiteralPath $log
  & $Program @Arguments *>&1 | Out-File -Append -Encoding utf8 -LiteralPath $log
  $code = $LASTEXITCODE
  "EXIT $code" | Out-File -Append -Encoding utf8 -LiteralPath $log
  $steps.Add("$Name EXIT $code")
  "$Name EXIT $code"
  if ($code) { Get-Content -Tail 60 -LiteralPath $log; throw "$Name failed: $code" }
}
Run 'contracts' 'pnpm' @('--filter','@acmi/contracts','build')
Run 'all-tests' 'pnpm' @('check')
if (!$CleanClone) { Run 'typecheck' 'pnpm' @('typecheck') }
$env:ACMI_TEST_BUILT = '0'
Run 'source' 'pnpm' @('exec','vitest','run','integrations/dsh/tests','--reporter=default')
$env:ACMI_TEST_BUILT = '1'
Run 'built' 'pnpm' @('exec','vitest','run','integrations/dsh/tests','--reporter=default')
Remove-Item Env:ACMI_TEST_BUILT
Run 'quickstart-zstd' 'pnpm' @('--filter','@acmi/dsh-quickstart','demo','--zstd')
Run 'diff-check' 'git' @('diff','--check')
if ($CleanClone) {
  $reproduced = Join-Path $root 'reproduced'
  Run 'phase-0.9-benchmark' 'node' @('scripts/phase-0.9/benchmark.mjs',$reproduced)
  Run 'benchmark-repro' 'node' @('scripts/phase-0.9/compare-benchmark.mjs',$CompareBenchmark,$reproduced)
}
$steps | Set-Content -Encoding utf8 -LiteralPath (Join-Path $root 'exit-codes.txt')
