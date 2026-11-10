[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$OriginalArchiveExtract,
  [Parameter(Mandatory)][string]$Evidence
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$reference = (Resolve-Path -LiteralPath $OriginalArchiveExtract).Path
$root = [IO.Path]::GetFullPath($Evidence)
if (Test-Path -LiteralPath $root) { throw 'Evidence directory must not exist' }
$relative = [IO.Path]::GetRelativePath($reference,$root)
if ($relative -eq '.' -or ($relative -ne '..' -and
    !$relative.StartsWith('..' + [IO.Path]::DirectorySeparatorChar) -and ![IO.Path]::IsPathRooted($relative))) {
  throw 'Evidence directory must be outside the original archive'
}
foreach ($dir in (Split-Path $root -Parent),$reference) {
  for ($item = Get-Item -LiteralPath $dir; $null -ne $item; $item = $item.Parent) {
    if (!$item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw "Evidence paths require ordinary directories: $($item.FullName)"
    }
  }
}
[void][IO.Directory]::CreateDirectory($root)
Push-Location -LiteralPath $repo
try {
  $tests = @('annotation','forensics','prototype' | ForEach-Object {Join-Path $PSScriptRoot "$_.node-test.mjs"})
  node --test @tests
  node scripts/phase-0.9.2/forensics.mjs $reference (Join-Path $root 'failure-analysis')
  node scripts/phase-0.9.2/prototype.mjs (Join-Path $root 'prototype')
  node scripts/phase-0.9.2/annotation.mjs (Join-Path $root 'annotation')
  foreach ($file in 'reviewer-a.json','reviewer-b.json') {
    $generated = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root "annotation/$file")).Hash
    $expected = (Get-FileHash -Algorithm SHA256 -LiteralPath "docs/research/phase-0.9.2-annotation/$file").Hash
    if ($generated -cne $expected) { throw "Reviewer packet byte mismatch: $file" }
    "$file SHA256 $generated"
  }
  'No Provider calls, no old predictions run, no reserve scoring.'
} finally {
  Pop-Location
}
