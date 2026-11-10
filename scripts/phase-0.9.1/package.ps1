[CmdletBinding()]
param([Parameter(Mandatory)][string]$DeliveryRoot)

$ErrorActionPreference='Stop'
$PSNativeCommandUseErrorActionPreference=$true
$repo=(Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$delivery=(Resolve-Path -LiteralPath $DeliveryRoot).Path
$branch='acmi/phase-0.9.1'
$base='56f36c474bba3823b5ba1f7a76b650a4c3332bfb'
$name='ACMI-Phase-0.9.1-Deliverables'
$root=(Resolve-Path -LiteralPath (Join-Path $delivery $name)).Path
$zip=Join-Path $delivery "$name.zip"
$report=Join-Path $delivery 'ACMI-Phase-0.9.1-Final-Report.md'
$readme=Join-Path $delivery 'README.md'
$manifest=Join-Path $delivery 'SHA256SUMS.txt'
$files=Join-Path $delivery 'FILES.txt'
foreach($f in $zip,$report,$readme,$manifest,$files){
  if(Test-Path -LiteralPath $f){throw "Refusing to overwrite $f"}
}
if((git -C $repo branch --show-current) -cne $branch -or (git -C $repo status --porcelain=v2)){
  throw 'Clean Phase 0.9.1 branch required'
}
$head=git -C $repo rev-parse HEAD
git -C $repo merge-base --is-ancestor $base $head
$entries=[Collections.Generic.List[string]]::new()
function Entry([string]$rel) {
  $info=Get-Item -Force -LiteralPath (Join-Path $root $rel)
  if($info.PSIsContainer -or !$info.Length -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw "Invalid payload: $rel"}
  $entries.Add($rel)
}
function CopyEntry([string]$rel,[string]$src) {
  Copy-Item -LiteralPath $src -Destination (Join-Path $root $rel)
  Entry $rel
}
function Sha([string]$path){(Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()}
foreach($dir in 'reports','architecture','source','integrity'){
  New-Item -ItemType Directory -Path (Join-Path $root $dir) | Out-Null
}
CopyEntry 'README.md' (Join-Path $PSScriptRoot 'delivery-readme.md')
CopyEntry 'reports/real-model-evaluation-template.json' (Join-Path $PSScriptRoot 'real-model-evaluation-template.json')
foreach($stem in 'final-report','natural-language-benchmark','evidence-validation','candidate-retrieval','model-evaluation-harness','runtime-shadow'){
  $f="phase-0.9.1-$stem.md"
  CopyEntry "reports/$f" (Join-Path $repo "docs/experiments/$f")
}
foreach($stem in 'natural-language-task-understanding','evidence-grounded-proposal','task-candidate-retrieval',
  'explicit-task-lifecycle-operations','model-evaluation-harness'){
  $f="$stem-v0.1.md"
  CopyEntry "architecture/$f" (Join-Path $repo "docs/architecture/$f")
}
CopyEntry 'architecture/0003-qualification-separates-prediction-and-apply.md' (Join-Path $repo 'docs/decisions/0003-qualification-separates-prediction-and-apply.md')
foreach($stem in 'task-understanding-label-guide','annotation-workflow','adjudication-protocol'){
  $f="$stem-v0.1.md"
  CopyEntry "annotation/$f" (Join-Path $repo "docs/annotation/$f")
}
foreach($f in 'blind-review-packet-a.json','blind-review-packet-b.json','annotation-template.json','annotation-schema.json','human-review-status.md'){
  Entry "annotation/$f"
}
foreach($f in 'scenarios.json','results.json','confusion-matrices.json','split-manifest.json','corpus-hashes.txt',
  'holdout-freeze.json','holdout-consumed.json','metrics-summary.md'){Entry "benchmark/$f"}
foreach($f in 'gate-0','all-tests','typecheck','contracts','source','built','quickstart-zstd','diff-check','exit-codes',
  'phase-0.8-benchmark','phase-0.8.1-benchmark','phase-0.8.2-benchmark','phase-0.9-benchmark','phase-0.9.1-open-benchmark',
  'phase-0.9.1-final-benchmark','clean-clone','versions','test-results-summary'){Entry "environment/$f.txt"}
Entry 'environment/environment-lock-excerpt.md'
$commits=@(git -C $repo log --reverse --format='%H %s' "$base..$head")
$commits | Set-Content -Encoding utf8 -LiteralPath (Join-Path $root 'source/commits.txt')
git -C $repo diff --name-status $base $head | Set-Content -Encoding utf8 -LiteralPath (Join-Path $root 'source/changed-files-manifest.txt')
$patch=Join-Path $root 'source/phase-0.9.1-changes.patch'
git -C $repo diff --binary --full-index "--output=$patch" $base $head
git -C $repo apply --reverse --check $patch
foreach($f in 'commits.txt','changed-files-manifest.txt','phase-0.9.1-changes.patch'){Entry "source/$f"}
$list=@($entries | Sort-Object)
if((Get-Item -LiteralPath $root).Attributes -band [IO.FileAttributes]::ReparsePoint -or
  @(Get-ChildItem -LiteralPath $root -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count -or
  $list.Count -ne @(Get-ChildItem -LiteralPath $root -Recurse -Force -File).Count){throw 'Payload allowlist mismatch'}
$inner='integrity/SHA256SUMS.txt'
$rule='(?i)(-----BEGIN ([A-Z0-9]+ )*PRIVATE KEY-----|(^|[^a-z0-9_-])(sk-[a-z0-9_-]{20,}|gh[pousr]_[a-z0-9]{24,}|github_pat_[a-z0-9_]{24,}|(AKIA|ASIA)[a-z0-9]{16}|xox[baprs]-[a-z0-9-]{12,}|npm_[a-z0-9]{24,})|https?://[^/@\s]+:[^/@\s]+@|(_authToken|api[_-]?key|password|access[_-]?token)\s*[:=]\s*["''][a-z0-9_./+=-]{12,}["''])'
$rows=@(foreach($rel in $list){
  if($rel -cnotmatch '^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)*$' -or
    $rel -match '(?i)(^|/)(\.\.?|\.git|\.env.*|\.npmrc|node_modules|dist|cache|credentials|journals|home|agents)(/|$)|\.(jsonl|sqlite|pem|key|pcap)$'){
    throw "Unsafe bundle entry $rel"
  }
  $path=Join-Path $root $rel
  # Scan payload rather than the packaging script's own detector literals in the source patch.
  if($rel -ne 'source/phase-0.9.1-changes.patch' -and (Select-String -LiteralPath $path -Pattern $rule -Quiet)){
    throw "Sensitive pattern: $rel"
  }
  "$(Sha $path)  $rel"
})
$rows | Set-Content -Encoding utf8 -LiteralPath (Join-Path $root $inner)
[IO.Compression.ZipFile]::CreateFromDirectory($root,$zip,[IO.Compression.CompressionLevel]::Optimal,$true)
$actual=@(tar.exe -tf $zip | ForEach-Object {$_.Replace('\','/')})
$expected=@($list + $inner | ForEach-Object {"$name/$_"})
if($actual.Count -ne $expected.Count -or (Compare-Object -CaseSensitive $actual $expected)){throw 'Archive allowlist mismatch'}
$actual
$tmp=[IO.Path]::TrimEndingDirectorySeparator((Resolve-Path -LiteralPath ([IO.Path]::GetTempPath())).Path)
$verify=Join-Path $tmp ('acmi-091-verify-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $verify | Out-Null
try {
  tar.exe -xf $zip -C $verify
  $unpacked=Join-Path $verify $name
  $hashes=@(Get-Content -LiteralPath (Join-Path $unpacked $inner))
  if(($hashes -join "`n") -cne ($rows -join "`n")){throw 'Extracted inner manifest mismatch'}
  foreach($row in $hashes){
    if($row -cnotmatch '^([a-f0-9]{64})  ([A-Za-z0-9_./-]+)$'){throw 'Malformed inner hash'}
    $digest=$Matches[1];$rel=$Matches[2]
    if($rel -cnotin $list -or (Sha (Join-Path $unpacked $rel)) -cne $digest){throw "Extracted checksum mismatch $rel"}
  }
} finally {
  $resolved=(Resolve-Path -LiteralPath $verify).Path
  if($resolved -cne $verify -or (Split-Path $resolved -Parent) -ine $tmp -or
    (Split-Path $resolved -Leaf) -cnotmatch '^acmi-091-verify-[a-f0-9]{32}$'){throw 'Unsafe archive cleanup path'}
  Remove-Item -LiteralPath $resolved -Recurse
}
$digest=Sha $zip
$extra=@(certutil.exe -hashfile $zip SHA256 | ForEach-Object {$_.Trim().Replace(' ','').ToLowerInvariant()} |
  Where-Object {$_ -cmatch '^[a-f0-9]{64}$'})
if($extra.Count -ne 1 -or $extra[0] -cne $digest){throw 'Independent ZIP hash mismatch'}
$bytes=(Get-Item -LiteralPath $zip).Length
Copy-Item -LiteralPath (Join-Path $root 'README.md') -Destination $readme
$summary=(Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root 'reports/phase-0.9.1-final-report.md')).TrimEnd()
$test=(Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root 'environment/test-results-summary.txt')).TrimEnd()
$bench=(Get-Content -Raw -Encoding utf8 -LiteralPath (Join-Path $root 'benchmark/metrics-summary.md')).TrimEnd()
@($summary,'','## Verification receipts','',$test,'',$bench,'','## Local Git and ZIP','',"- Branch: $branch","- Base: $base","- HEAD: $head",
  '- Worktree clean; no Push, Release, main update or tag update.',"- ZIP: $zip","- Bytes: $bytes","- SHA-256: $digest",
  "- Independent tar extraction: $($actual.Count) entries, $($rows.Count) payload hashes matched.","- File index: $files",
  '', '### Commits','') + @($commits | ForEach-Object {"- $_"}) | Set-Content -Encoding utf8 -LiteralPath $report
@($zip,$report,$readme,$manifest,$files) + @($list + $inner | ForEach-Object {Join-Path $root $_}) |
  Set-Content -Encoding utf8 -LiteralPath $files
$outer=@(foreach($f in $zip,$report,$readme,$files){"$(Sha $f)  $(Split-Path $f -Leaf)"})
$outer | Set-Content -Encoding utf8 -LiteralPath $manifest
foreach($row in $outer){
  if($row -cnotmatch '^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$' -or (Sha (Join-Path $delivery $Matches[2])) -cne $Matches[1]){
    throw 'Outer SHA-256 mismatch'
  }
}
[pscustomobject]@{ZIP=$zip;Bytes=$bytes;SHA256=$digest;Entries=$actual.Count;Verified=$rows.Count;HEAD=$head} | ConvertTo-Json
