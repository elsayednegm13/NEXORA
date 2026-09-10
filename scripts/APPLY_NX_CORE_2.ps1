param(
    [switch]$Deploy
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "NEXORA NX-CORE-2 — Modular Foundation Refactor" -ForegroundColor Cyan
Write-Host "Running behavior-preserving gate. No D1 migration is part of this phase." -ForegroundColor Yellow

node .\scripts\NX_CORE_2_CHECK.mjs
if ($LASTEXITCODE -ne 0) {
    throw "NX-CORE-2 gate failed. Deployment is blocked."
}

if (-not $Deploy) {
    Write-Host "NX-CORE-2 validation PASS. No deployment performed." -ForegroundColor Green
    Write-Host "After owner approval run: .\scripts\APPLY_NX_CORE_2.ps1 -Deploy" -ForegroundColor Yellow
    exit 0
}

Write-Host "Deploying code/static assets only. No D1 migration command will run." -ForegroundColor Yellow
npx wrangler deploy
if ($LASTEXITCODE -ne 0) {
    throw "Cloudflare deploy failed."
}

if (Test-Path .\scripts\RUNTIME_CHECK.ps1) {
    .\scripts\RUNTIME_CHECK.ps1
    if ($LASTEXITCODE -ne 0) {
        throw "Runtime check failed after deployment."
    }
}

Write-Host "NX-CORE-2 deploy completed. Perform owner real-browser acceptance before starting 0004." -ForegroundColor Green
