[CmdletBinding()]
param([Parameter(Mandatory)][string]$DeliveryRoot)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$delivery = (Resolve-Path -LiteralPath $DeliveryRoot).Path
$base = '052c0ceee7bb3a72867cafbc53cb48b65e98215d'
$branch = 'acmi/phase-0.9'
$name = 'ACMI-Phase-0.9-Deliverables'
$root = (Resolve-Path -LiteralPath (Join-Path $delivery $name)).Path
$zip = Join-Path $delivery "$name.zip"
$outerReport = Join-Path $delivery 'ACMI-Phase-0.9-Final-Report.md'
$outerManifest = Join-Path $delivery 'SHA256SUMS.txt'
$outerReadme = Join-Path $delivery 'README.md'
foreach ($file in @($zip,$outerReport,$outerManifest,$outerReadme)) {
  if (Test-Path -LiteralPath $file) { throw "Refusing to overwrite $file" }
}
if ((git -C $repo branch --show-current) -cne $branch -or (git -C $repo status --porcelain=v2)) { throw 'Clean Phase 0.9 branch required' }
$head = git -C $repo rev-parse HEAD
git -C $repo merge-base --is-ancestor $base $head
$entries = [Collections.Generic.List[string]]::new()
function Entry([string]$rel) {
  $file = Get-Item -Force -LiteralPath (Join-Path $root $rel)
  if ($file.PSIsContainer -or $file.Length -eq 0 -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Invalid entry $rel" }
  $entries.Add($rel)
}
function CopyEntry([string]$rel, [string]$from) {
  Copy-Item -LiteralPath $from -Destination (Join-Path $root $rel)
  Entry $rel
}
foreach ($dir in 'architecture','reports','runbooks','source','integrity') {
  New-Item -ItemType Directory -Path (Join-Path $root $dir) | Out-Null
}
CopyEntry 'README.md' (Join-Path $PSScriptRoot 'delivery-readme.md')
foreach ($stem in 'task-intent-understanding','incremental-understanding-pipeline','worknode-proposal-model',
  'graph-proposal-review-and-apply','task-understanding-evidence-model') {
  $file = "$stem-v0.1.md"
  CopyEntry "architecture/$file" (Join-Path $repo "docs/architecture/$file")
}
CopyEntry 'architecture/0002-trusted-understanding-review.md' (Join-Path $repo 'docs/decisions/0002-trusted-understanding-review.md')
foreach ($stem in 'final-report','task-intent-benchmark','graph-understanding-benchmark','incremental-analysis-performance','proposal-review-validation') {
  $file = "phase-0.9-$stem.md"
  CopyEntry "reports/$file" (Join-Path $repo "docs/experiments/$file")
}
foreach ($stem in 'task-understanding-operations','proposal-review') {
  $file = "phase-0.9-$stem.md"
  CopyEntry "runbooks/$file" (Join-Path $repo "docs/runbooks/$file")
}
foreach ($file in 'phase-0.9-scenarios.json','phase-0.9-results.json','metrics-summary.md','label-provenance.md') { Entry "benchmark/$file" }
foreach ($file in 'contracts','all-tests','source','built','typecheck','quickstart-zstd','diff-check','exit-codes',
  'phase-0.8-benchmark','phase-0.8.1-benchmark','phase-0.8.2-benchmark','phase-0.9-benchmark','clean-clone','versions','test-results-summary') {
  Entry "environment/$file.txt"
}
Entry 'environment/environment-lock-excerpt.md'
Entry 'push/phase-0.8-branch-push-report.md'
$commits = @(git -C $repo log --reverse --format='%H %s' "$base..$head")
$commits | Set-Content -Encoding utf8 -LiteralPath (Join-Path $root 'source/commits.txt')
git -C $repo diff --name-status $base $head | Set-Content -Encoding utf8 -LiteralPath (Join-Path $root 'source/changed-files-manifest.txt')
$patch = Join-Path $root 'source/phase-0.9-changes.patch'
git -C $repo diff --binary --full-index "--output=$patch" $base $head
git -C $repo apply --reverse --check $patch
foreach ($file in 'commits.txt','changed-files-manifest.txt','phase-0.9-changes.patch') { Entry "source/$file" }

$list = @($entries | Sort-Object)
$extra = @(Get-ChildItem -LiteralPath $root -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
if ((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint -or $extra.Count -or
  $list.Count -ne @(Get-ChildItem -LiteralPath $root -Recurse -Force -File).Count) { throw 'Bundle allowlist mismatch' }
function Sha([string]$file) { (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant() }
$inner = 'integrity/SHA256SUMS.txt'
$rows = @(foreach ($rel in $list) {
  if ($rel -cnotmatch '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$' -or
    $rel -match '(?i)(^|/)(\.\.?|\.git|\.env.*|\.npmrc|node_modules|dist|cache|credentials|journals|home|agents)(/|$)|\.(jsonl|sqlite|pem|key|pcap)$') {
    throw "Unsafe bundle entry $rel"
  }
  "$(Sha (Join-Path $root $rel))  $rel"
})
$rows | Set-Content -Encoding utf8 -LiteralPath (Join-Path $root $inner)
[IO.Compression.ZipFile]::CreateFromDirectory($root, $zip, [IO.Compression.CompressionLevel]::Optimal, $true)
$archiveEntries = @(tar.exe -tf $zip | ForEach-Object { $_.Replace('\','/') })
$expected = @($list + $inner | ForEach-Object { "$name/$_" })
if ($archiveEntries.Count -ne $expected.Count -or (Compare-Object -CaseSensitive $archiveEntries $expected)) { throw 'ZIP allowlist mismatch' }
$archiveEntries
$tmp = [IO.Path]::TrimEndingDirectorySeparator((Resolve-Path -LiteralPath ([IO.Path]::GetTempPath())).Path)
$verify = Join-Path $tmp ('acmi-09-verify-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $verify | Out-Null
try {
  tar.exe -xf $zip -C $verify
  $unpacked = Join-Path $verify $name
  $manifest = @(Get-Content -LiteralPath (Join-Path $unpacked $inner))
  if (($manifest -join "`n") -cne ($rows -join "`n")) { throw 'Extracted manifest differs' }
  foreach ($row in $manifest) {
    if ($row -cnotmatch '^([a-f0-9]{64})  ([A-Za-z0-9_./-]+)$') { throw 'Bad manifest entry' }
    $digest = $Matches[1]
    $rel = $Matches[2]
    if ($rel -cnotin $list -or (Sha (Join-Path $unpacked $rel)) -cne $digest) { throw "Extracted checksum differs: $rel" }
  }
} finally {
  $absolute = (Resolve-Path -LiteralPath $verify).Path
  if ($absolute -cne $verify -or (Split-Path $absolute -Parent) -ine $tmp -or
    (Split-Path $absolute -Leaf) -cnotmatch '^acmi-09-verify-[a-f0-9]{32}$') { throw 'Unsafe verification cleanup path' }
  Remove-Item -LiteralPath $absolute -Recurse -Force
}
$digest = Sha $zip
$independent = @(certutil.exe -hashfile $zip SHA256 | ForEach-Object { $_.Trim().Replace(' ','').ToLowerInvariant() } |
  Where-Object { $_ -cmatch '^[a-f0-9]{64}$' })
if ($independent.Count -ne 1 -or $independent[0] -cne $digest) { throw 'Independent ZIP digest differs' }
$bytes = (Get-Item -LiteralPath $zip).Length
Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination $outerReadme
$summary = (Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root 'reports/phase-0.9-final-report.md')).TrimEnd()
$test = (Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root 'environment/test-results-summary.txt')).TrimEnd()
$bench = (Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root 'benchmark/metrics-summary.md')).TrimEnd()
@($summary,'','## Verification receipts','',$test,'',$bench,'','## Local Git and ZIP','',
  "- Branch: $branch","- HEAD: $head",'- Worktree: clean; Phase 0.9 Push: no; Release: no.',
  "- ZIP: $zip","- Bytes: $bytes","- SHA-256: $digest",
  "- Independent tar extraction: $($archiveEntries.Count) entries, $($rows.Count) payload SHA-256 checks passed.",
  '- certutil and Get-FileHash matched; independent extraction scratch removed.','', '### Commits','') +
  @($commits | ForEach-Object { "- $_" }) | Set-Content -Encoding utf8 -LiteralPath $outerReport
$outerRows = @(foreach ($file in $zip,$outerReport,$outerReadme) { "$(Sha $file)  $(Split-Path $file -Leaf)" })
$outerRows | Set-Content -Encoding utf8 -LiteralPath $outerManifest
foreach ($row in $outerRows) {
  if ($row -cnotmatch '^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$' -or (Sha (Join-Path $delivery $Matches[2])) -cne $Matches[1]) {
    throw 'External SHA-256 mismatch'
  }
}
[pscustomobject]@{ ZIP = $zip; Bytes = $bytes; SHA256 = $digest; Entries = $archiveEntries.Count; Verified = $rows.Count; HEAD = $head } |
  ConvertTo-Json
