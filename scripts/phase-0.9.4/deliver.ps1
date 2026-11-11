[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$HistoricalLogs,
  [Parameter(Mandatory)][string]$FinalEvidence,
  [Parameter(Mandatory)][string]$CleanEvidence,
  [Parameter(Mandatory)][string]$CustodyReceipt,
  [Parameter(Mandatory)][string]$Destination
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$root = [IO.Path]::GetFullPath($Destination)
if (Test-Path -LiteralPath $root) { throw 'Choose a new destination' }
$baseCommit = 'bbbd19b83747946619183f86ac2b2d78a9978921'
$preCommit = '8f2492043df3516d31ff95020a41a4483156367f'
$prefix = 'ACMI-Phase-0.9.4-Deliverables'
$stage = Join-Path $root $prefix
foreach ($path in 'reports','benchmark','qualification','annotation','evaluation','source','environment','integrity','runbooks') {
  [void][IO.Directory]::CreateDirectory((Join-Path $stage $path))
}
$expected = [Collections.Generic.List[string]]::new()
function Copy-Payload([string]$src, [string]$dst) {
  Copy-Item -LiteralPath $src -Destination (Join-Path $stage $dst)
  $expected.Add($dst)
}
function Write-Payload([string]$dst, [string[]]$body) {
  $body | Set-Content -Encoding utf8 -LiteralPath (Join-Path $stage $dst)
  $expected.Add($dst)
}
function Hash([string]$path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Safe-RemoveOwned([string]$path, [string]$parent, [string]$leaf) {
  $resolved = (Resolve-Path -LiteralPath $path).Path
  if ((Split-Path $resolved -Parent) -ne $parent -or (Split-Path $resolved -Leaf) -cne $leaf -or
      (Get-Item -LiteralPath $resolved).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) {
    throw "Unsafe scratch cleanup path: $resolved"
  }
  Remove-Item -Recurse -LiteralPath $resolved
}
Push-Location -LiteralPath $repo
try {
  $head = (git rev-parse HEAD).Trim()
  if ((git branch --show-current) -ne 'acmi/phase-0.9.4' -or (git status --porcelain=v2)) { throw 'Expected clean 0.9.4 worktree' }
  git merge-base --is-ancestor $baseCommit $head
  $pre = 'docs/qualification/phase-0.9.4-preregistration.md'
  git diff --exit-code $preCommit $head -- $pre
  $preHash = Hash (Join-Path $repo $pre)
  if ($preHash -ne 'd26d62003de44cc43d6074d972d2f3c56922c4c5c94c348b65207e69d91e476e') {
    throw 'Preregistration freeze mismatch'
  }
  foreach ($n in 'corpus-report','final-report','identity-resolution','model-evaluation-readiness','offline-evaluation') {
    Copy-Payload "docs/experiments/phase-0.9.4-$n.md" "reports/$n.md"
  }
  foreach ($n in 'holdout-custody','preregistration','qualification-protocol','execution-plan') {
    Copy-Payload "docs/qualification/phase-0.9.4-$n.md" "qualification/$n.md"
  }
  Copy-Payload 'docs/qualification/phase-0.9.4-qualification-decision.md' 'reports/qualification-decision.md'
  Write-Payload 'qualification/preregistration.sha256' "$preHash  preregistration.md"
  foreach ($n in 'label-guide','reviewer-onboarding','human-review-status','adjudication-protocol') {
    Copy-Payload "docs/annotation/phase-0.9.4-$n.md" "annotation/$n.md"
  }
  foreach ($n in 'annotation-audit-schema','annotation-schema','annotation-template') {
    Copy-Payload "docs/annotation/phase-0.9.4-$n.json" "annotation/$n.json"
  }
  foreach ($n in 'annotation-operations','holdout-custody','evaluation-reproduction') {
    Copy-Payload "docs/runbooks/phase-0.9.4-$n.md" "runbooks/$n.md"
  }
  Copy-Payload 'scripts/phase-0.9.4/model-authorization.disabled.json' 'evaluation/model-authorization.disabled.json'
  Copy-Payload $CustodyReceipt 'benchmark/sealed-holdout-manifest.json'
  foreach ($n in 'dev.json','validation.json','dev-provisional-gold.json','validation-provisional-gold.json') {
    Copy-Payload (Join-Path $FinalEvidence "corpus/$n") "benchmark/$n"
  }
  foreach ($n in 'split-manifest.json','corpus-manifest.json') {
    Copy-Payload (Join-Path $FinalEvidence "corpus/$n") "qualification/$n"
  }
  foreach ($n in 'reviewer-a-packet.json','reviewer-b-packet.json','coordinator-map.rehearsal.json') {
    Copy-Payload (Join-Path $FinalEvidence "corpus/$n") "annotation/$n"
  }
  Copy-Payload (Join-Path $FinalEvidence 'empty-annotation.json') 'annotation/empty-import-diagnostic.json'
  foreach ($n in 'metrics.json','identity-resolution.json','predictions.json','performance.json','confusion-matrices.json') {
    Copy-Payload (Join-Path $FinalEvidence "evaluation/$n") "benchmark/$n"
  }
  foreach ($n in 'all-tests','built','source','typecheck','contracts','quickstart-zstd','diff-check','exit-codes',
      'phase-0.8-benchmark','phase-0.8.1-benchmark','phase-0.8.2-benchmark','phase-0.9-benchmark',
      'phase-0.9.1-open-benchmark','phase-0.9.2-tests','phase-0.9.3-tests','phase-0.9.3-corpus-verify') {
    Copy-Payload (Join-Path $HistoricalLogs "$n.txt") "environment/$n.txt"
  }
  foreach ($n in 'lint-final','build-final','typecheck-final','phase-0.9.4-tests-final','phase-0.9.4-corpus-final',
      'phase-0.9.4-evaluation-final','phase-0.9.4-empty-annotation-final','git-status-final','exit-codes') {
    Copy-Payload (Join-Path $FinalEvidence "$n.txt") "environment/final-$n.txt"
  }
  foreach ($n in 'clean-clone-full','clean-clone-built-shadow','offline-frozen-install','phase-0.9.4-tests-final','exit-codes') {
    Copy-Payload (Join-Path $CleanEvidence "$n.txt") "environment/clone-$n.txt"
  }
  $repro = foreach ($path in @(
      'corpus/dev.json','corpus/validation.json','corpus/dev-provisional-gold.json','corpus/validation-provisional-gold.json',
      'corpus/reviewer-a-packet.json','corpus/reviewer-b-packet.json','corpus/coordinator-map.rehearsal.json',
      'corpus/corpus-manifest.json','corpus/split-manifest.json','evaluation/metrics.json','evaluation/identity-resolution.json',
      'evaluation/predictions.json','evaluation/confusion-matrices.json','empty-annotation.json')) {
    $hash = Hash (Join-Path $FinalEvidence $path)
    if ($hash -ne (Hash (Join-Path $CleanEvidence $path))) { throw "Clean clone mismatch: $path" }
    "$hash  $path"
  }
  Write-Payload 'environment/clean-clone.txt' (@("HEAD $head", 'Local git clone --no-local; 14 stable outputs byte-identical.') + $repro)
  Write-Payload 'environment/versions.txt' @("Windows $([Environment]::OSVersion.Version); $([Runtime.InteropServices.RuntimeInformation]::OSArchitecture)",
    "Node $(node -v)","pnpm $(pnpm -v)",'SQLite 3.53.0 (Node bundled)','dsh isolated fixture 0.2.2-rc.1; installed version not executed')
  Write-Payload 'source/commits.txt' (@("Base: $baseCommit","Branch: acmi/phase-0.9.4","HEAD: $head") + (git log --reverse --format='%H %aI %s' "$baseCommit..$head"))
  Write-Payload 'source/changed-files-manifest.txt' (git diff --name-status $baseCommit $head)
  git diff --binary "--output=$(Join-Path $stage 'source/phase-0.9.4-changes.patch')" $baseCommit $head
  $expected.Add('source/phase-0.9.4-changes.patch')
  $readme = @('# ACMI Phase 0.9.4', '', "Local HEAD: $head", '', 'Production automatic routing: NO-GO.',
    'Start with reports/final-report.md and reports/qualification-decision.md.',
    'Distribute only the individual Reviewer packet, guide, schema and blank template; never the full ZIP.',
    'Open provisional Gold is research-only. No formal Holdout contents, real reviewers, or Provider calls.',
    'The separately retained candidate is same-operator, input-only and not an independent blind set.')
  Write-Payload 'README.md' $readme
  $sorted = @($expected | Sort-Object -CaseSensitive)
  if (($sorted | Select-Object -Unique).Count -ne $sorted.Count) { throw 'Duplicate allowlist entry' }
  $inner = @($sorted | ForEach-Object { "$(Hash (Join-Path $stage $_))  $_" })
  Write-Payload 'integrity/SHA256SUMS.txt' $inner
  $zip = Join-Path $root "$prefix.zip"
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::Open($zip, [IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($rel in $expected) {
      [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $stage $rel),"$prefix/$rel")
    }
  } finally { $archive.Dispose() }
  $listing = @(tar -tf $zip | Sort-Object -CaseSensitive)
  if (Compare-Object $listing @($expected | ForEach-Object {"$prefix/$_"} | Sort-Object -CaseSensitive) -CaseSensitive) {
    throw 'ZIP entry allowlist mismatch'
  }
  if ($listing -match '(?i)(^|/)(\.env|node_modules|credentials|cookies|session-journal|qualification-candidate-inputs|dsh_home)(/|\.|$)') {
    throw 'Unexpected restricted entry'
  }
  $scratchLeaf = 'verify-' + [guid]::NewGuid().ToString('N')
  $scratch = Join-Path $root $scratchLeaf
  [void][IO.Directory]::CreateDirectory($scratch)
  try {
    tar -xf $zip -C $scratch
    $extracted = Join-Path $scratch $prefix
    if (Compare-Object $inner (Get-Content -LiteralPath (Join-Path $extracted 'integrity/SHA256SUMS.txt')) -CaseSensitive) {
      throw 'Extracted manifest mismatch'
    }
    foreach ($row in $inner) {
      if ($row -cnotmatch '^([0-9a-f]{64})  ([a-zA-Z0-9_./-]+)$') { throw 'Malformed manifest row' }
      $want = $Matches[1]; $file = $Matches[2]
      if ((Hash (Join-Path $extracted $file)) -ne $want) { throw "Extracted hash mismatch: $file" }
    }
    foreach ($n in 'a','b') {
      $raw = Get-Content -Raw -LiteralPath (Join-Path $extracted "annotation/reviewer-$n-packet.json")
      if ($raw -match '"(gold|split|risk|expected|prediction|cluster|family|provenance)"\s*:') { throw 'Blind packet leakage' }
      $packet = $raw | ConvertFrom-Json
      if ($packet.cases.Count -ne 119) { throw 'Blind packet count mismatch' }
    }
  } finally { Safe-RemoveOwned $scratch $root $scratchLeaf }
  $size = (Get-Item -LiteralPath $zip).Length
  $hash = Hash $zip
  $cert = @(certutil -hashfile $zip SHA256)
  if (-not ($cert | Where-Object { ($_ -replace '\s','').Trim().ToLowerInvariant() -eq $hash })) { throw 'certutil SHA-256 disagreement' }
  $listing | Set-Content -Encoding utf8 -LiteralPath (Join-Path $root 'ZIP-ENTRIES.txt')
  $readme | Set-Content -Encoding utf8 -LiteralPath (Join-Path $root 'README.md')
  $final = Join-Path $root 'ACMI-Phase-0.9.4-Final-Report.md'
  Copy-Item -LiteralPath (Join-Path $stage 'reports/final-report.md') -Destination $final
  @('', '## 最终交付核验回执', '', "- 本地 HEAD：$head。", "- ZIP：$zip，$size bytes。",
    "- SHA-256：$hash。",
    "- tar.exe 独立解压新目录并校验 $($listing.Count) 个归档条目、$($inner.Count) 项内部 SHA-256；敏感文件名和 A/B 字段检查通过。核验临时目录已删除。",
    '- Get-FileHash 和 certutil 一致。独立 clean clone 14 份非计时制品逐字节一致。') |
    Add-Content -Encoding utf8 -LiteralPath $final
  $outer = @('README.md','ACMI-Phase-0.9.4-Final-Report.md',"$prefix.zip",'ZIP-ENTRIES.txt') | ForEach-Object {
    "$(Hash (Join-Path $root $_))  $_"
  }
  $outer | Set-Content -Encoding utf8 -LiteralPath (Join-Path $root 'SHA256SUMS.txt')
  foreach ($row in Get-Content -LiteralPath (Join-Path $root 'SHA256SUMS.txt')) {
    if ($row -cnotmatch '^([a-f0-9]{64})  (.+)$') { throw 'Invalid outer manifest row' }
    if ((Hash (Join-Path $root $Matches[2])) -ne $Matches[1]) { throw 'Outer SHA-256 mismatch' }
  }
  [pscustomobject]@{ zip = $zip; bytes = $size; sha256 = $hash; entries = $listing.Count; payload = $inner.Count; commit = $head } |
    ConvertTo-Json -Compress
} finally { Pop-Location }
