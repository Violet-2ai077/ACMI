[CmdletBinding()]
param([Parameter(Mandatory)][string]$DeliveryRoot)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$delivery = (Resolve-Path -LiteralPath $DeliveryRoot).Path
$base = 'd534aaabee4748d2b3e7d8f72cab53754945609e'
$branch = 'acmi/phase-0.8.1'
$bundle = 'ACMI-Phase-0.8.1-Deliverables'
$root = (Resolve-Path -LiteralPath (Join-Path $delivery $bundle)).Path
$zip = Join-Path $delivery "$bundle.zip"
$report = Join-Path $delivery 'ACMI-Phase-0.8.1-Final-Report.md'
$readme = Join-Path $delivery 'README.md'
$outer = Join-Path $delivery 'SHA256SUMS.txt'
foreach ($path in @($zip,$report,$readme,$outer)) {
  if (Test-Path -LiteralPath $path) { throw "Refusing to overwrite $path" }
}
if ((git -C $repo branch --show-current) -cne $branch -or (git -C $repo status --porcelain=v2)) {
  throw 'A clean committed Phase 0.8.1 branch is required'
}
$head = git -C $repo rev-parse HEAD
$files = [Collections.Generic.List[string]]::new()
function Register-Entry([string]$name) {
  $info = Get-Item -LiteralPath (Join-Path $root $name)
  if ($info.PSIsContainer -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint) -or $info.Length -eq 0) {
    throw "Non-regular or empty bundle entry: $name"
  }
  $files.Add($name)
}
function Add-Entry([string]$name,[string]$from) {
  Copy-Item -LiteralPath $from -Destination (Join-Path $root $name)
  Register-Entry $name
}
foreach ($dir in @('experiments','architecture','source','integrity')) {
  New-Item -ItemType Directory -Path (Join-Path $root $dir) | Out-Null
}
Add-Entry 'README.md' (Join-Path $PSScriptRoot 'delivery-readme.md')
foreach ($topic in @('final-report','runtime-event-ingestion','persistent-graph-store','task-understanding','context-runtime','end-to-end-recovery')) {
  $name = "experiments/phase-0.8.1-$topic.md"
  Add-Entry $name (Join-Path $repo "docs/$name")
}
foreach ($topic in @('runtime-event-ingestion','task-graph-event-store','task-understanding-proposal-pipeline','persistent-context-runtime','context-snapshot-lifecycle')) {
  $name = "architecture/$topic-v0.1.md"
  Add-Entry $name (Join-Path $repo "docs/$name")
}
foreach ($name in @('phase-0.8-baseline-reference.json','phase-0.8.1-scenarios.json','phase-0.8.1-results.json',
    'phase-0.8.1-label-provenance.md','metrics-summary.md')) { Register-Entry "benchmark/$name" }
foreach ($name in @('workspace-check','typecheck','contracts','all-tests','source','built','quickstart-zstd','benchmark',
    'phase-0.8-benchmark','clean-clone','versions','test-results-summary')) { Register-Entry "environment/$name.txt" }
Register-Entry 'environment/environment-lock-excerpt.md'

$commits = @(git -C $repo log --reverse --format='%H %s' "$base..$head")
$commits | Set-Content -Encoding utf8 (Join-Path $root 'source/commits.txt')
git -C $repo diff --name-status $base $head | Set-Content -Encoding utf8 (Join-Path $root 'source/changed-files-manifest.txt')
$patch = Join-Path $root 'source/phase-0.8.1-changes.patch'
git -C $repo diff --binary --full-index "--output=$patch" $base $head
git -C $repo apply --reverse --check $patch
foreach ($name in @('commits.txt','changed-files-manifest.txt','phase-0.8.1-changes.patch')) { Register-Entry "source/$name" }

$list = @($files | Sort-Object)
if ((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Bundle is a reparse point' }
if ($list.Count -ne @(Get-ChildItem -LiteralPath $root -File -Recurse -Force).Count -or
    (Get-ChildItem -LiteralPath $root -Directory -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })) {
  throw 'Bundle contains items outside the explicit allowlist'
}
function Sha([string]$path) { (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant() }
$innerName = 'integrity/SHA256SUMS.txt'
$rows = @(foreach ($name in $list) {
  if ($name -cnotmatch '^[A-Za-z0-9_./-]+$' -or $name -match '(?i)(^|/)(\.git|\.env.*|\.npmrc|node_modules|dist|cache|credentials|journals|home|agents)(/|$)') {
    throw "Unsafe bundle entry: $name"
  }
  "$(Sha (Join-Path $root $name))  $name"
})
$rows | Set-Content -Encoding utf8 (Join-Path $root $innerName)
[IO.Compression.ZipFile]::CreateFromDirectory($root, $zip, [IO.Compression.CompressionLevel]::Optimal, $true)
$entries = @(tar.exe -tf $zip | ForEach-Object { $_.Replace('\','/') })
$expected = @($list + $innerName | ForEach-Object { "$bundle/$_" })
if ($entries.Count -ne $expected.Count -or (Compare-Object -CaseSensitive $entries $expected)) { throw 'ZIP allowlist mismatch' }
$tmp = [IO.Path]::TrimEndingDirectorySeparator((Resolve-Path -LiteralPath ([IO.Path]::GetTempPath())).Path)
$verify = Join-Path $tmp ('acmi-081-verify-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $verify | Out-Null
try {
  tar.exe -xf $zip -C $verify
  $unpacked = Join-Path $verify $bundle
  $inside = @(Get-Content -LiteralPath (Join-Path $unpacked $innerName))
  if (($inside -join "`n") -cne ($rows -join "`n")) { throw 'Inner manifest mismatch' }
  foreach ($row in $inside) {
    if ($row -cnotmatch '^([a-f0-9]{64})  ([A-Za-z0-9_./-]+)$') { throw 'Malformed SHA-256 entry' }
    $digest = $Matches[1]
    $name = $Matches[2]
    if ($name -cnotin $list -or (Sha (Join-Path $unpacked $name)) -cne $digest) { throw "Extracted checksum mismatch: $name" }
  }
} finally {
  $resolved = (Resolve-Path -LiteralPath $verify).Path
  if ($resolved -cne $verify -or (Split-Path $resolved -Parent) -ine $tmp -or
      (Split-Path $resolved -Leaf) -cnotmatch '^acmi-081-verify-[a-f0-9]{32}$') { throw 'Unsafe verification cleanup target' }
  Remove-Item -LiteralPath $resolved -Recurse -Force
}
$zipHash = Sha $zip
$independent = @(certutil.exe -hashfile $zip SHA256 | ForEach-Object { $_.Trim().Replace(' ','').ToLowerInvariant() } |
  Where-Object { $_ -cmatch '^[a-f0-9]{64}$' })
if ($independent.Count -ne 1 -or $independent[0] -cne $zipHash) { throw 'Independent SHA-256 differs' }
$bytes = (Get-Item -LiteralPath $zip).Length
Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination $readme
$baseReport = (Get-Content -Raw -LiteralPath (Join-Path $root 'experiments/phase-0.8.1-final-report.md')).TrimEnd()
@($baseReport,'','## Verified local handoff','',"- Branch: $branch","- HEAD: $head",'- Worktree: clean; Push: no.',
  "- Final report: $report","- ZIP: $zip","- SHA-256 manifest: $outer","- ZIP bytes: $bytes","- ZIP SHA-256: $zipHash",
  "- Independent tar.exe extraction: $($entries.Count) allowlisted entries; $($rows.Count) inner SHA-256 values matched.",
  '- certutil matched Get-FileHash. Verification scratch removed.','', '### Commits','') + @($commits | ForEach-Object { "- $_" }) |
  Set-Content -Encoding utf8 $report
$outerRows = @(foreach ($file in @($zip,$report,$readme)) { "$(Sha $file)  $(Split-Path $file -Leaf)" })
$outerRows | Set-Content -Encoding utf8 $outer
[pscustomobject]@{ ZIP = $zip; Bytes = $bytes; SHA256 = $zipHash; Entries = $entries.Count; Verified = $rows.Count; HEAD = $head } |
  ConvertTo-Json
