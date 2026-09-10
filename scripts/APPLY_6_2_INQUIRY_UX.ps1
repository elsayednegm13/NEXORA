$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host "=== NEXORA Phase 6.2 / Inquiry UX + Live Sync ===" -ForegroundColor Cyan
Write-Host "This update preserves the existing Worker, D1 data, admin account, bindings and secrets." -ForegroundColor DarkGray

if (-not (Test-Path ".\wrangler.jsonc")) { throw "wrangler.jsonc was not found. Run this from the existing NEXORA Cloudflare project folder." }
if (-not (Test-Path ".\migrations\0003_inquiry_locale.sql")) { throw "Phase 6.2 migration was not found. Make sure the overlay was extracted over the current project." }
if (-not (Test-Path ".\src\worker.js")) { throw "src\worker.js was not found." }

Write-Host "Checking JavaScript syntax..." -ForegroundColor Yellow
node --check .\src\worker.js
if ($LASTEXITCODE -ne 0) { throw "Worker syntax check failed." }
node --check .\public\admin\js\admin.js
if ($LASTEXITCODE -ne 0) { throw "Admin JavaScript syntax check failed." }
node --check .\public\js\contact.js
if ($LASTEXITCODE -ne 0) { throw "Contact JavaScript syntax check failed." }

Write-Host "Checking Cloudflare authentication..." -ForegroundColor Yellow
npx wrangler whoami
if ($LASTEXITCODE -ne 0) { throw "Cloudflare authentication failed." }

Write-Host "Applying pending D1 migrations..." -ForegroundColor Yellow
Write-Host "If Wrangler asks to continue, choose Y. Existing inquiries are NOT deleted." -ForegroundColor DarkGray
npx wrangler d1 migrations apply DB --remote
if ($LASTEXITCODE -ne 0) { throw "D1 migration failed. Deployment was stopped before publishing code." }

Write-Host "Deploying Worker + static assets..." -ForegroundColor Yellow
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw "Cloudflare deployment failed." }

if (Test-Path ".\scripts\RUNTIME_CHECK.ps1") {
    Write-Host "Running public runtime checks..." -ForegroundColor Yellow
    & .\scripts\RUNTIME_CHECK.ps1
}

Write-Host "" 
Write-Host "PHASE 6.2 DEPLOYED" -ForegroundColor Green
Write-Host "Open the Admin Dashboard and press Ctrl+F5 once." -ForegroundColor Green
Write-Host "The inquiries screen now checks for new requests automatically while the tab is visible." -ForegroundColor Cyan
