[CmdletBinding()]
param([Parameter(Mandatory)][string]$Evidence,[string]$ArchivedBenchmark,[switch]$CleanClone)

$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$false
$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
New-Item -ItemType Directory -Path $Evidence -Force | Out-Null
$root=(Resolve-Path -LiteralPath $Evidence).Path
Set-Location -LiteralPath $repo
$env:CI='1'
& (Join-Path $repo 'scripts/phase-0.9/verify.ps1') -Evidence $root
function Run([string]$name,[string]$exe,[string[]]$argv) {
  $file=Join-Path $root "$name.txt"
  "COMMAND $exe $($argv -join ' ')" | Set-Content -Encoding utf8 -LiteralPath $file
  & $exe @argv *>&1 | Out-File -Append -Encoding utf8 -LiteralPath $file
  $code=$LASTEXITCODE
  "EXIT $code" | Out-File -Append -Encoding utf8 -LiteralPath $file
  "$name EXIT $code"
  if($code){Get-Content -Tail 50 -LiteralPath $file; throw "$name failed"}
}
$base=[IO.Path]::TrimEndingDirectorySeparator((Resolve-Path -LiteralPath ([IO.Path]::GetTempPath())).Path)
$scratch=Join-Path $base ('acmi-091-regression-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch | Out-Null
try {
  if(!$CleanClone) {
    Run 'phase-0.8-benchmark' 'node' @('scripts/phase-0.8/benchmark.mjs',(Join-Path $scratch '08'))
    Run 'phase-0.8.1-benchmark' 'node' @('scripts/phase-0.8.1/benchmark.mjs',(Join-Path $scratch '081'))
    Run 'phase-0.8.2-benchmark' 'node' @('integrations/dsh/tests/fixtures/phase-082-benchmark.mjs',(Join-Path $scratch '082'))
    Run 'phase-0.9-benchmark' 'node' @('scripts/phase-0.9/benchmark.mjs',(Join-Path $scratch '09'))
  }
  Run 'phase-0.9.1-open-benchmark' 'node' @('scripts/phase-0.9.1/benchmark.mjs','--open',(Join-Path $scratch 'open'))
  if($CleanClone) {
    if(!$ArchivedBenchmark){throw 'Archived benchmark directory required for clean clone'}
    Run 'benchmark-reproduction' 'node' @('scripts/phase-0.9.1/benchmark.mjs','--verify',$ArchivedBenchmark,(Join-Path $scratch 'open'))
  }
} finally {
  $path=(Resolve-Path -LiteralPath $scratch).Path
  if($path -cne $scratch -or (Split-Path $path -Parent) -ine $base -or
    (Split-Path $path -Leaf) -cnotmatch '^acmi-091-regression-[a-f0-9]{32}$'){throw 'Unsafe scratch cleanup path'}
  Remove-Item -LiteralPath $path -Recurse
}
