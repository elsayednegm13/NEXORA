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

Write-Host "NEXORA NX-OPS-1 LIVE RECONCILIATION" -ForegroundColor Cyan
Write-Host "Target: existing Worker $ExpectedWorker / existing D1 DB -> $ExpectedDbName" -ForegroundColor DarkGray
Write-Host "This script never creates D1, never deletes data, and never writes/resets Worker Secrets." -ForegroundColor Yellow

node .\scripts\NX_OPS_1_LIVE_CHECK.mjs
if ($LASTEXITCODE -ne 0) { throw 'NX-OPS-1 live engineering gate failed. Remote actions are blocked.' }

Write-Host 'Checking Cloudflare identity...' -ForegroundColor Cyan
npx wrangler whoami
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare authentication check failed.' }

Write-Host 'Verifying the existing D1 identity from the account inventory...' -ForegroundColor Cyan
$d1Raw = (& npx wrangler d1 list --json 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to list D1 databases.' }
$d1List = $d1Raw | ConvertFrom-Json
$target = @($d1List | Where-Object { $_.uuid -eq $ExpectedDbId -and $_.name -eq $ExpectedDbName })
if ($target.Count -ne 1) { throw "Verified D1 identity not found exactly once: $ExpectedDbName / $ExpectedDbId" }
Write-Host "PASS existing D1 identity: $ExpectedDbName / $ExpectedDbId" -ForegroundColor Green

Write-Host 'Reading remote migration state (read-only)...' -ForegroundColor Cyan
npx wrangler d1 migrations list DB --remote
if ($LASTEXITCODE -ne 0) { throw 'Unable to read remote D1 migration state through DB binding.' }

Write-Host 'Reading protected production row counts before migration (read-only)...' -ForegroundColor Cyan
$beforeRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT 'services' AS table_name, COUNT(*) AS rows_count FROM services UNION ALL SELECT 'projects', COUNT(*) FROM projects UNION ALL SELECT 'project_inquiries', COUNT(*) FROM project_inquiries ORDER BY table_name;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read pre-migration production row counts.' }
Write-Host $beforeRaw

if (-not $DeployRemote) {
    Write-Host ''
    Write-Host 'PRE-FLIGHT PASS. No remote migration or Worker deployment was performed.' -ForegroundColor Green
    Write-Host 'After reviewing the migration state above, run:' -ForegroundColor Yellow
    Write-Host '.\scripts\APPLY_NX_OPS_1_LIVE.ps1 -DeployRemote' -ForegroundColor White
    exit 0
}

Write-Host 'Applying pending migrations to the EXISTING DB binding (inventory is locked to 0001..0004)...' -ForegroundColor Yellow
npx wrangler d1 migrations apply DB --remote
if ($LASTEXITCODE -ne 0) { throw 'Remote D1 migration apply failed. Worker deployment is blocked.' }

Write-Host 'Verifying remote migration state after apply...' -ForegroundColor Cyan
npx wrangler d1 migrations list DB --remote
if ($LASTEXITCODE -ne 0) { throw 'Unable to verify remote migration state after apply.' }

Write-Host 'Verifying Clients schema and FK integrity (read-only)...' -ForegroundColor Cyan
npx wrangler d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('clients','client_contacts','inquiry_conversions') ORDER BY name;"
if ($LASTEXITCODE -ne 0) { throw 'Remote Clients schema probe failed.' }
npx wrangler d1 execute DB --remote --command "PRAGMA foreign_key_check;"
if ($LASTEXITCODE -ne 0) { throw 'Remote foreign_key_check failed.' }

Write-Host 'Reading protected production row counts after migration (read-only)...' -ForegroundColor Cyan
$afterRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT 'services' AS table_name, COUNT(*) AS rows_count FROM services UNION ALL SELECT 'projects', COUNT(*) FROM projects UNION ALL SELECT 'project_inquiries', COUNT(*) FROM project_inquiries ORDER BY table_name;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read post-migration production row counts.' }
Write-Host $afterRaw

Write-Host 'Deploying NX-OPS-1 Worker + static/Admin assets using the canonical live config...' -ForegroundColor Cyan
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare Worker deployment failed.' }

Write-Host 'Running existing public runtime checks...' -ForegroundColor Cyan
.\scripts\RUNTIME_CHECK.ps1
if ($LASTEXITCODE -ne 0) { throw 'Existing runtime check failed after deployment.' }

Write-Host 'Reading active production deployment after deploy...' -ForegroundColor Cyan
npx wrangler deployments status --name $ExpectedWorker --json
if ($LASTEXITCODE -ne 0) { throw 'Unable to read active deployment after deploy.' }

Write-Host ''
Write-Host 'NX-OPS-1 LIVE APPLY/DEPLOY COMPLETE.' -ForegroundColor Green
Write-Host 'Real-browser acceptance is still required before NX-DATA-2 is unblocked.' -ForegroundColor Yellow
