[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Evidence,
  [Parameter(Mandatory)][string]$CleanEvidence,
  [Parameter(Mandatory)][string]$Destination
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$root = [IO.Path]::GetFullPath($Destination)
$prefix = 'ACMI-Phase-0.9.5-Deliverables'
$baseCommit = '7e03f90a702c134fd19b6719fb65d3d6ea725a44'
$preCommit = '024b1a4ae8c58d3e9a338f1e476c15a5a7dadee2'
$preHash = 'a38e63e749badb3b7f87a298af56eef66c583cc218628c877d9f48f04fa831d3'
$finalReport = 'docs/experiments/phase-0.9.5-final-report.md'
$pre = 'docs/qualification/phase-0.9.5-preregistration.md'
$files = [Collections.Generic.List[string]]::new()
function Hash([string]$path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Payload([string]$rel) {
  if ($rel -cnotmatch '^[a-zA-Z0-9_.-]+(/[a-zA-Z0-9_.-]+)*$' -or $rel.Split('/') -contains '..') { throw "Unsafe path $rel" }
  $target = Join-Path $stage $rel
  [void][IO.Directory]::CreateDirectory((Split-Path $target -Parent))
  $files.Add($rel)
  return $target
}
function SafeRemove([string]$path, [string]$leaf) {
  $resolved = (Resolve-Path -LiteralPath $path).Path
  if ((Split-Path $resolved -Parent) -ine $root -or (Split-Path $resolved -Leaf) -cne $leaf -or
    (Get-Item -LiteralPath $resolved).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { throw 'Unsafe extract cleanup path' }
  Remove-Item -LiteralPath $resolved -Recurse
}

Push-Location -LiteralPath $repo
try {
  if (Test-Path -LiteralPath $root) { throw 'Choose a new destination' }
  if ((git branch --show-current) -ne 'acmi/phase-0.9.5' -or (git status --porcelain=v2)) { throw 'Expected clean 0.9.5' }
  $head = (git rev-parse HEAD).Trim()
  git merge-base --is-ancestor $baseCommit $head
  git diff --exit-code $preCommit $head -- $pre
  if ((Hash $pre) -ne $preHash) { throw 'Preregistration digest mismatch' }
  foreach ($ev in @($Evidence,$CleanEvidence)) {
    if (-not (Select-String -LiteralPath (Join-Path $ev 'head.txt') -SimpleMatch $head) -or
      (Select-String -LiteralPath (Join-Path $ev 'exit-codes.txt') -Pattern 'EXIT [1-9]')) { throw "Evidence HEAD or exit code mismatch: $ev" }
  }
  $stage = Join-Path $root $prefix
  foreach ($file in @($pre,$finalReport,'docs/qualification/phase-0.9.5-implementation-plan.md',
      'docs/architecture/task-reference-advice-v0.1.md','docs/runbooks/phase-0.9.5-reproduction.md')) {
    Copy-Item -LiteralPath $file -Destination (Payload $file)
  }
  "$preHash  phase-0.9.5-preregistration.md" | Set-Content -Encoding utf8 -LiteralPath (Payload 'docs/qualification/phase-0.9.5-preregistration.sha256')
  $names = 'inputs','oracle','predictions','metrics','094-open-diagnostic','manifest'
  foreach ($name in $names) {
    $file = "benchmark/$name.json"
    $src = Join-Path $Evidence $file
    if ((Hash $src) -ne (Hash (Join-Path $CleanEvidence $file))) { throw "Benchmark not reproduced: $file" }
    Copy-Item -LiteralPath $src -Destination (Payload $file)
  }
  $metrics = Get-Content -Raw -LiteralPath (Join-Path $stage 'benchmark/metrics.json') | ConvertFrom-Json
  if ($metrics.decision -ne 'PASS_READ_ONLY_CONTRACT' -or $metrics.providerRequests -ne 0 -or
    $metrics.holdoutRuns -ne 0) { throw 'Unexpected qualification result' }
  foreach ($name in 'workspace-check','typecheck','dsh-source','dsh-built','094-offline','095-offline','095-benchmark','head','status','exit-codes') {
    Copy-Item -LiteralPath (Join-Path $Evidence "$name.txt") -Destination (Payload "environment/$name.txt")
  }
  foreach ($name in 'frozen-install','workspace-check','095-offline','benchmark-replay','head','status','exit-codes') {
    Copy-Item -LiteralPath (Join-Path $CleanEvidence "$name.txt") -Destination (Payload "environment/clone-$name.txt")
  }
  git log --reverse --format='%H %aI %s' "$baseCommit..$head" |
    Set-Content -Encoding utf8 -LiteralPath (Payload 'source/commits.txt')
  git diff --name-status $baseCommit $head | Set-Content -Encoding utf8 -LiteralPath (Payload 'source/changed-files.txt')
  $patch = Payload 'source/phase-0.9.5-changes.patch'
  git diff --binary "--output=$patch" $baseCommit $head
  @('# ACMI Phase 0.9.5', '', 'Read-only contract: PASS. Production automatic routing: NO-GO.',
    '', "HEAD: $head", '', "Report: $finalReport", '',
    'The inputs and oracle are separate. Inputs are synthetic Host fixtures, not remote model payloads.',
    'No formal blind evaluation, credentials, or real Provider calls.') |
    Set-Content -Encoding utf8 -LiteralPath (Payload 'README.md')
  $manifest = @($files | Sort-Object | ForEach-Object { "$(Hash (Join-Path $stage $_))  $_" })
  $manifest | Set-Content -Encoding utf8 -LiteralPath (Payload 'integrity/SHA256SUMS.txt')
  if (($files | Select-Object -Unique).Count -ne $files.Count) { throw 'Duplicate payload path' }
  $zip = Join-Path $root "$prefix.zip"
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::Open($zip,[IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($rel in $files) {
      [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,(Join-Path $stage $rel),"$prefix/$rel")
    }
  } finally { $archive.Dispose() }
  $listing = @(tar -tf $zip | Sort-Object)
  if (Compare-Object $listing @($files | ForEach-Object {"$prefix/$_"} | Sort-Object) -CaseSensitive) { throw 'ZIP allowlist mismatch' }
  $leaf = 'zip-verify-' + [guid]::NewGuid().ToString('N')
  $extract = Join-Path $root $leaf
  [void][IO.Directory]::CreateDirectory($extract)
  try {
    tar -xf $zip -C $extract
    $dir = Join-Path $extract $prefix
    if (Compare-Object $manifest (Get-Content -LiteralPath (Join-Path $dir 'integrity/SHA256SUMS.txt'))) {
      throw 'Extracted manifest mismatch'
    }
    foreach ($line in $manifest) {
      if ($line -cnotmatch '^([a-f0-9]{64})  (.+)$') { throw 'Invalid manifest line' }
      if ((Hash (Join-Path $dir $Matches[2])) -cne $Matches[1]) { throw 'Extracted file hash mismatch' }
    }
  } finally { SafeRemove $extract $leaf }
  $size = (Get-Item -LiteralPath $zip).Length
  $digest = Hash $zip
  if (-not (certutil -hashfile $zip SHA256 | Where-Object { ($_ -replace '\s','').ToLowerInvariant() -eq $digest })) {
    throw 'Independent archive digest mismatch'
  }
  $report = Join-Path $root 'ACMI-Phase-0.9.5-Final-Report.md'
  Copy-Item -LiteralPath (Join-Path $stage $finalReport) -Destination $report
  @('', '## 交付核验', '', "本地 HEAD: $head", "ZIP: $zip", "大小: $size bytes", "SHA-256: $digest",
    "独立 tar.exe 解压：$($listing.Count) 个归档条目，$($manifest.Count) 项载荷 SHA-256 通过。",
    '完整工作区检查、隔离 dsh Source/Built 和新旧离线测试通过；干净克隆 6 份基准制品逐字节一致。') |
    Add-Content -Encoding utf8 -LiteralPath $report
  $listing | Set-Content -Encoding utf8 -LiteralPath (Join-Path $root 'ZIP-ENTRIES.txt')
  @("$prefix.zip",'ACMI-Phase-0.9.5-Final-Report.md','ZIP-ENTRIES.txt') |
    ForEach-Object { "$(Hash (Join-Path $root $_))  $_" } |
    Set-Content -Encoding utf8 -LiteralPath (Join-Path $root 'SHA256SUMS.txt')
  [pscustomobject]@{ commit=$head; zip=$zip; bytes=$size; sha256=$digest; entries=$listing.Count; payload=$manifest.Count } |
    ConvertTo-Json -Compress
} finally { Pop-Location }
