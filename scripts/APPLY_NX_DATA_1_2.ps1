param(
    [switch]$ApplyRemote
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$ExpectedDbName = 'nexora-db'
$ExpectedDbId = '71c3bf88-b71d-465b-9032-5251a11fde64'
$ExpectedWorker = 'nexoratechnologies'

Write-Host 'NEXORA NX-DATA-1.2 - Client Code Alignment' -ForegroundColor Cyan
Write-Host 'Owner rule: id=1 -> CU-001, id=999 -> CU-999, id=1000 -> CU-1000.' -ForegroundColor DarkGray
Write-Host 'Forward-only: 0005 stays immutable; this script never creates/replaces D1, resets Secrets, or deploys Worker/Admin assets.' -ForegroundColor Yellow

node .\scripts\NX_DATA_1_2_CHECK.mjs
if ($LASTEXITCODE -ne 0) { throw 'NX-DATA-1.2 engineering gate failed. Remote D1 changes are blocked.' }

node .\scripts\NX_OPS_1_1A_CHECK.mjs
if ($LASTEXITCODE -ne 0) { throw 'Corrected NX-OPS-1.1A runtime gate failed. Remote D1 changes are blocked until data/runtime remain aligned.' }

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

Write-Host 'Reading remote migration state...' -ForegroundColor Cyan
$migrationOutput = (& npx wrangler d1 migrations list DB --remote 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read remote migration state.' }
Write-Host $migrationOutput
$pending0006 = $migrationOutput -match '0006_clients_code_alignment.sql'
$noPending = $migrationOutput -match 'No migrations to apply'
if (-not $pending0006 -and -not $noPending) { throw 'Unexpected remote migration state. Only pending 0006 or no pending migrations is acceptable.' }
if ($pending0006 -and $migrationOutput -match '0007_|client_projects') { throw 'Unexpected future migration is pending. Stop before Client Projects.' }

Write-Host 'Reading protected counts + Client identity/code snapshot (read-only)...' -ForegroundColor Cyan
$beforeCountsRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT 'project_inquiries' AS table_name, COUNT(*) AS rows_count FROM project_inquiries UNION ALL SELECT 'projects', COUNT(*) FROM projects UNION ALL SELECT 'services', COUNT(*) FROM services UNION ALL SELECT 'clients', COUNT(*) FROM clients ORDER BY table_name;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read protected production counts.' }
Write-Host $beforeCountsRaw
$beforeClientsRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT id,public_id,client_code,('CU-' || printf('%03d',id)) AS expected_code,CASE WHEN client_code=('CU-' || printf('%03d',id)) THEN 1 ELSE 0 END AS code_ok FROM clients ORDER BY id;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read Client Code snapshot.' }
Write-Host $beforeClientsRaw

$beforeCountsData = @($beforeCountsRaw | ConvertFrom-Json)
$beforeResults = @($beforeCountsData[0].results)
$beforeSignature = (($beforeResults | Sort-Object table_name | ForEach-Object { "$($_.table_name)=$($_.rows_count)" }) -join ';')

if (-not $ApplyRemote) {
    Write-Host ''
    Write-Host 'PRE-FLIGHT PASS. No migration, Worker deployment, Secret change, or business-data write was performed.' -ForegroundColor Green
    if ($pending0006) { Write-Host 'Pending migration is exactly 0006_clients_code_alignment.sql.' -ForegroundColor Yellow }
    else { Write-Host '0006 is already applied; this script is idempotent at the gate level.' -ForegroundColor Yellow }
    Write-Host 'After owner review run:' -ForegroundColor Yellow
    Write-Host '.\scripts\APPLY_NX_DATA_1_2.ps1 -ApplyRemote' -ForegroundColor White
    exit 0
}

if ($pending0006) {
    Write-Host 'Applying pending migration inventory locked through 0006 on the EXISTING DB binding...' -ForegroundColor Cyan
    npx wrangler d1 migrations apply DB --remote
    if ($LASTEXITCODE -ne 0) { throw 'Remote 0006 migration apply failed.' }
} else {
    Write-Host '0006 is already applied; skipping migration apply.' -ForegroundColor DarkGray
}

Write-Host 'Verifying remote migration state after apply...' -ForegroundColor Cyan
$afterMigration = (& npx wrangler d1 migrations list DB --remote 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to verify remote migration state after apply.' }
Write-Host $afterMigration
if ($afterMigration -notmatch 'No migrations to apply') { throw 'Remote migrations remain pending after NX-DATA-1.2.' }

Write-Host 'Verifying corrected Client Code invariant (read-only)...' -ForegroundColor Cyan
$verifyRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT COUNT(*) AS total_clients,SUM(CASE WHEN client_code=('CU-' || printf('%03d',id)) THEN 0 ELSE 1 END) AS bad_codes FROM clients;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to verify corrected Client Codes.' }
$verifyData = @($verifyRaw | ConvertFrom-Json)
$verifyRow = @($verifyData[0].results)[0]
$badCodes = if ($null -eq $verifyRow.bad_codes) { 0 } else { [int]$verifyRow.bad_codes }
if ($badCodes -ne 0) { throw "Corrected Client Code invariant failed for $badCodes row(s)." }
Write-Host "PASS CU-{id} invariant for $($verifyRow.total_clients) client(s)." -ForegroundColor Green

$clientSnapshot = (& npx wrangler d1 execute DB --remote --json --command "SELECT id,public_id,client_code,('CU-' || printf('%03d',id)) AS expected_code,CASE WHEN client_code=('CU-' || printf('%03d',id)) THEN 1 ELSE 0 END AS code_ok FROM clients ORDER BY id;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read post-migration Client snapshot.' }
Write-Host $clientSnapshot

Write-Host 'Re-reading protected production counts after migration...' -ForegroundColor Cyan
$afterCountsRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT 'project_inquiries' AS table_name, COUNT(*) AS rows_count FROM project_inquiries UNION ALL SELECT 'projects', COUNT(*) FROM projects UNION ALL SELECT 'services', COUNT(*) FROM services UNION ALL SELECT 'clients', COUNT(*) FROM clients ORDER BY table_name;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read post-migration protected counts.' }
Write-Host $afterCountsRaw
$afterCountsData = @($afterCountsRaw | ConvertFrom-Json)
$afterResults = @($afterCountsData[0].results)
$afterSignature = (($afterResults | Sort-Object table_name | ForEach-Object { "$($_.table_name)=$($_.rows_count)" }) -join ';')
if ($beforeSignature -ne $afterSignature) { throw "Protected production counts changed. Before=$beforeSignature After=$afterSignature" }
Write-Host 'PASS protected production counts unchanged.' -ForegroundColor Green

Write-Host 'Running existing public runtime checks...' -ForegroundColor Cyan
.\scripts\RUNTIME_CHECK.ps1
if ($LASTEXITCODE -ne 0) { throw 'Existing runtime check failed after NX-DATA-1.2.' }

Write-Host ''
Write-Host 'NX-DATA-1.2 REMOTE MIGRATION COMPLETE.' -ForegroundColor Green
Write-Host 'Next gate: deploy corrected NX-OPS-1.1A runtime. Do not start Client Projects.' -ForegroundColor Yellow
