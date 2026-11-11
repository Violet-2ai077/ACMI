[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Evidence,
  [switch]$CleanClone,
  [string]$CompareBenchmark
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
  if ($CleanClone) { Run 'frozen-install' 'pnpm' @('install','--offline','--frozen-lockfile','--ignore-scripts') }
  Run 'workspace-check' 'pnpm' @('check')
  Run '094-open-offline' 'node' @('--test','scripts/phase-0.9.4/qualification.node-test.mjs')
  Run '095-offline' 'node' @('--test','scripts/phase-0.9.5/benchmark.node-test.mjs')
  Run '096-offline' 'node' @('--test','scripts/phase-0.9.6/experiment.node-test.mjs')
  Run '097-offline' 'node' @('--test','scripts/phase-0.9.7/*.node-test.mjs')
  Run '097-benchmark' 'node' @('scripts/phase-0.9.7/benchmark.mjs',(Join-Path $root 'benchmark'))
  if ($CompareBenchmark) {
    $lines = foreach ($file in 'requests.offline.json','oracle.separate.json','rule-predictions.json',
      'scripted-contract-roundtrip.json','response-controls.json','metrics.json','frozen-contract.json') {
      $old = (Get-FileHash -LiteralPath (Join-Path $CompareBenchmark $file)).Hash
      $new = (Get-FileHash -LiteralPath (Join-Path $root "benchmark/$file")).Hash
      if ($new -cne $old) { throw "Clean-clone replay mismatch: $file" }
      "$($new.ToLowerInvariant())  $file"
    }
    $lines | Set-Content -Encoding utf8 -LiteralPath (Join-Path $root 'benchmark-replay.txt')
  }
  Run 'head' 'git' @('rev-parse','HEAD')
  Run 'status' 'git' @('status','--porcelain=v2','--branch')
} finally { Pop-Location }
