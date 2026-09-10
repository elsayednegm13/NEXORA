$ErrorActionPreference = "Stop"
Write-Host "=== NEXORA Phase 6.1.2 / Admin Light Theme Hotfix ===" -ForegroundColor Cyan

if (-not (Test-Path ".\wrangler.jsonc")) {
    throw "Run this script from the root of your existing NEXORA Cloudflare project."
}
if (-not (Test-Path ".\public\admin\css\admin.css")) {
    throw "public/admin/css/admin.css was not found. Extract the overlay into the project root first."
}

Write-Host "Deploying CSS/UI-only hotfix. No D1 migration and no secret changes will run." -ForegroundColor Yellow
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw "Wrangler deploy failed." }

if (Test-Path ".\scripts\RUNTIME_CHECK.ps1") {
    Write-Host "Running runtime checks..." -ForegroundColor Cyan
    & ".\scripts\RUNTIME_CHECK.ps1"
}

Write-Host "" 
Write-Host "HOTFIX DEPLOYED" -ForegroundColor Green
Write-Host "Open /admin/#overview, switch to Light Mode, then hard refresh with Ctrl+F5." -ForegroundColor Green
