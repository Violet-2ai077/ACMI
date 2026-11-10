[CmdletBinding()]
param([Parameter(Mandatory)][string]$DeliveryRoot)

$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$true
$base='7e92c55d83d1634994e7e39db26cf43ee6e4d06b'
$branch='acmi/phase-0.9.3'
$name='ACMI-Phase-0.9.3-Deliverables'
$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$delivery=(Resolve-Path -LiteralPath $DeliveryRoot).Path
$root=(Resolve-Path -LiteralPath (Join-Path $delivery $name)).Path
$zip=Join-Path $delivery "$name.zip"
$report=Join-Path $delivery 'ACMI-Phase-0.9.3-Final-Report.md'
$readme=Join-Path $delivery 'README.md'
$manifest=Join-Path $delivery 'SHA256SUMS.txt'
$files=Join-Path $delivery 'FILES.txt'
foreach($f in $zip,$report,$readme,$manifest,$files){
  if(Test-Path -LiteralPath $f){throw "Refusing to overwrite $f"}
}
foreach($dir in $delivery,$root){
  if((Get-Item -LiteralPath $dir).Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Linked output $dir"}
}
if((git -C $repo branch --show-current) -cne $branch -or (git -C $repo status --porcelain=v2)){throw 'Clean branch required'}
$head=git -C $repo rev-parse HEAD
git -C $repo merge-base --is-ancestor $base $head
function Sha([string]$path){(Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()}
$entries=[Collections.Generic.List[string]]::new()
function Entry([string]$rel){
  $info=Get-Item -Force -LiteralPath (Join-Path $root $rel)
  if($info.PSIsContainer -or !$info.Length -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw "Invalid payload $rel"}
  $entries.Add($rel)
}
function CopyEntry([string]$rel,[string]$src){
  $dest=Join-Path $root $rel
  if(Test-Path -LiteralPath $dest){throw "Refusing to overwrite $dest"}
  [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest))
  Copy-Item -LiteralPath $src -Destination $dest
  Entry $rel
}

$bench=@('results.json','ablations.json','confusion-matrices.json','cluster-bootstrap.json','performance.json','performance-probe.json')
$environment=@('gate-0.txt','versions.txt','all-tests.txt','contracts.txt','typecheck.txt','source.txt','built.txt',
  'quickstart-zstd.txt','diff-check.txt','exit-codes.txt','shadow-source.txt','shadow-built.txt','research-tests.txt','clean-clone.txt',
  'phase-0.8.txt','phase-0.8.1.txt','phase-0.8.2.txt','phase-0.9.txt','phase-0.9.1-open.txt','phase-0.9.2-tests.txt',
  'test-results-summary.txt','environment-lock-excerpt.md')
$preexisting=@(
  $bench | ForEach-Object {"benchmark/$_"}
  $environment | ForEach-Object {"environment/$_"}
  'experiments/runtime-shadow-results.json'
)
$existing=@(Get-ChildItem -LiteralPath $root -Recurse -Force)
if($existing | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}){throw 'Evidence tree contains reparse point'}
$actual=@($existing | Where-Object {!$_.PSIsContainer} | ForEach-Object {[IO.Path]::GetRelativePath($root,$_.FullName).Replace('\','/')})
if($actual.Count -ne $preexisting.Count -or (Compare-Object -CaseSensitive $actual $preexisting)){throw 'Unexpected evidence files'}
foreach($path in $preexisting){Entry $path}
CopyEntry 'README.md' (Join-Path $PSScriptRoot 'delivery-readme.md.in')

$allowed='^(README(\.zh-CN)?\.md|CHANGELOG\.md|ROADMAP\.md|docs/(architecture/(understanding-context-package-v0\.1|layered-understanding-pipeline-v0\.1|task-identity-resolution-v0\.2|closed-task-historical-hints-v0\.1|evidence-grounded-graph-proposals-v0\.2|incremental-understanding-state-v0\.2)\.md|annotation/phase-0\.9\.3-[a-z.-]+\.(md|json)|experiments/phase-0\.9\.3-[a-z-]+\.md|runbooks/phase-0\.9\.3-[a-z-]+\.md|decisions/0005-implement-read-only-layered-shadow\.md)|packages/(contracts/src/(index|layered-understanding)\.ts|core/(src/(index|layered-[a-z-]+)\.ts|tests/layered-[a-z-]+\.test\.(ts|mjs)))|integrations/dsh/(src/(index|layered-shadow)\.ts|tests/(layered-shadow\.test\.mjs|dsh\.test\.ts))|scripts/phase-0\.9\.3/([a-z0-9.-]+|data/(open-corpus|open-manifest|near-duplicate-audit|internal-reserve-manifest)\.json))$'
$secret='(?i)(-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----|(^|[^a-z0-9_-])(sk-[a-z0-9_-]{20,}|gh[pousr]_[a-z0-9]{24,}|github_pat_[a-z0-9_]{24,}|(?:AKIA|ASIA)[a-z0-9]{16}|xox[baprs]-[a-z0-9-]{12,}|npm_[a-z0-9]{24,})|https?://[^/@\s]+:[^/@\s]+@|(_authToken|api[_-]?key|password|access[_-]?token)\s*[:=]\s*["''][a-z0-9_./+=-]{12,}["''])'
$changes=@(git -C $repo diff --name-only $base $head)
foreach($f in $changes){
  if($f -cnotmatch $allowed){throw "Unreviewed source path $f"}
  $src=Join-Path $repo $f
  if((Get-Item -LiteralPath $src).Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Linked source $f"}
  if($f -cnotin @('scripts/phase-0.9.3/package.ps1','packages/core/src/layered-context.ts') -and
      (Select-String -LiteralPath $src -Pattern $secret -Quiet)){throw "Sensitive source pattern $f"}
  if($f -match '^(docs|packages|integrations|scripts)/'){CopyEntry $f $src}
}
[void][IO.Directory]::CreateDirectory((Join-Path $root 'source'))
$commits=@(git -C $repo log --reverse --format='%H %s' "$base..$head")
$commits | Set-Content -Encoding utf8NoBOM -LiteralPath (Join-Path $root 'source/commits.txt')
git -C $repo diff --name-status $base $head | Set-Content -Encoding utf8NoBOM -LiteralPath (Join-Path $root 'source/changed-files-manifest.txt')
$patch=Join-Path $root 'source/phase-0.9.3-changes.patch'
git -C $repo diff --binary --full-index "--output=$patch" $base $head
git -C $repo apply --reverse --check $patch
foreach($f in 'commits.txt','changed-files-manifest.txt','phase-0.9.3-changes.patch'){Entry "source/$f"}

$inner='integrity/SHA256SUMS.txt'
[void][IO.Directory]::CreateDirectory((Join-Path $root 'integrity'))
$list=@($entries | Sort-Object -CaseSensitive)
$rows=@(foreach($rel in $list){
  if($rel -cnotmatch '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$' -or
      $rel -match '(?i)(^|/)(\.\.?|\.git|\.env.*|\.npmrc|node_modules|dist|cache|credentials|journals|home)(/|$)|\.(jsonl|sqlite|pem|key|pcap)$'){
    throw "Unsafe path $rel"
  }
  $path=Join-Path $root $rel
  if($rel -cnotin @('source/phase-0.9.3-changes.patch','scripts/phase-0.9.3/package.ps1','packages/core/src/layered-context.ts') -and
      (Select-String -LiteralPath $path -Pattern $secret -Quiet)){throw "Sensitive payload pattern $rel"}
  "$(Sha $path)  $rel"
})
$rows | Set-Content -Encoding utf8NoBOM -LiteralPath (Join-Path $root $inner)
[IO.Compression.ZipFile]::CreateFromDirectory($root,$zip,[IO.Compression.CompressionLevel]::Optimal,$true)
$listed=@(tar.exe -tf $zip | ForEach-Object {$_.Replace('\','/')})
$expected=@($list + $inner | ForEach-Object {"$name/$_"})
if($listed.Count -ne $expected.Count -or (Compare-Object -CaseSensitive $listed $expected)){throw 'Archive allowlist mismatch'}
$listed
$tmp=[IO.Path]::TrimEndingDirectorySeparator((Resolve-Path -LiteralPath ([IO.Path]::GetTempPath())).Path)
$verify=Join-Path $tmp ('acmi-093-verify-'+[guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($verify)
try{
  tar.exe -xf $zip -C $verify
  $unpacked=Join-Path $verify $name
  $hashes=@(Get-Content -LiteralPath (Join-Path $unpacked $inner))
  if(($hashes -join [char]10) -cne ($rows -join [char]10)){throw 'Extracted manifest mismatch'}
  foreach($row in $hashes){
    if($row -cnotmatch '^([a-f0-9]{64})  ([A-Za-z0-9_./-]+)$'){throw 'Malformed extracted digest'}
    if($Matches[2] -cnotin $list -or (Sha (Join-Path $unpacked $Matches[2])) -cne $Matches[1]){throw "Extracted hash mismatch $row"}
  }
}finally{
  $resolved=(Resolve-Path -LiteralPath $verify).Path
  if($resolved -cne $verify -or (Split-Path $resolved -Parent) -ine $tmp -or
      (Split-Path $resolved -Leaf) -cnotmatch '^acmi-093-verify-[a-f0-9]{32}$'){throw 'Unsafe cleanup target'}
  Remove-Item -LiteralPath $resolved -Recurse
}
$digest=Sha $zip
$independent=@(certutil.exe -hashfile $zip SHA256 | ForEach-Object {$_.Trim().Replace(' ','').ToLowerInvariant()} |
  Where-Object {$_ -cmatch '^[a-f0-9]{64}$'})
if($independent.Count -ne 1 -or $independent[0] -cne $digest){throw 'ZIP SHA mismatch'}
$bytes=(Get-Item -LiteralPath $zip).Length
$content=Get-Content -Raw -LiteralPath (Join-Path $root 'README.md')
$content -replace '\]\((?=(docs|benchmark|scripts|experiments|source|environment|integrity)/)', "]($name/" |
  Set-Content -Encoding utf8NoBOM -LiteralPath $readme
$summary=(Get-Content -Raw -LiteralPath (Join-Path $root 'docs/experiments/phase-0.9.3-final-report.md')).TrimEnd()
$summary=$summary -replace '\]\(\.\./', "]($name/docs/" -replace '\]\((?=phase-0\.9\.3-[a-z-]+\.md\))', "]($name/docs/experiments/"
$tests=(Get-Content -Raw -LiteralPath (Join-Path $root 'environment/test-results-summary.txt')).TrimEnd()
$sections=@($summary,'','## 最终回归与交付回执','',$tests,'',"- Branch: $branch","- Base: $base","- HEAD: $head",
  '- Clean worktree. No Push, Release, main or Alpha tag change.',"- ZIP: $zip","- Bytes: $bytes","- SHA-256: $digest",
  "- Independent tar extraction: $($listed.Count) entries and $($rows.Count) payload digests matched; certutil agreed.",
  "- All absolute file paths: $files",'','### Commits','')
$sections+@($commits | ForEach-Object {"- $_"}) | Set-Content -Encoding utf8NoBOM -LiteralPath $report
@($zip,$report,$readme,$manifest,$files)+@($list+$inner | ForEach-Object {Join-Path $root $_}) |
  Set-Content -Encoding utf8NoBOM -LiteralPath $files
$outer=@(foreach($f in $zip,$report,$readme,$files){"$(Sha $f)  $(Split-Path $f -Leaf)"})
$outer | Set-Content -Encoding utf8NoBOM -LiteralPath $manifest
foreach($row in Get-Content -LiteralPath $manifest){
  if($row -cnotmatch '^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$' -or (Sha (Join-Path $delivery $Matches[2])) -cne $Matches[1]){throw 'External manifest mismatch'}
}
[pscustomobject]@{ZIP=$zip; Bytes=$bytes; SHA256=$digest; Entries=$listed.Count; Verified=$rows.Count; HEAD=$head} | ConvertTo-Json
