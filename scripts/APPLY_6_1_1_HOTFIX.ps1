$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function New-RandomSecret([int]$Bytes = 48) {
    $buffer = New-Object byte[] $Bytes
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($buffer) } finally { $rng.Dispose() }
    return ([Convert]::ToBase64String($buffer)).TrimEnd('=').Replace('+','-').Replace('/','_')
}

Write-Host "=== NEXORA Phase 6.1.1 Admin Auth Hotfix ===" -ForegroundColor Cyan
Write-Host "Checking whether first admin was partially created..." -ForegroundColor Cyan
$result = npx wrangler d1 execute DB --remote --command "SELECT COUNT(*) AS count FROM admin_users;" --json | ConvertFrom-Json
$count = 0
try {
    $count = [int]$result[0].results[0].count
} catch {
    Write-Host "Could not parse admin count automatically. Raw result:" -ForegroundColor Yellow
    $result | ConvertTo-Json -Depth 10
    throw "Stop here and inspect admin_users before continuing."
}

Write-Host ("admin_users count: {0}" -f $count) -ForegroundColor $(if ($count -eq 0) { 'Green' } else { 'Yellow' })
if ($count -gt 0) {
    Write-Host "An admin row already exists. This hotfix will NOT delete it automatically." -ForegroundColor Yellow
    Write-Host "Run: npx wrangler d1 execute DB --remote --command `"SELECT id,name,email,password_hash,created_at FROM admin_users;`"" -ForegroundColor Yellow
    throw "Admin row exists; inspect it before any reset."
}

$pepper = New-RandomSecret 48
Write-Host "Uploading ADMIN_PASSWORD_PEPPER Worker Secret..." -ForegroundColor Cyan
$pepper | npx wrangler secret put ADMIN_PASSWORD_PEPPER
if ($LASTEXITCODE -ne 0) { throw "Failed to upload ADMIN_PASSWORD_PEPPER." }

Write-Host "Deploying hotfix..." -ForegroundColor Cyan
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw "Hotfix deployment failed." }

Write-Host "Running runtime checks..." -ForegroundColor Cyan
& "$PSScriptRoot\RUNTIME_CHECK.ps1"
if ($LASTEXITCODE -ne 0) { throw "Runtime check failed." }

Write-Host "Hotfix deployed. Reload /admin/setup.html and create the first admin." -ForegroundColor Green
