param(
    [switch]$ApplyRemote
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "NEXORA NX-DATA-1 — Clients Core" -ForegroundColor Cyan
Write-Host "This phase adds D1 schema only. It does not deploy Worker/Admin/Public UI changes." -ForegroundColor Yellow

node .\scripts\NX_DATA_1_CHECK.mjs
if ($LASTEXITCODE -ne 0) {
    throw "NX-DATA-1 static gate failed. D1 apply is blocked."
}

if (-not $ApplyRemote) {
    Write-Host "NX-DATA-1 validation PASS. No remote D1 write performed." -ForegroundColor Green
    Write-Host "After owner approval and from the EXISTING bound Cloudflare project run:" -ForegroundColor Yellow
    Write-Host ".\scripts\APPLY_NX_DATA_1.ps1 -ApplyRemote" -ForegroundColor White
    exit 0
}

if (-not (Test-Path .\wrangler.jsonc)) { throw "wrangler.jsonc was not found." }
$config = Get-Content -Raw -Path .\wrangler.jsonc
if ($config -notmatch '"d1_databases"') {
    throw "No D1 binding is present in this working copy. Do NOT create a replacement database. Run this overlay inside the existing deployed NEXORA Cloudflare project where DB is already bound."
}

Write-Host "Checking Cloudflare identity..." -ForegroundColor Cyan
npx wrangler whoami
if ($LASTEXITCODE -ne 0) { throw "Cloudflare authentication check failed." }

Write-Host "Current remote migration state:" -ForegroundColor Cyan
npx wrangler d1 migrations list DB --remote
if ($LASTEXITCODE -ne 0) { throw "Unable to read remote D1 migration state." }

Write-Host "Applying pending D1 migrations to the EXISTING DB binding..." -ForegroundColor Yellow
npx wrangler d1 migrations apply DB --remote
if ($LASTEXITCODE -ne 0) { throw "Remote D1 migration failed." }

Write-Host "Verifying remote migration state after apply..." -ForegroundColor Cyan
npx wrangler d1 migrations list DB --remote
if ($LASTEXITCODE -ne 0) { throw "Unable to verify remote migration state after apply." }

if (Test-Path .\scripts\RUNTIME_CHECK.ps1) {
    Write-Host "Running existing Phase 6.2 runtime checks..." -ForegroundColor Cyan
    .\scripts\RUNTIME_CHECK.ps1
    if ($LASTEXITCODE -ne 0) { throw "Existing runtime check failed after migration." }
}

Write-Host "NX-DATA-1 remote migration completed. Stop here for the data gate; do not start Clients UI/API until acceptance is recorded." -ForegroundColor Green
