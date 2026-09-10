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

Write-Host "NEXORA NX-OPS-1.1A - Clients Runtime/UX Hardening" -ForegroundColor Cyan
Write-Host "Target: existing Worker $ExpectedWorker / existing D1 DB -> $ExpectedDbName" -ForegroundColor DarkGray
Write-Host "This phase deploys runtime/Admin assets only. It never creates D1, applies migrations, resets Secrets, or intentionally writes business data during preflight/deploy." -ForegroundColor Yellow

node .\scripts\NX_OPS_1_1A_CHECK.mjs
if ($LASTEXITCODE -ne 0) { throw 'NX-OPS-1.1A engineering gate failed. Remote deployment is blocked.' }

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

Write-Host 'Verifying existing D1 identity from account inventory...' -ForegroundColor Cyan
$d1Raw = (& npx wrangler d1 list --json 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to list D1 databases.' }
$d1List = @($d1Raw | ConvertFrom-Json)
$target = @($d1List | Where-Object { $_.uuid -eq $ExpectedDbId -and $_.name -eq $ExpectedDbName })
if ($target.Count -ne 1) { throw "Verified D1 identity not found exactly once: $ExpectedDbName / $ExpectedDbId" }
Write-Host "PASS existing D1 identity: $ExpectedDbName / $ExpectedDbId" -ForegroundColor Green

Write-Host 'Verifying accepted remote migration chain through 0006 has no pending migration...' -ForegroundColor Cyan
$migrationOutput = (& npx wrangler d1 migrations list DB --remote 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read remote migration state.' }
Write-Host $migrationOutput
if ($migrationOutput -notmatch 'No migrations to apply') { throw 'Remote D1 has pending migrations. NX-OPS-1.1A deploy is blocked; do not apply any migration from this script.' }

Write-Host 'Verifying NX-DATA-1.2 schema and deterministic Client Codes (read-only)...' -ForegroundColor Cyan
$schemaRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT COUNT(*) AS token_table_count FROM sqlite_master WHERE type='table' AND name='client_profile_tokens';" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to verify client_profile_tokens.' }
$schemaData = @($schemaRaw | ConvertFrom-Json)
$schemaRow = @($schemaData[0].results)[0]
if ([int]$schemaRow.token_table_count -ne 1) { throw 'client_profile_tokens is not present exactly once.' }

$codeRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT COUNT(*) AS total_clients, SUM(CASE WHEN client_code=('CU-' || printf('%03d', id)) THEN 0 ELSE 1 END) AS bad_codes FROM clients;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to verify Client Code normalization.' }
$codeData = @($codeRaw | ConvertFrom-Json)
$codeRow = @($codeData[0].results)[0]
$badCodes = if ($null -eq $codeRow.bad_codes) { 0 } else { [int]$codeRow.bad_codes }
if ($badCodes -ne 0) { throw "Client Code invariant failed for $badCodes row(s)." }
Write-Host "PASS Client Codes normalized for $($codeRow.total_clients) existing client(s)." -ForegroundColor Green

Write-Host 'Reading protected production counts before deployment (read-only)...' -ForegroundColor Cyan
$beforeRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT 'project_inquiries' AS table_name, COUNT(*) AS rows_count FROM project_inquiries UNION ALL SELECT 'projects', COUNT(*) FROM projects UNION ALL SELECT 'services', COUNT(*) FROM services UNION ALL SELECT 'clients', COUNT(*) FROM clients ORDER BY table_name;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read protected production counts.' }
Write-Host $beforeRaw
$beforeData = @($beforeRaw | ConvertFrom-Json)
$beforeResults = @($beforeData[0].results)
$beforeSignature = (($beforeResults | Sort-Object table_name | ForEach-Object { "$($_.table_name)=$($_.rows_count)" }) -join ';')

if (-not $DeployRemote) {
    Write-Host ''
    Write-Host 'PRE-FLIGHT PASS. No Worker deployment, migration, Secret change, or business-data write was performed.' -ForegroundColor Green
    Write-Host 'After owner review run:' -ForegroundColor Yellow
    Write-Host '.\scripts\APPLY_NX_OPS_1_1A.ps1 -DeployRemote' -ForegroundColor White
    exit 0
}

Write-Host 'Deploying NX-OPS-1.1A Worker + Admin assets only...' -ForegroundColor Cyan
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare Worker deployment failed.' }

Write-Host 'Running existing public runtime checks...' -ForegroundColor Cyan
.\scripts\RUNTIME_CHECK.ps1
if ($LASTEXITCODE -ne 0) { throw 'Existing runtime check failed after NX-OPS-1.1A deployment.' }

Write-Host 'Re-reading protected production counts after deployment (read-only)...' -ForegroundColor Cyan
$afterRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT 'project_inquiries' AS table_name, COUNT(*) AS rows_count FROM project_inquiries UNION ALL SELECT 'projects', COUNT(*) FROM projects UNION ALL SELECT 'services', COUNT(*) FROM services UNION ALL SELECT 'clients', COUNT(*) FROM clients ORDER BY table_name;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read post-deploy production counts.' }
Write-Host $afterRaw
$afterData = @($afterRaw | ConvertFrom-Json)
$afterResults = @($afterData[0].results)
$afterSignature = (($afterResults | Sort-Object table_name | ForEach-Object { "$($_.table_name)=$($_.rows_count)" }) -join ';')
if ($beforeSignature -ne $afterSignature) { throw "Protected production counts changed during code-only deployment. Before=$beforeSignature After=$afterSignature" }
Write-Host 'PASS protected production counts unchanged across code-only deployment.' -ForegroundColor Green

Write-Host 'Reading active production deployment...' -ForegroundColor Cyan
npx wrangler deployments status --name $ExpectedWorker --json
if ($LASTEXITCODE -ne 0) { throw 'Unable to read active deployment after deploy.' }

Write-Host ''
Write-Host 'NX-OPS-1.1A REMOTE DEPLOY COMPLETE.' -ForegroundColor Green
Write-Host 'Real-browser acceptance is required before NX-OPS-1.1B Secure Client Profile Completion.' -ForegroundColor Yellow
