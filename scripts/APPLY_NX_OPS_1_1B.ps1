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

Write-Host 'NEXORA NX-OPS-1.1B - Secure Client Profile Completion' -ForegroundColor Cyan
Write-Host "Target: existing Worker $ExpectedWorker / existing D1 DB -> $ExpectedDbName" -ForegroundColor DarkGray
Write-Host 'Code/assets only: no migration, no D1 creation/replacement, no Secret reset, and no profile token is generated during this script.' -ForegroundColor Yellow

node .\scripts\NX_OPS_1_1B_CHECK.mjs
if ($LASTEXITCODE -ne 0) { throw 'NX-OPS-1.1B engineering gate failed. Remote deployment is blocked.' }

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
if ($migrationOutput -notmatch 'No migrations to apply') { throw 'Remote D1 has pending migrations. NX-OPS-1.1B deployment is blocked.' }

Write-Host 'Verifying Client Code and profile-token schema invariants (read-only)...' -ForegroundColor Cyan
$proofRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='client_profile_tokens') AS token_table_count, (SELECT COUNT(*) FROM clients WHERE client_code<>('CU-' || printf('%03d',id)) OR client_code IS NULL) AS bad_client_codes;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to verify Client/Profile schema invariants.' }
$proofData = @($proofRaw | ConvertFrom-Json)
$proofRow = @($proofData[0].results)[0]
if ([int]$proofRow.token_table_count -ne 1) { throw 'client_profile_tokens is not present exactly once.' }
if ([int]$proofRow.bad_client_codes -ne 0) { throw "Client Code invariant failed for $($proofRow.bad_client_codes) row(s)." }
Write-Host 'PASS Client Code + profile-token schema invariants.' -ForegroundColor Green

Write-Host 'Reading production counts and profile-link state before deployment (read-only)...' -ForegroundColor Cyan
$beforeRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT 'clients' AS table_name,COUNT(*) AS rows_count FROM clients UNION ALL SELECT 'client_profile_tokens',COUNT(*) FROM client_profile_tokens UNION ALL SELECT 'project_inquiries',COUNT(*) FROM project_inquiries UNION ALL SELECT 'projects',COUNT(*) FROM projects UNION ALL SELECT 'services',COUNT(*) FROM services ORDER BY table_name;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read production counts.' }
Write-Host $beforeRaw
$beforeData = @($beforeRaw | ConvertFrom-Json)
$beforeResults = @($beforeData[0].results)
$beforeSignature = (($beforeResults | Sort-Object table_name | ForEach-Object { "$($_.table_name)=$($_.rows_count)" }) -join ';')

if (-not $DeployRemote) {
    Write-Host ''
    Write-Host 'PRE-FLIGHT PASS. No Worker deployment, migration, Secret change, profile token generation, or business-data write was performed.' -ForegroundColor Green
    Write-Host 'After owner review run:' -ForegroundColor Yellow
    Write-Host '.\scripts\APPLY_NX_OPS_1_1B.ps1 -DeployRemote' -ForegroundColor White
    exit 0
}

Write-Host 'Deploying NX-OPS-1.1B Worker + Admin/client-profile assets...' -ForegroundColor Cyan
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw 'Cloudflare Worker deployment failed.' }

Write-Host 'Running existing public runtime checks...' -ForegroundColor Cyan
.\scripts\RUNTIME_CHECK.ps1
if ($LASTEXITCODE -ne 0) { throw 'Existing runtime check failed after NX-OPS-1.1B deployment.' }

Write-Host 'Checking the client profile page...' -ForegroundColor Cyan
$page = Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/client-profile.html" -Method GET
if ([int]$page.StatusCode -ne 200) { throw "Client profile page returned HTTP $($page.StatusCode)." }
Write-Host 'PASS 200 /client-profile.html' -ForegroundColor Green

Write-Host 'Re-reading production counts after code-only deployment (read-only)...' -ForegroundColor Cyan
$afterRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT 'clients' AS table_name,COUNT(*) AS rows_count FROM clients UNION ALL SELECT 'client_profile_tokens',COUNT(*) FROM client_profile_tokens UNION ALL SELECT 'project_inquiries',COUNT(*) FROM project_inquiries UNION ALL SELECT 'projects',COUNT(*) FROM projects UNION ALL SELECT 'services',COUNT(*) FROM services ORDER BY table_name;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read post-deploy production counts.' }
Write-Host $afterRaw
$afterData = @($afterRaw | ConvertFrom-Json)
$afterResults = @($afterData[0].results)
$afterSignature = (($afterResults | Sort-Object table_name | ForEach-Object { "$($_.table_name)=$($_.rows_count)" }) -join ';')
if ($beforeSignature -ne $afterSignature) { throw "Production counts changed during code-only deployment. Before=$beforeSignature After=$afterSignature" }
Write-Host 'PASS production counts unchanged across code-only deployment.' -ForegroundColor Green

Write-Host 'Reading active production deployment...' -ForegroundColor Cyan
npx wrangler deployments status --name $ExpectedWorker --json
if ($LASTEXITCODE -ne 0) { throw 'Unable to read active deployment after deploy.' }

Write-Host ''
Write-Host 'NX-OPS-1.1B REMOTE DEPLOY COMPLETE.' -ForegroundColor Green
Write-Host 'Real-browser acceptance remains required: generate/copy/revoke link in Admin, complete one active client profile, then verify AR/EN + Dark/Light + Desktop/Tablet/Mobile.' -ForegroundColor Yellow
