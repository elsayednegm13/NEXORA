$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function New-RandomSecret([int]$Bytes = 48) {
    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    return ([Convert]::ToBase64String($buffer)).TrimEnd('=').Replace('+','-').Replace('/','_')
}

Write-Host "=== NEXORA Phase 6.1 / Cloudflare Native ===" -ForegroundColor Cyan
Write-Host "This script creates D1, applies schema/seed, deploys the Worker/static assets, then stores admin secrets." -ForegroundColor DarkGray

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js LTS is required. Install it first with: winget install OpenJS.NodeJS.LTS" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm is required. Reopen PowerShell after installing Node.js LTS." }

npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

Write-Host "Checking Cloudflare login..." -ForegroundColor Cyan
npx wrangler whoami
if ($LASTEXITCODE -ne 0) {
    Write-Host "Opening Cloudflare login..." -ForegroundColor Yellow
    npx wrangler login
    if ($LASTEXITCODE -ne 0) { throw "Cloudflare login failed." }
}

$config = Get-Content -Raw -Path "wrangler.jsonc"
if ($config -notmatch '"d1_databases"') {
    Write-Host "Creating D1 database nexora-db and binding it as DB..." -ForegroundColor Cyan
    npx wrangler d1 create nexora-db --binding DB --update-config
    if ($LASTEXITCODE -ne 0) {
        throw "D1 creation failed. If nexora-db already exists, bind it as DB in wrangler.jsonc, then rerun this script."
    }
} else {
    Write-Host "D1 binding already exists in wrangler.jsonc; keeping it." -ForegroundColor Green
}

Write-Host "Applying D1 migrations (schema + verified seed)..." -ForegroundColor Cyan
npx wrangler d1 migrations apply DB --remote
if ($LASTEXITCODE -ne 0) { throw "D1 migration failed." }

Write-Host "Deploying NEXORA Worker + static assets..." -ForegroundColor Cyan
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw "Worker deployment failed." }

$setupKey = New-RandomSecret 36
$sessionSecret = New-RandomSecret 48
$ipHashSecret = New-RandomSecret 36
$secretObject = [ordered]@{
    ADMIN_SETUP_KEY = $setupKey
    ADMIN_SESSION_SECRET = $sessionSecret
    IP_HASH_SECRET = $ipHashSecret
}
$secretJson = $secretObject | ConvertTo-Json -Compress
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path (Get-Location) ".secrets.json"), $secretJson, $utf8NoBom)
try {
    Write-Host "Uploading Worker secrets..." -ForegroundColor Cyan
    npx wrangler secret bulk .secrets.json
    if ($LASTEXITCODE -ne 0) { throw "Secret upload failed." }
} finally {
    Remove-Item ".secrets.json" -Force -ErrorAction SilentlyContinue
}

Write-Host "" 
Write-Host "DEPLOYMENT COMPLETE" -ForegroundColor Green
Write-Host "Save this one-time Admin Setup Key now:" -ForegroundColor Yellow
Write-Host $setupKey -ForegroundColor White
Write-Host "" 
Write-Host "Open:" -ForegroundColor Cyan
Write-Host "https://nexoratechnologies.elsayedmohamed963.workers.dev/api/v1/health"
Write-Host "https://nexoratechnologies.elsayedmohamed963.workers.dev/api/v1/health/db"
Write-Host "https://nexoratechnologies.elsayedmohamed963.workers.dev/admin/setup.html"
Write-Host "" 
Write-Host "Do NOT rerun first-time setup after the admin account is created unless you intentionally provision a new D1 database." -ForegroundColor DarkGray
