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

Write-Host 'NEXORA NX-DATA-2 - Client Projects Schema' -ForegroundColor Cyan
Write-Host 'Target: existing Worker nexoratechnologies / existing D1 DB -> nexora-db' -ForegroundColor DarkGray
Write-Host 'Schema-only: no Worker/Admin/Public deploy, no D1 creation/replacement, no Secret reset, and no Client Projects business rows are created.' -ForegroundColor Yellow

node .\scripts\NX_DATA_2_CHECK.mjs
if ($LASTEXITCODE -ne 0) { throw 'NX-DATA-2 engineering gate failed. Remote D1 changes are blocked.' }

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
$pending0007 = $migrationOutput -match '0007_client_projects.sql'
$noPending = $migrationOutput -match 'No migrations to apply'
if (-not $pending0007 -and -not $noPending) { throw 'Unexpected remote migration state. Only pending 0007 or no pending migrations is acceptable.' }
if ($migrationOutput -match '0008_|0009_|project_work|milestone|task|ticket|quote|invoice') { throw 'Unexpected future migration is pending. Stop before applying NX-DATA-2.' }

Write-Host 'Reading protected production counts before NX-DATA-2 (read-only)...' -ForegroundColor Cyan
$beforeRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT 'clients' AS table_name,COUNT(*) AS rows_count FROM clients UNION ALL SELECT 'client_profile_tokens',COUNT(*) FROM client_profile_tokens UNION ALL SELECT 'project_inquiries',COUNT(*) FROM project_inquiries UNION ALL SELECT 'projects',COUNT(*) FROM projects UNION ALL SELECT 'services',COUNT(*) FROM services ORDER BY table_name;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read protected production counts.' }
Write-Host $beforeRaw
$beforeData = @($beforeRaw | ConvertFrom-Json)
$beforeResults = @($beforeData[0].results)
$beforeSignature = (($beforeResults | Sort-Object table_name | ForEach-Object { "$($_.table_name)=$($_.rows_count)" }) -join ';')

if (-not $ApplyRemote) {
    Write-Host ''
    Write-Host 'PRE-FLIGHT PASS. No migration, Worker deployment, Secret change, or business-data write was performed.' -ForegroundColor Green
    if ($pending0007) { Write-Host 'Pending migration is exactly 0007_client_projects.sql.' -ForegroundColor Yellow }
    else { Write-Host '0007 is already applied; this gate is idempotent.' -ForegroundColor Yellow }
    Write-Host 'After owner review run:' -ForegroundColor Yellow
    Write-Host '.\scripts\APPLY_NX_DATA_2.ps1 -ApplyRemote' -ForegroundColor White
    exit 0
}

if ($pending0007) {
    Write-Host 'Applying 0007 to the EXISTING DB binding...' -ForegroundColor Cyan
    npx wrangler d1 migrations apply DB --remote
    if ($LASTEXITCODE -ne 0) { throw 'Remote 0007 migration apply failed.' }
} else {
    Write-Host '0007 is already applied; skipping migration apply.' -ForegroundColor DarkGray
}

Write-Host 'Verifying remote migration state after apply...' -ForegroundColor Cyan
$afterMigration = (& npx wrangler d1 migrations list DB --remote 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to verify remote migration state after apply.' }
Write-Host $afterMigration
if ($afterMigration -notmatch 'No migrations to apply') { throw 'Remote migrations remain pending after NX-DATA-2.' }

Write-Host 'Verifying Client Projects tables (read-only)...' -ForegroundColor Cyan
$tablesRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('client_projects','client_project_services','client_project_members','inquiry_project_links') ORDER BY name;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to verify Client Projects tables.' }
Write-Host $tablesRaw
$tablesData = @($tablesRaw | ConvertFrom-Json)
$tableNames = @(@($tablesData[0].results) | ForEach-Object { $_.name })
$expectedTables = @('client_project_members','client_project_services','client_projects','inquiry_project_links')
if (($tableNames -join ';') -ne ($expectedTables -join ';')) { throw "Client Projects table inventory mismatch: $($tableNames -join ', ')" }
Write-Host 'PASS Client Projects table inventory exact.' -ForegroundColor Green

Write-Host 'Verifying new tables are empty before NX-OPS-2 (read-only)...' -ForegroundColor Cyan
$newCountsRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT 'client_projects' AS table_name,COUNT(*) AS rows_count FROM client_projects UNION ALL SELECT 'client_project_services',COUNT(*) FROM client_project_services UNION ALL SELECT 'client_project_members',COUNT(*) FROM client_project_members UNION ALL SELECT 'inquiry_project_links',COUNT(*) FROM inquiry_project_links ORDER BY table_name;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read Client Projects row counts.' }
Write-Host $newCountsRaw
$newCountsData = @($newCountsRaw | ConvertFrom-Json)
$newResults = @($newCountsData[0].results)
$nonEmpty = @($newResults | Where-Object { [int]$_.rows_count -ne 0 })
if ($nonEmpty.Count -ne 0) { throw 'New Client Projects tables are not empty before NX-OPS-2.' }
Write-Host 'PASS Client Projects tables start empty.' -ForegroundColor Green

Write-Host 'Running foreign-key integrity probe (read-only)...' -ForegroundColor Cyan
$fkRaw = (& npx wrangler d1 execute DB --remote --json --command 'PRAGMA foreign_key_check;' 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to run foreign_key_check.' }
$fkData = @($fkRaw | ConvertFrom-Json)
$fkRows = @()
if ($fkData.Count -gt 0 -and $null -ne $fkData[0].PSObject.Properties['results']) {
  $fkRows = @($fkData[0].results)
}
if ($fkRows.Count -ne 0) { throw "foreign_key_check returned $($fkRows.Count) violation(s)." }
Write-Host 'PASS foreign_key_check.' -ForegroundColor Green

Write-Host 'Re-reading protected production counts after migration...' -ForegroundColor Cyan
$afterRaw = (& npx wrangler d1 execute DB --remote --json --command "SELECT 'clients' AS table_name,COUNT(*) AS rows_count FROM clients UNION ALL SELECT 'client_profile_tokens',COUNT(*) FROM client_profile_tokens UNION ALL SELECT 'project_inquiries',COUNT(*) FROM project_inquiries UNION ALL SELECT 'projects',COUNT(*) FROM projects UNION ALL SELECT 'services',COUNT(*) FROM services ORDER BY table_name;" 2>$null | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'Unable to read post-migration protected counts.' }
Write-Host $afterRaw
$afterData = @($afterRaw | ConvertFrom-Json)
$afterResults = @($afterData[0].results)
$afterSignature = (($afterResults | Sort-Object table_name | ForEach-Object { "$($_.table_name)=$($_.rows_count)" }) -join ';')
if ($beforeSignature -ne $afterSignature) { throw "Protected production counts changed. Before=$beforeSignature After=$afterSignature" }
Write-Host 'PASS protected production counts unchanged.' -ForegroundColor Green

Write-Host 'Running existing public runtime checks...' -ForegroundColor Cyan
.\scripts\RUNTIME_CHECK.ps1
if ($LASTEXITCODE -ne 0) { throw 'Existing runtime check failed after NX-DATA-2.' }

Write-Host ''
Write-Host 'NX-DATA-2 REMOTE MIGRATION COMPLETE.' -ForegroundColor Green
Write-Host 'Stop here. Do not expose Client Projects API/UI until NX-OPS-2 is explicitly opened.' -ForegroundColor Yellow
