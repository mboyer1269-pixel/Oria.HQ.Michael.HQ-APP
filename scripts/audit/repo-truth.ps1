#requires -Version 7.0
<#
.SYNOPSIS
  Read-only repo-truth diagnostic for Oria HQ.

.DESCRIPTION
  Emits a dated Markdown snapshot of what the repository ACTUALLY contains —
  recent history, migrations, source footprint, RLS coverage, ledger-integrity
  markers, TODO/FIXME debt, and open PRs. Its purpose is to stop roadmap drift
  by giving agents a verifiable ground-truth report instead of stale plan claims.

  This script is READ-ONLY with respect to the repository: it never modifies,
  stages, commits, or deletes tracked code. Its only write is the report file
  it generates (default under docs/audit/), which is the intended deliverable.

.PARAMETER OutFile
  Output Markdown path. Defaults to docs/audit/REPO_TRUTH_<yyyy-MM>.md at repo root.

.PARAMETER Stdout
  Write the report to stdout instead of a file.

.EXAMPLE
  pwsh scripts/audit/repo-truth.ps1

.EXAMPLE
  pwsh scripts/audit/repo-truth.ps1 -Stdout
#>
[CmdletBinding()]
param(
  [string]$OutFile,
  [switch]$Stdout
)

$ErrorActionPreference = "Stop"

# --- Resolve repo root from this script's location (path-agnostic) ----------
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." "..")).Path
Set-Location $repoRoot

function Invoke-Safe {
  param([scriptblock]$Block, [string]$Fallback = "_(unavailable)_")
  try { & $Block } catch { return $Fallback }
}

function Count-Matches {
  # Counts source lines matching $Pattern. With -CodeOnly, comment-only lines
  # (SQL --, JS //, block * , shell #) are excluded so documentation mentions of
  # a forbidden construct ("-- NO using(true)") are not counted as real usages.
  param([string[]]$Files, [string]$Pattern, [switch]$CodeOnly)
  if (-not $Files -or $Files.Count -eq 0) { return 0 }
  $m = Select-String -Path $Files -Pattern $Pattern -AllMatches -ErrorAction SilentlyContinue
  if (-not $m) { return 0 }
  if ($CodeOnly) {
    $m = $m | Where-Object { -not ($_.Line.TrimStart() -match '^(--|//|\*|#)') }
  }
  return ($m | Measure-Object).Count
}

$now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm 'UTC'")
$stamp = (Get-Date).ToString("yyyy-MM")

# --- Git facts --------------------------------------------------------------
$branch = Invoke-Safe { (git branch --show-current).Trim() }
$head = Invoke-Safe { (git log -1 --pretty=format:'%h %s').Trim() }
$recent = Invoke-Safe { (git log --oneline -20) -join "`n" }

# --- Migrations -------------------------------------------------------------
$migFiles = Invoke-Safe { Get-ChildItem (Join-Path $repoRoot 'db/migrations') -Filter *.sql -ErrorAction SilentlyContinue } @()
$migCount = if ($migFiles) { $migFiles.Count } else { 0 }
$migList = if ($migFiles) { ($migFiles | Sort-Object Name | ForEach-Object { "- $($_.Name)" }) -join "`n" } else { "_(none found)_" }

# --- Source footprint -------------------------------------------------------
function Count-Ts {
  param([string]$RelDir)
  $p = Join-Path $repoRoot $RelDir
  if (-not (Test-Path $p)) { return 0 }
  return (Get-ChildItem $p -Recurse -Include *.ts, *.tsx -File -ErrorAction SilentlyContinue | Measure-Object).Count
}
$domains = 'src/server', 'src/app', 'src/features', 'src/core', 'src/lib'
$domainRows = foreach ($d in $domains) { "| ``$d`` | $(Count-Ts $d) |" }
$totalTs = Count-Ts 'src'
$testFiles = Invoke-Safe { Get-ChildItem (Join-Path $repoRoot 'src') -Recurse -Filter *.test.mjs -File -ErrorAction SilentlyContinue } @()
$testCount = if ($testFiles) { $testFiles.Count } else { 0 }

# --- RLS coverage (db) ------------------------------------------------------
$dbFiles = Invoke-Safe { Get-ChildItem (Join-Path $repoRoot 'db') -Recurse -Filter *.sql -File -ErrorAction SilentlyContinue | ForEach-Object FullName } @()
$rlsEnable = Count-Matches -Files $dbFiles -Pattern 'enable row level security' -CodeOnly
$rlsPolicy = Count-Matches -Files $dbFiles -Pattern 'create policy' -CodeOnly
$usingTrue = Count-Matches -Files $dbFiles -Pattern 'using\s*\(\s*true\s*\)' -CodeOnly
$appWorkspace = Count-Matches -Files $dbFiles -Pattern "current_setting\('app\.workspace_id'" -CodeOnly

# --- Ledger integrity markers (hash-chain delivered?) -----------------------
$srcFiles = Invoke-Safe { Get-ChildItem (Join-Path $repoRoot 'src') -Recurse -Include *.ts, *.tsx, *.mjs -File -ErrorAction SilentlyContinue | ForEach-Object FullName } @()
$hashChain = (Count-Matches -Files $dbFiles -Pattern 'prev_hash|entry_hash|hmac' -CodeOnly) +
             (Count-Matches -Files $srcFiles -Pattern 'prev_hash|entry_hash|hashChain' -CodeOnly)
$hashChainState = if ($hashChain -gt 0) { "✅ markers present ($hashChain)" } else { "❌ not delivered (0 markers)" }

# --- TODO / FIXME debt ------------------------------------------------------
$todo = Count-Matches -Files $srcFiles -Pattern 'TODO|FIXME'

# --- Open PRs (best-effort) -------------------------------------------------
$openPrs = Invoke-Safe {
  $rows = gh pr list --state open --limit 20 --json number,title,isDraft `
    --jq '.[] | "- #\(.number) \(.title)" + (if .isDraft then " (draft)" else "" end)'
  if ($rows) { ($rows -join "`n") } else { "_(none open)_" }
} "_(gh unavailable)_"

# --- Compose report ---------------------------------------------------------
$report = @"
# Repo Truth — Oria HQ ($stamp)

Generated: $now
Generated by: ``scripts/audit/repo-truth.ps1`` (read-only diagnostic)
Branch: ``$branch`` — HEAD: ``$head``

> Ground-truth snapshot of the repository. Prefer this over roadmap prose when
> they disagree. Regenerate with ``pwsh scripts/audit/repo-truth.ps1``.

## Recent history (last 20 commits)

``````
$recent
``````

## Migrations ($migCount in ``db/migrations``)

$migList

## Source footprint

| Domain | TypeScript files (.ts/.tsx) |
|---|---|
$($domainRows -join "`n")
| **Total ``src``** | **$totalTs** |

Test files (``*.test.mjs`` under ``src``): **$testCount**

## Governance / RLS coverage (``db``)

| Signal | Count |
|---|---|
| ``enable row level security`` statements | $rlsEnable |
| ``create policy`` statements | $rlsPolicy |
| ``using (true)`` permissive policies | $usingTrue |
| ``current_setting('app.workspace_id')`` references | $appWorkspace |

> Reminder: full workspace **DB** RLS is intentionally deferred. ``using(true)``
> and unsupported ``app.workspace_id`` references should both stay at **0**.

## Ledger integrity

Hash-chain markers (``prev_hash`` / ``entry_hash`` / ``hmac``): $hashChainState

## TODO / FIXME debt

Occurrences in ``src``: **$todo**

## Open PRs

$openPrs

---
*Read-only diagnostic. This report is the only artifact written; no tracked code is modified.*
"@

if ($Stdout) {
  $report
}
else {
  if (-not $OutFile) {
    $auditDir = Join-Path $repoRoot 'docs/audit'
    if (-not (Test-Path $auditDir)) { New-Item -ItemType Directory -Path $auditDir -Force | Out-Null }
    $OutFile = Join-Path $auditDir "REPO_TRUTH_$stamp.md"
  }
  $report | Set-Content -Path $OutFile -Encoding utf8
  Write-Host "Repo-truth report written to: $OutFile"
}
