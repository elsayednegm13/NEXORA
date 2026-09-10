param(
    [switch]$DeployRemote
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "NEXORA NX-OPS-1 — Clients + Inquiry Conversion" -ForegroundColor Cyan
Write-Host "Baseline: Phase 6.2 + NX-CORE-2 + NX-DATA-1 (0004 Clients Core)." -ForegroundColor DarkGray
Write-Host "This script never creates a replacement D1 database and never resets Worker Secrets." -ForegroundColor Yellow

node .\scripts\NX_OPS_1_CHECK.mjs
if ($LASTEXITCODE -ne 0) {
    throw "NX-OPS-1 engineering gate failed. Remote changes are blocked."
}

if (-not $DeployRemote) {
    Write-Host "NX-OPS-1 local gate PASS. No remote Cloudflare write/deploy performed." -ForegroundColor Green
    Write-Host "After owner approval, from the EXISTING bound NEXORA Cloudflare project run:" -ForegroundColor Yellow
    Write-Host ".\scripts\APPLY_NX_OPS_1.ps1 -DeployRemote" -ForegroundColor White
    exit 0
}

if (-not (Test-Path .\wrangler.jsonc)) { throw "wrangler.jsonc was not found." }
$config = Get-Content -Raw -Path .\wrangler.jsonc
if ($config -notmatch '"d1_databases"') {
    throw "No D1 binding exists in this working copy. Do NOT create a replacement database. Use the existing deployed NEXORA project with DB already bound."
}
if ($config -notmatch '"binding"\s*:\s*"DB"') {
    throw "The required D1 binding named DB was not found. Deployment is blocked to avoid targeting the wrong database."
}

Write-Host "Checking Cloudflare identity..." -ForegroundColor Cyan
npx wrangler whoami
if ($LASTEXITCODE -ne 0) { throw "Cloudflare authentication check failed." }

Write-Host "Reading current remote D1 migration state..." -ForegroundColor Cyan
npx wrangler d1 migrations list DB --remote
if ($LASTEXITCODE -ne 0) { throw "Unable to read the existing remote D1 migration state." }

Write-Host "Applying pending migrations to the EXISTING DB binding (expected maximum inventory: 0001..0004)..." -ForegroundColor Yellow
npx wrangler d1 migrations apply DB --remote
if ($LASTEXITCODE -ne 0) { throw "Remote D1 migration apply failed. Worker deployment is blocked." }

Write-Host "Verifying remote migration state after apply..." -ForegroundColor Cyan
npx wrangler d1 migrations list DB --remote
if ($LASTEXITCODE -ne 0) { throw "Unable to verify remote migration state after apply. Worker deployment is blocked." }

Write-Host "Read-only remote Clients schema probe..." -ForegroundColor Cyan
npx wrangler d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('clients','client_contacts','inquiry_conversions') ORDER BY name;"
if ($LASTEXITCODE -ne 0) { throw "Remote Clients schema probe failed. Worker deployment is blocked." }

Write-Host "Deploying NX-OPS-1 Worker + Admin assets..." -ForegroundColor Cyan
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw "Cloudflare deployment failed." }

if (Test-Path .\scripts\RUNTIME_CHECK.ps1) {
    Write-Host "Running existing public/runtime checks..." -ForegroundColor Cyan
    .\scripts\RUNTIME_CHECK.ps1
    if ($LASTEXITCODE -ne 0) { throw "Existing runtime check failed after deployment." }
}

Write-Host "NX-OPS-1 remote apply/deploy completed." -ForegroundColor Green
Write-Host "Live acceptance is still required: Admin > Clients, controlled Inquiry conversion, AR/EN, Dark/Light, persistence, and real Desktop/Tablet/Mobile browser checks." -ForegroundColor Yellow
Write-Host "Do NOT start 0005/client_projects until that acceptance is recorded." -ForegroundColor Yellow
