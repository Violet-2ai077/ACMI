# Frozen local-model replay evidence

These files are byte-for-byte selections from the verified phase delivery
archives. The user inputs, tool fixtures, task identifiers, and ground truth
are synthetic; model outputs are from the recorded local runs. Each phase's
`SHA256SUMS.txt` covers every imported file. No private journals, installed
profiles, credentials, full runtime logs, model weights, or binaries are included.

Start with the [experiment timeline](../README.md) for results and limitations.
The data is a historical replay record, not an independent blind benchmark or a
request to rerun the model. No evaluator should infer that phases without a
standalone completion sidecar ran a second pass or had the same capture format.
In particular, the 0.9.12 evidence records the stopped run as it happened.

## Recompute the scores offline

Run from the repository root with the pinned Node version. Build the workspace
first for 0.9.15 and 0.9.16 (`pnpm build` after installing locked dependencies).
The commands below use PowerShell 7 and write only to a new temporary directory.
They check input manifests and compare all nine recomputed scores byte for byte.

```powershell
$evidence = "docs/experiments/evidence"
$out = (New-Item -ItemType Directory (Join-Path ([IO.Path]::GetTempPath()) ("acmi-replay-" + [guid]::NewGuid()))).FullName

foreach ($n in 8..16) {
    $phase = "phase-0.9.$n"
    $root = "$evidence/$phase"
    foreach ($line in Get-Content -LiteralPath "$root/SHA256SUMS.txt") {
        $sha, $name = $line -split '  ', 2
        if ((Get-FileHash -LiteralPath "$root/$name").Hash -ine $sha) { throw "Hash mismatch: $phase/$name" }
    }
    $score = Join-Path $out "$phase.json"
    if ($n -eq 8) {
        node "scripts/$phase/score-local.mjs" "$root/evaluation" "$root/reference" $score
    } elseif ($n -eq 9) {
        node "scripts/$phase/score.mjs" "$root/evaluation" $score
    } else {
        node "scripts/$phase/score.mjs" "$root/corpus" "$root/evaluation" $score
    }
    if ($LASTEXITCODE -ne 0) { throw "Scorer failed: $phase" }
    if ((Get-FileHash -LiteralPath $score).Hash -cne (Get-FileHash -LiteralPath "$root/evaluation/scored-results.json").Hash) {
        throw "Score mismatch: $phase"
    }
}
```

Git preserves the exact evidence bytes across platforms. The comparison
does not verify a new inference run, prove production safety, or change a
phase's gate decision.
