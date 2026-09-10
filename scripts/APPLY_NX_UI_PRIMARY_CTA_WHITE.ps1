param(
    [switch]$DeployRemote
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$ExpectedDbName = 'nexora-db'
$ExpectedDbId = '71c3bf88-b71d-465b-9032-5251a11fde64'
$ExpectedWorker = 'nexoratechnologies'
$BaseUrl = 'https://nexoratechnologies.elsayedmohamed963.workers.dev'

Write-Host 'NEXORA UI-CTA-1 - Primary CTA White Content' -ForegroundColor Cyan
Write-Host "Target: existing Worker $ExpectedWorker / existing D1 DB -> $ExpectedDbName" -ForegroundColor DarkGray
Write-Host 'Code/assets only: no migration, no D1 creation/replacement, no Secret reset, and no business-data write.' -ForegroundColor Yellow

node .\scripts\NX_UI_PRIMARY_CTA_WHITE_CHECK.mjs
if ($LASTEXITCODE -ne 0) { throw 'Primary CTA engineering gate failed. Remote deployment is blocked.' }

if (-not (Test-Path .\wrangler.jsonc)) { throw 'wrangler.jsonc was not found.' }
$config = Get-Content -Raw -Encoding UTF8 .\wrangler.jsonc | ConvertFrom-Json
$db = @($config.d1_databases | Where-Object { $_.binding -eq 'DB' })
if ($db.Count -ne 1) { throw 'Expected exactly one existing D1 binding named DB.' }
if ($db[0].database_name -ne $ExpectedDbName -or $db[0].database_id -ne $ExpectedDbId) { throw "D1 identity mismatch. Expected $ExpectedDbName / $ExpectedDbId." }
if ($config.name -ne $ExpectedWorker) { throw "Worker identity mismatch. Expected $ExpectedWorker." }
Write-Host "PASS canonical local target: $ExpectedWorker / DB -> $ExpectedDbName / $ExpectedDbId" -ForegroundColor Green

Write-Host 'Checking Cloudflare identity...' -ForegroundColor Cyan
npx wrangler whoami
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare authentication check failed.' }

Write-Host 'Verifying accepted remote migration chain through 0006 has no pending migration...' -ForegroundColor Cyan
$migrationOutput = (& npx wrangler d1 migrations list DB --remote 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read remote migration state.' }
Write-Host $migrationOutput
if ($migrationOutput -notmatch 'No migrations to apply') { throw 'Remote D1 has pending migrations. CTA-only deployment is blocked.' }

Write-Host 'Reading protected production counts before deployment (read-only)...' -ForegroundColor Cyan
$beforeRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT 'clients' AS table_name,COUNT(*) AS rows_count FROM clients UNION ALL SELECT 'client_profile_tokens',COUNT(*) FROM client_profile_tokens UNION ALL SELECT 'project_inquiries',COUNT(*) FROM project_inquiries UNION ALL SELECT 'projects',COUNT(*) FROM projects UNION ALL SELECT 'services',COUNT(*) FROM services ORDER BY table_name;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read production counts.' }
Write-Host $beforeRaw
$beforeData = @($beforeRaw | ConvertFrom-Json)
$beforeResults = @($beforeData[0].results)
$beforeSignature = (($beforeResults | Sort-Object table_name | ForEach-Object { "$($_.table_name)=$($_.rows_count)" }) -join ';')

if (-not $DeployRemote) {
    Write-Host ''
    Write-Host 'PRE-FLIGHT PASS. No Worker deployment, migration, Secret change, or business-data write was performed.' -ForegroundColor Green
    Write-Host 'After owner review run:' -ForegroundColor Yellow
    Write-Host '.\scripts\APPLY_NX_UI_PRIMARY_CTA_WHITE.ps1 -DeployRemote' -ForegroundColor White
    exit 0
}

Write-Host 'Deploying primary CTA visual update...' -ForegroundColor Cyan
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare Worker deployment failed.' }

Write-Host 'Running existing public runtime checks...' -ForegroundColor Cyan
.\scripts\RUNTIME_CHECK.ps1
if ($LASTEXITCODE -ne 0) { throw 'Existing runtime check failed after CTA deployment.' }

Write-Host 'Verifying live CTA CSS...' -ForegroundColor Cyan
$ds = (Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/css/design-system.css" -Method GET).Content
$cp = (Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/css/client-profile.css" -Method GET).Content
if ($ds -notmatch '\.btn--primary\{color:#fff;') { throw 'Live public primary CTA CSS does not contain white text.' }
if ($cp -notmatch '\.primary-btn\{[^}]*color:#fff;') { throw 'Live client-profile primary CTA CSS does not contain white text.' }
Write-Host 'PASS live primary CTA text/icon color = white.' -ForegroundColor Green

Write-Host 'Re-reading production counts after code-only deployment (read-only)...' -ForegroundColor Cyan
$afterRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT 'clients' AS table_name,COUNT(*) AS rows_count FROM clients UNION ALL SELECT 'client_profile_tokens',COUNT(*) FROM client_profile_tokens UNION ALL SELECT 'project_inquiries',COUNT(*) FROM project_inquiries UNION ALL SELECT 'projects',COUNT(*) FROM projects UNION ALL SELECT 'services',COUNT(*) FROM services ORDER BY table_name;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read post-deploy production counts.' }
Write-Host $afterRaw
$afterData = @($afterRaw | ConvertFrom-Json)
$afterResults = @($afterData[0].results)
$afterSignature = (($afterResults | Sort-Object table_name | ForEach-Object { "$($_.table_name)=$($_.rows_count)" }) -join ';')
if ($beforeSignature -ne $afterSignature) { throw "Production counts changed during code-only deployment. Before=$beforeSignature After=$afterSignature" }
Write-Host 'PASS production counts unchanged across CTA-only deployment.' -ForegroundColor Green

Write-Host 'Reading active production deployment...' -ForegroundColor Cyan
npx wrangler deployments status --name $ExpectedWorker --json
if ($LASTEXITCODE -ne 0) { throw 'Unable to read active deployment after deploy.' }

Write-Host ''
Write-Host 'NEXORA UI-CTA-1 REMOTE DEPLOY COMPLETE.' -ForegroundColor Green
Write-Host 'Real-browser visual acceptance: verify primary buttons in Dark/Light and AR/EN.' -ForegroundColor Yellow
