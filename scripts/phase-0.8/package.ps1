[CmdletBinding()]
param([Parameter(Mandatory)][string]$DeliveryRoot)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$delivery = (Resolve-Path -LiteralPath $DeliveryRoot).Path
$base = '436b8b60b459eb9719e44947e4ad33b60c17fb60'
$branch = 'acmi/phase-0.8'
$bundle = 'ACMI-Phase-0.8-Deliverables'
$root = Join-Path $delivery $bundle
$zip = Join-Path $delivery "$bundle.zip"
$externalReport = Join-Path $delivery 'ACMI-Phase-0.8-Final-Report.md'
$externalReadme = Join-Path $delivery 'README.md'
$externalHashes = Join-Path $delivery 'SHA256SUMS.txt'
foreach ($out in @($zip,$externalReport,$externalReadme,$externalHashes)) {
  if (Test-Path -LiteralPath $out) { throw "Refusing to overwrite $out" }
}
if ((git -C $repo branch --show-current) -cne $branch -or (git -C $repo status --porcelain=v2)) {
  throw 'Packaging requires the committed, clean Phase 0.8 branch'
}
$head = git -C $repo rev-parse HEAD
$files = [Collections.Generic.List[string]]::new()
function Add-Entry([string]$name) {
  $full = Join-Path $root $name
  $info = Get-Item -LiteralPath $full
  if ($info.PSIsContainer -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $info.Length -eq 0) {
    throw "Non-regular or empty evidence file: $name"
  }
  $files.Add($name)
}
foreach ($dir in @('experiments','architecture','source','integrity')) {
  New-Item -ItemType Directory -Path (Join-Path $root $dir) | Out-Null
}
$report = Join-Path $repo 'docs/experiments/phase-0.8-final-report.md'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'delivery-readme.md') -Destination (Join-Path $root 'README.md')
Add-Entry 'README.md'
foreach ($name in @('final-report','task-graph-validation','context-assembly-benchmark','dsh-compact-hook-investigation','cross-session-recovery')) {
  $file = "phase-0.8-$name.md"
  Copy-Item -LiteralPath (Join-Path $repo "docs/experiments/$file") -Destination (Join-Path $root "experiments/$file")
  Add-Entry "experiments/$file"
}
foreach ($name in @('task-graph-model','task-lifecycle-and-join-semantics','context-assembly-architecture','context-package-schema','task-aware-compaction-integration')) {
  $file = "$name-v0.1.md"
  Copy-Item -LiteralPath (Join-Path $repo "docs/architecture/$file") -Destination (Join-Path $root "architecture/$file")
  Add-Entry "architecture/$file"
}
foreach ($name in @('scenarios.json','results.json','metrics-summary.md','label-provenance.md')) { Add-Entry "benchmark/$name" }
foreach ($name in @('workspace-check','typecheck','contracts-independent-build','dsh-source','dsh-built','quickstart-zstd',
    'benchmark-run','regression-by-test','versions','test-results-summary','clean-clone')) { Add-Entry "environment/$name.txt" }
Add-Entry 'environment/environment-lock-excerpt.md'

$commits = @(git -C $repo log --reverse --format='%H %s' "$base..$head")
$commits | Set-Content -Encoding utf8 (Join-Path $root 'source/commits.txt')
git -C $repo diff --name-status $base $head | Set-Content -Encoding utf8 (Join-Path $root 'source/changed-files-manifest.txt')
$diff = Join-Path $root 'source/phase-0.8-changes.patch'
git -C $repo diff --binary --full-index "--output=$diff" $base $head
git -C $repo apply --reverse --check $diff
foreach ($name in @('commits.txt','changed-files-manifest.txt','phase-0.8-changes.patch')) { Add-Entry "source/$name" }

$sorted = @($files | Sort-Object)
if ($sorted.Count -ne (@(Get-ChildItem -LiteralPath $root -File -Recurse -Force)).Count -or
  (Get-ChildItem -LiteralPath $root -Directory -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })) {
  throw 'Staging contains files outside the explicit allowlist'
}
$forbidden = '(?i)(?:^|[/\\])(?:\.git|\.env(?:\..*)?|\.npmrc|node_modules|dist|\.cache|credentials?|journals?|home|agents)(?:[/\\]|$)'
$manifestRows = @(
  foreach ($name in $sorted) {
    if ($name -match $forbidden) { throw "Forbidden path: $name" }
    $digest = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root $name)).Hash.ToLowerInvariant()
    "$digest  $name"
  }
)
$innerName = 'integrity/SHA256SUMS.txt'
$manifestRows | Set-Content -Encoding utf8 (Join-Path $root $innerName)
[IO.Compression.ZipFile]::CreateFromDirectory($root, $zip, [IO.Compression.CompressionLevel]::Optimal, $true)

$entries = @(tar.exe -tf $zip | ForEach-Object { $_.Replace('\','/') })
$allowed = @($sorted + $innerName | ForEach-Object { "$bundle/$_" })
if ($entries.Count -ne $allowed.Count -or (Compare-Object -CaseSensitive $allowed $entries)) {
  throw 'ZIP entries differ from the allowlist'
}
$tempRoot = [IO.Path]::TrimEndingDirectorySeparator((Resolve-Path -LiteralPath ([IO.Path]::GetTempPath())).Path)
$temp = Join-Path $tempRoot ('acmi-phase08-verify-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  tar.exe -xf $zip -C $temp
  $unpacked = Join-Path $temp $bundle
  $actualManifest = @(Get-Content -LiteralPath (Join-Path $unpacked $innerName))
  if (($actualManifest -join "`n") -cne ($manifestRows -join "`n")) { throw 'ZIP internal manifest mismatch' }
  foreach ($row in $actualManifest) {
    if ($row -cnotmatch '^([0-9a-f]{64})  ([A-Za-z0-9_./-]+)$') { throw 'Invalid checksum row' }
    $expected = $Matches[1]
    $name = $Matches[2]
    if ($name -cnotin $sorted) { throw "Unexpected checksum path: $name" }
    $found = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $unpacked $name)).Hash.ToLowerInvariant()
    if ($found -cne $expected) { throw "Extracted SHA-256 mismatch: $name" }
  }
} finally {
  $resolved = (Resolve-Path -LiteralPath $temp).Path
  if ($resolved -cne $temp -or (Split-Path $resolved -Parent) -ine $tempRoot -or
    (Split-Path $resolved -Leaf) -cnotmatch '^acmi-phase08-verify-[0-9a-f]{32}$') {
    throw "Unsafe verification cleanup target: $resolved"
  }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
$zipHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash.ToLowerInvariant()
$otherHash = @(certutil.exe -hashfile $zip SHA256 | ForEach-Object { $_.Trim().Replace(' ','').ToLowerInvariant() } |
  Where-Object { $_ -cmatch '^[0-9a-f]{64}$' })
if ($otherHash.Count -ne 1 -or $otherHash[0] -cne $zipHash) { throw 'Independent outer SHA-256 mismatch' }
$bytes = (Get-Item -LiteralPath $zip).Length
Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination $externalReadme
$extra = @(
  '', '## Verified local handoff', '',
  "- Branch: $branch"
  "- HEAD: $head"
  '- Worktree: clean; Push: no.'
  "- Final ZIP: $zip"
  "- Final report: $externalReport"
  "- SHA-256 manifest: $externalHashes"
  "- ZIP bytes: $bytes"
  "- ZIP SHA-256: $zipHash"
  "- Independent tar.exe extraction: $($entries.Count) allowlisted entries, $($manifestRows.Count) checksums matched."
  '- Independent certutil SHA-256 matched; temporary extraction removed.'
  '', '### Local commits', ''
)
@((Get-Content -Raw -LiteralPath $report).TrimEnd()) + $extra + @($commits | ForEach-Object { "- $_" }) |
  Set-Content -Encoding utf8 $externalReport
$outerRows = @(foreach ($file in @($zip,$externalReadme,$externalReport)) {
  $digest = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant()
  "$digest  $(Split-Path $file -Leaf)"
})
$outerRows | Set-Content -Encoding utf8 $externalHashes
[pscustomobject]@{ ZIP = $zip; Bytes = $bytes; SHA256 = $zipHash; Entries = $entries.Count; Verified = $manifestRows.Count; HEAD = $head } |
  ConvertTo-Json
