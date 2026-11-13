param(
  [Parameter(Mandatory = $true)][string]$Out,
  [int]$Port = 19118,
  [ValidateSet('retrieval', 'derived')][string]$Gate = 'retrieval'
)
$ErrorActionPreference = 'Stop'
$exe = 'E:\codex-prj\ACMI\acmi-098-local-runtime\llama\llama-server.exe'
$model = 'E:\codex-prj\ACMI\acmi-099-local-runtime\Qwen3-14B-Q4_K_M.gguf'
$expectedExe = 'f9c45c8880180d6e6dd9f2e6077b5e4cabb8af6ae5e013d710712543cdc3cdc5'
$expectedModel = '500a8806e85ee9c83f3ae08420295592451379b4f8cf2d0f41c15dffeb6b81f0'
if ($Port -lt 1024 -or $Port -gt 65535) { throw 'Port out of range' }
$output = [IO.Path]::GetFullPath($Out)
if (Test-Path -LiteralPath $output) { throw 'Evidence output already exists; refusing overwrite' }
$exeHash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash.ToLowerInvariant()
$modelHash = (Get-FileHash -LiteralPath $model -Algorithm SHA256).Hash.ToLowerInvariant()
if ($exeHash -ne $expectedExe -or $modelHash -ne $expectedModel) { throw 'Pinned runtime/model digest mismatch' }
$probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
try { $probe.Start() } finally { $probe.Stop() }
New-Item -ItemType Directory -Path $output | Out-Null
$arguments = @('--model', $model, '--alias', 'Qwen3-14B-Q4_K_M', '--host', '127.0.0.1', '--port', $Port,
  '--ctx-size', '8192', '--n-gpu-layers', '27', '--parallel', '1', '--reasoning', 'off',
  '--seed', '91801', '--no-webui', '--offline', '--no-cache-prompt', '--no-cache-idle-slots')
$manifest = [ordered]@{ startedAt = [DateTime]::UtcNow.ToString('o'); exe = $exe; exeSha256 = $exeHash;
  model = $model; modelSha256 = $modelHash; modelBytes = (Get-Item -LiteralPath $model).Length;
  arguments = $arguments; maxRequests = 8; plannedRequests = $(if ($Gate -eq 'derived') { 4 } else { 3 });
  gate = $Gate; maxOutputTokens = 512;
  timeoutMs = 120000; retries = 0; externalApiCost = 0 }
$owned = $null
$runnerCode = 1
try {
  $owned = Start-Process -FilePath $exe -ArgumentList $arguments -PassThru -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $output 'server.stdout.txt') `
    -RedirectStandardError (Join-Path $output 'server.stderr.txt')
  $manifest.pid = $owned.Id
  $manifest.processStart = $owned.StartTime.ToUniversalTime().ToString('o')
  $deadline = [DateTime]::UtcNow.AddSeconds(120)
  $ready = $false
  while ([DateTime]::UtcNow -lt $deadline) {
    if ($owned.HasExited) { throw 'Owned llama server exited before readiness' }
    try {
      $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2
      if ($health.status -eq 'ok') { $ready = $true; break }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  if (-not $ready) { throw 'Owned llama server readiness timed out' }
  $listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen
  if ($listener.OwningProcess -ne $owned.Id) { throw 'Endpoint is not owned by the launched process' }
  $manifest.readyAt = [DateTime]::UtcNow.ToString('o')
  & node (Join-Path $PSScriptRoot 'run.mjs') --mode real --out (Join-Path $output 'acceptance') `
    --endpoint "http://127.0.0.1:$Port/v1/chat/completions" --model Qwen3-14B-Q4_K_M --gate $Gate
  $runnerCode = $LASTEXITCODE
  $manifest.runnerExitCode = $runnerCode
} catch {
  $manifest.error = $_.Exception.Message
  throw
} finally {
  if ($null -ne $owned) {
    if (-not $owned.HasExited) { $owned.Kill(); $owned.WaitForExit(10000) | Out-Null }
    $manifest.ownedProcessStopped = $owned.HasExited
  }
  $manifest.finishedAt = [DateTime]::UtcNow.ToString('o')
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $output 'runtime.json') -Encoding utf8
}
exit $runnerCode
