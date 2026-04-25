# =============================================================================
# eencyclopedia — finish-setup.ps1
# Run from the project root in Windows PowerShell:
#   .\scripts\finish-setup.ps1
#
# What it does:
#   1. Cleans the half-baked .git/ and stale eencyclopedia-plan.md
#   2. git init + initial commit
#   3. Creates a private GitHub repo via `gh` CLI if available, else prints
#      manual steps
#   4. pnpm install
#   5. Boots `pnpm dev` in a new terminal and curls /api/health + /api/db-ping
#
# Prereqs:
#   - PowerShell 5.1+ (Windows 10/11 default) or PowerShell 7
#   - git installed (https://git-scm.com/download/win)
#   - pnpm installed (`npm install -g pnpm@9` or `corepack enable`)
#   - Optional: gh CLI (https://cli.github.com/) for one-shot GitHub repo creation
# =============================================================================

$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot | Split-Path -Parent
Set-Location $Root
Write-Host "[setup] working in $Root" -ForegroundColor Cyan

# ----- 1. Clean stale files -------------------------------------------------
Write-Host "`n[setup] step 1: cleaning stale files" -ForegroundColor Yellow
if (Test-Path .git) {
    Write-Host "  - removing partial .git/"
    Remove-Item -Recurse -Force .git
}
if (Test-Path eencyclopedia-plan.md) {
    $size = (Get-Item eencyclopedia-plan.md).Length
    if ($size -eq 0) {
        Write-Host "  - removing empty eencyclopedia-plan.md"
        Remove-Item -Force eencyclopedia-plan.md
    }
}

# ----- 2. Verify required env vars are filled -------------------------------
Write-Host "`n[setup] step 2: checking .env.local secrets" -ForegroundColor Yellow
$envFile = '.env.local'
if (-not (Test-Path $envFile)) {
    Write-Error "$envFile not found. Run from project root."
    exit 1
}
$env_text = Get-Content $envFile -Raw
$missing = @()
foreach ($key in @('SUPABASE_SERVICE_ROLE_KEY=PASTE_FROM_DASHBOARD',
                   'ANTHROPIC_API_KEY=PASTE_FROM_CONSOLE',
                   'VOYAGE_API_KEY=PASTE_FROM_DASHBOARD')) {
    if ($env_text -match [regex]::Escape($key)) {
        $missing += $key.Split('=')[0]
    }
}
if ($missing.Count -gt 0) {
    Write-Host "  ! Missing values in .env.local:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "      - $_" -ForegroundColor Red }
    Write-Host "  See DAY1_HANDOFF.md for where to grab each key." -ForegroundColor Red
    Write-Host "  Continue anyway? (y/N): " -NoNewline
    $resp = Read-Host
    if ($resp -ne 'y' -and $resp -ne 'Y') {
        Write-Host "  Aborting. Fill secrets and re-run."
        exit 0
    }
} else {
    Write-Host "  ok — all three secrets appear to be set"
}

# ----- 3. git init + commit -------------------------------------------------
Write-Host "`n[setup] step 3: git init" -ForegroundColor Yellow
git init -b main | Out-Null
git config user.email "krish.shoaib55@gmail.com" | Out-Null
git config user.name "manhoosbilli1" | Out-Null

# Sanity check .env.local is gitignored
$staged_env = git check-ignore .env.local 2>$null
if (-not $staged_env) {
    Write-Error "FATAL: .env.local is NOT in .gitignore. Aborting before any commit could leak it."
    exit 2
}
Write-Host "  - .env.local is correctly gitignored"

git add . | Out-Null
git commit -m "chore: day 1 scaffold — Next 14 + Supabase + AI persona + calculators" | Out-Null
Write-Host "  - initial commit created"

# ----- 4. GitHub repo creation ----------------------------------------------
Write-Host "`n[setup] step 4: GitHub repo" -ForegroundColor Yellow
$gh = Get-Command gh -ErrorAction SilentlyContinue
if ($gh) {
    Write-Host "  - gh CLI found, creating private repo"
    try {
        gh repo create eencyclopedia --private --source=. --remote=origin --push
        Write-Host "  ✓ repo created and pushed" -ForegroundColor Green
    } catch {
        Write-Host "  ! gh repo create failed: $_" -ForegroundColor Red
        Write-Host "  → You may already have a repo named 'eencyclopedia'."
        Write-Host "  → Manual: gh repo create eencyclopedia --private --source=. --push"
        Write-Host "  → Or: create at https://github.com/new and:"
        Write-Host "      git remote add origin https://github.com/<you>/eencyclopedia.git"
        Write-Host "      git push -u origin main"
    }
} else {
    Write-Host "  ! gh CLI not installed." -ForegroundColor Yellow
    Write-Host "  Manual steps:"
    Write-Host "    1. Visit https://github.com/new"
    Write-Host "    2. Name: eencyclopedia, Visibility: Private, no README/license/gitignore"
    Write-Host "    3. After creation, copy the HTTPS clone URL and run:"
    Write-Host "         git remote add origin <URL>"
    Write-Host "         git push -u origin main"
    Write-Host "  (Install gh later: winget install GitHub.cli)"
}

# ----- 5. pnpm install ------------------------------------------------------
Write-Host "`n[setup] step 5: pnpm install" -ForegroundColor Yellow
$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
    Write-Host "  ! pnpm not found. Install: npm install -g pnpm@9" -ForegroundColor Red
    Write-Host "  Skipping install. Run pnpm install manually after pnpm is on PATH."
    exit 0
}
pnpm install --frozen-lockfile=false
Write-Host "  ✓ deps installed" -ForegroundColor Green

# ----- 6. Boot dev server in a new window + smoke test ----------------------
Write-Host "`n[setup] step 6: starting dev server in a new window" -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root'; pnpm dev"
Write-Host "  - opened a new PowerShell running 'pnpm dev'"
Write-Host "  - waiting 8s for Next to compile..."
Start-Sleep -Seconds 8

Write-Host "`n[setup] smoke tests:" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri http://localhost:3000/api/health -TimeoutSec 5
    Write-Host "  /api/health  →  $($health | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "  /api/health  →  FAILED ($_)" -ForegroundColor Red
}
try {
    $ping = Invoke-RestMethod -Uri http://localhost:3000/api/db-ping -TimeoutSec 10
    Write-Host "  /api/db-ping →  $($ping | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    Write-Host "  /api/db-ping →  FAILED ($_) — check SUPABASE_SERVICE_ROLE_KEY" -ForegroundColor Red
}

Write-Host "`n[setup] Done. Open http://localhost:3000" -ForegroundColor Cyan
Write-Host "Next steps: see DAY1_HANDOFF.md"
