[CmdletBinding()]
param([Parameter(Mandatory)][string]$DeliveryRoot)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$base = '93df8375232206aa3f0b7b5677de4b6c21743d81'
$branch = 'acmi/phase-0.9.2'
$name = 'ACMI-Phase-0.9.2-Deliverables'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$delivery = (Resolve-Path -LiteralPath $DeliveryRoot).Path
$root = (Resolve-Path -LiteralPath (Join-Path $delivery $name)).Path
$zip = Join-Path $delivery "$name.zip"
$report = Join-Path $delivery 'ACMI-Phase-0.9.2-Final-Report.md'
$readme = Join-Path $delivery 'README.md'
$manifest = Join-Path $delivery 'SHA256SUMS.txt'
$files = Join-Path $delivery 'FILES.txt'
foreach ($f in $zip,$report,$readme,$manifest,$files) {
  if (Test-Path -LiteralPath $f) { throw "Refusing to overwrite $f" }
}
foreach ($dir in $delivery,$root) {
  if ((Get-Item -LiteralPath $dir).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked directory: $dir" }
}
if ((git -C $repo branch --show-current) -cne $branch -or (git -C $repo status --porcelain=v2)) {
  throw 'Clean Phase 0.9.2 branch required'
}
$head = git -C $repo rev-parse HEAD
git -C $repo merge-base --is-ancestor $base $head
function Sha([string]$path) { (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant() }
$entries = [Collections.Generic.List[string]]::new()
function Entry([string]$rel) {
  $info = Get-Item -Force -LiteralPath (Join-Path $root $rel)
  if ($info.PSIsContainer -or !$info.Length -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw "Invalid payload: $rel"
  }
  $entries.Add($rel)
}
function CopyEntry([string]$rel,[string]$src) {
  $dest = Join-Path $root $rel
  if (Test-Path -LiteralPath $dest) { throw "Refusing to overwrite $dest" }
  [void][IO.Directory]::CreateDirectory((Split-Path $dest -Parent))
  Copy-Item -LiteralPath $src -Destination $dest
  Entry $rel
}

$failure = @('failure-catalog.json','failure-taxonomy.json','aggregate-analysis.json','retrospective-use-notice.md')
$prototype = @('scenarios.json','results.json','comparison.md','limitations.md')
$environment = @(
  'gate-0.txt','versions.txt','test-results-summary.txt','environment-lock-excerpt.md',
  'baseline-pnpm-check.log','all-tests.txt','contracts.txt','typecheck.txt','source.txt','built.txt',
  'quickstart-zstd.txt','diff-check.txt','exit-codes.txt','research-unit-tests.txt','clean-clone.txt'
)
$preexisting = @(
  $failure | ForEach-Object {"failure-analysis/$_"}
  $prototype | ForEach-Object {"prototype/$_"}
  $environment | ForEach-Object {"environment/$_"}
)
$actualPayload = @(Get-ChildItem -LiteralPath $root -Recurse -Force)
if (@($actualPayload | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count) {
  throw 'Preexisting payload contains reparse point'
}
$preexistingFiles = @($actualPayload | Where-Object {!$_.PSIsContainer} |
  ForEach-Object {[IO.Path]::GetRelativePath($root,$_.FullName).Replace('\','/')})
if ($preexistingFiles.Count -ne $preexisting.Count -or (Compare-Object -CaseSensitive $preexistingFiles $preexisting)) {
  throw 'Preexisting evidence does not match allowlist'
}
foreach ($f in $preexisting) { Entry $f }
CopyEntry 'README.md' (Join-Path $PSScriptRoot 'delivery-readme.md.in')

$allowedSource = '^(README(\.zh-CN)?\.md|ROADMAP\.md|CHANGELOG\.md|docs/(research/phase-0\.9\.2-[A-Za-z0-9_./-]+|architecture/(phase-0\.9\.2/[a-z-]+\.mmd|(task-understanding-layered-architecture|understanding-context-package|task-identity-resolution|incremental-understanding-state)-v0\.1\.md)|experiments/phase-0\.9\.2-[a-z-]+\.md|roadmap/phase-0\.9\.3-implementation-plan\.md|decisions/0004-layered-incremental-understanding\.md)|scripts/phase-0\.9\.2/[a-z0-9_.-]+)$'
$sourceFiles = @(git -C $repo diff --name-only $base $head)
$secretPattern = '(?i)(-----BEGIN ([A-Z0-9]+ )*PRIVATE KEY-----|(^|[^a-z0-9_-])(sk-[a-z0-9_-]{20,}|gh[pousr]_[a-z0-9]{24,}|github_pat_[a-z0-9_]{24,}|(AKIA|ASIA)[a-z0-9]{16}|xox[baprs]-[a-z0-9-]{12,}|npm_[a-z0-9]{24,})|https?://[^/@\s]+:[^/@\s]+@|(_authToken|api[_-]?key|password|access[_-]?token)\s*[:=]\s*["''][a-z0-9_./+=-]{12,}["''])'
foreach ($f in $sourceFiles) {
  if ($f -cnotmatch $allowedSource) { throw "Unexpected source path: $f" }
  if ($f -cne 'scripts/phase-0.9.2/package.ps1' -and (Select-String -LiteralPath (Join-Path $repo $f) -Pattern $secretPattern -Quiet)) {
    throw "Sensitive source pattern: $f"
  }
  if ($f -match '^(docs|scripts)/') { CopyEntry $f (Join-Path $repo $f) }
}
[void][IO.Directory]::CreateDirectory((Join-Path $root 'source'))
$commits = @(git -C $repo log --reverse --format='%H %s' "$base..$head")
$commits | Set-Content -Encoding utf8 -LiteralPath (Join-Path $root 'source/commits.txt')
git -C $repo diff --name-status $base $head | Set-Content -Encoding utf8 -LiteralPath (Join-Path $root 'source/changed-files-manifest.txt')
$patch = Join-Path $root 'source/phase-0.9.2-changes.patch'
git -C $repo diff --binary --full-index "--output=$patch" $base $head
git -C $repo apply --reverse --check $patch
foreach ($f in 'commits.txt','changed-files-manifest.txt','phase-0.9.2-changes.patch') { Entry "source/$f" }

$inner = 'integrity/SHA256SUMS.txt'
[void][IO.Directory]::CreateDirectory((Join-Path $root 'integrity'))
$list = @($entries | Sort-Object -CaseSensitive)
$rows = @(foreach ($rel in $list) {
  if ($rel -cnotmatch '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$' -or
      $rel -match '(?i)(^|/)(\.\.?|\.git|\.env.*|\.npmrc|node_modules|dist|cache|credentials|journals|home|agents)(/|$)|\.(jsonl|sqlite|pem|key|pcap)$') {
    throw "Unsafe payload path: $rel"
  }
  $path = Join-Path $root $rel
  if ($rel -cnotin @('source/phase-0.9.2-changes.patch','scripts/phase-0.9.2/package.ps1') -and
      (Select-String -LiteralPath $path -Pattern $secretPattern -Quiet)) { throw "Sensitive pattern: $rel" }
  "$(Sha $path)  $rel"
})
$rows | Set-Content -Encoding utf8 -LiteralPath (Join-Path $root $inner)
[IO.Compression.ZipFile]::CreateFromDirectory($root,$zip,[IO.Compression.CompressionLevel]::Optimal,$true)
$actual = @(tar.exe -tf $zip | ForEach-Object {$_.Replace('\','/')})
$expected = @($list + $inner | ForEach-Object {"$name/$_"})
if ($actual.Count -ne $expected.Count -or (Compare-Object -CaseSensitive $actual $expected)) {
  throw 'Archive allowlist mismatch'
}
$actual
$tmp = [IO.Path]::TrimEndingDirectorySeparator((Resolve-Path -LiteralPath ([IO.Path]::GetTempPath())).Path)
$verify = Join-Path $tmp ('acmi-092-verify-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($verify)
try {
  tar.exe -xf $zip -C $verify
  $unpacked = Join-Path $verify $name
  $hashes = @(Get-Content -LiteralPath (Join-Path $unpacked $inner))
  if (($hashes -join [char]10) -cne ($rows -join [char]10)) { throw 'Extracted manifest mismatch' }
  foreach ($row in $hashes) {
    if ($row -cnotmatch '^([a-f0-9]{64})  ([A-Za-z0-9_./-]+)$') { throw 'Malformed inner hash' }
    $digest = $Matches[1]; $rel = $Matches[2]
    if ($rel -cnotin $list -or (Sha (Join-Path $unpacked $rel)) -cne $digest) { throw "Extracted hash mismatch: $rel" }
  }
} finally {
  $resolved = (Resolve-Path -LiteralPath $verify).Path
  if ($resolved -cne $verify -or (Split-Path $resolved -Parent) -ine $tmp -or
      (Split-Path $resolved -Leaf) -cnotmatch '^acmi-092-verify-[a-f0-9]{32}$') { throw 'Unsafe extraction cleanup path' }
  Remove-Item -LiteralPath $resolved -Recurse
}

$digest = Sha $zip
$extra = @(certutil.exe -hashfile $zip SHA256 | ForEach-Object {$_.Trim().Replace(' ','').ToLowerInvariant()} |
  Where-Object {$_ -cmatch '^[a-f0-9]{64}$'})
if ($extra.Count -ne 1 -or $extra[0] -cne $digest) { throw 'Independent ZIP hash mismatch' }
$bytes = (Get-Item -LiteralPath $zip).Length
$readmeText = Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root 'README.md')
$readmeText -replace '\]\((?=(docs|failure-analysis|prototype|source|environment|integrity)/)', "]($name/" |
  Set-Content -Encoding utf8 -LiteralPath $readme
$summary = (Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root 'docs/experiments/phase-0.9.2-final-report.md')).TrimEnd()
$summary = $summary -replace '\]\(\.\./', "]($name/docs/" -replace '\]\((phase-0\.9\.2-prototype-results\.md)\)', "]($name/docs/experiments/`$1)"
$tests = (Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root 'environment/test-results-summary.txt')).TrimEnd()
$sections = @($summary,'','## I/J. Git、验证回执与交付','',$tests,'',"- Branch: $branch","- Base: $base","- HEAD: $head",
  '- Clean worktree; no Push, Release, main or tag change.',"- ZIP: $zip","- Bytes: $bytes","- SHA-256: $digest",
  "- Independent tar extraction: $($actual.Count) entries, $($rows.Count) payload hashes matched; certutil agreed.",
  "- Absolute file index: $files",'','### Commits','')
$sections + @($commits | ForEach-Object {"- $_"}) | Set-Content -Encoding utf8 -LiteralPath $report
@($zip,$report,$readme,$manifest,$files) + @($list + $inner | ForEach-Object {Join-Path $root $_}) |
  Set-Content -Encoding utf8 -LiteralPath $files
$outer = @(foreach ($f in $zip,$report,$readme,$files) {"$(Sha $f)  $(Split-Path $f -Leaf)"})
$outer | Set-Content -Encoding utf8 -LiteralPath $manifest
foreach ($row in (Get-Content -LiteralPath $manifest)) {
  if ($row -cnotmatch '^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$' -or (Sha (Join-Path $delivery $Matches[2])) -cne $Matches[1]) {
    throw 'Outer SHA-256 mismatch'
  }
}
[pscustomobject]@{ZIP=$zip; Bytes=$bytes; SHA256=$digest; Entries=$actual.Count; Verified=$rows.Count; HEAD=$head} | ConvertTo-Json
