param(
    [switch]$ApplyRemote
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "NEXORA NX-DATA-1.1 - Clients Hardening" -ForegroundColor Cyan
Write-Host "Target: existing Worker nexoratechnologies / existing D1 binding DB -> nexora-db" -ForegroundColor Cyan
Write-Host "This script never creates/replaces D1, never resets Secrets, and never deploys Worker/Admin assets." -ForegroundColor Yellow

node .\scripts\NX_DATA_1_1_CHECK.mjs
if ($LASTEXITCODE -ne 0) { throw "NX-DATA-1.1 engineering gate failed. Remote D1 changes are blocked." }

if (-not (Test-Path .\wrangler.jsonc)) { throw "wrangler.jsonc was not found." }
$config = Get-Content -Raw -Encoding UTF8 .\wrangler.jsonc | ConvertFrom-Json
$db = @($config.d1_databases | Where-Object { $_.binding -eq 'DB' })
if ($db.Count -ne 1) { throw "Expected exactly one existing D1 binding named DB. Do NOT create a replacement database." }
if ($db[0].database_name -ne 'nexora-db' -or $db[0].database_id -ne '71c3bf88-b71d-465b-9032-5251a11fde64') {
    throw "D1 identity mismatch. Expected existing nexora-db / 71c3bf88-b71d-465b-9032-5251a11fde64."
}

Write-Host "Checking Cloudflare identity..." -ForegroundColor Cyan
npx wrangler whoami
if ($LASTEXITCODE -ne 0) { throw "Cloudflare authentication check failed." }

Write-Host "Reading remote migration state..." -ForegroundColor Cyan
npx wrangler d1 migrations list DB --remote
if ($LASTEXITCODE -ne 0) { throw "Unable to read remote D1 migration state." }

Write-Host "Reading protected production counts and Client identity/code snapshot (read-only)..." -ForegroundColor Cyan
npx wrangler d1 execute DB --remote --command "SELECT 'project_inquiries' AS table_name, COUNT(*) AS rows_count FROM project_inquiries UNION ALL SELECT 'projects', COUNT(*) FROM projects UNION ALL SELECT 'services', COUNT(*) FROM services UNION ALL SELECT 'clients', COUNT(*) FROM clients;"
if ($LASTEXITCODE -ne 0) { throw "Unable to read protected production counts." }
npx wrangler d1 execute DB --remote --command "SELECT id, public_id, client_code FROM clients ORDER BY id;"
if ($LASTEXITCODE -ne 0) { throw "Unable to read Client identity/code snapshot." }
npx wrangler d1 execute DB --remote --command "SELECT COUNT(*) AS total_clients, COUNT(DISTINCT ('CU-' || printf('%03d', id - 1))) AS generated_unique FROM clients;"
if ($LASTEXITCODE -ne 0) { throw "Unable to prove generated Client Code uniqueness." }

if (-not $ApplyRemote) {
    Write-Host "PRE-FLIGHT PASS. No remote migration, Worker deployment, Secret change, or data write was performed." -ForegroundColor Green
    Write-Host "After owner review run:" -ForegroundColor Yellow
    Write-Host ".\scripts\APPLY_NX_DATA_1_1.ps1 -ApplyRemote" -ForegroundColor White
    exit 0
}

Write-Host "Applying pending migration inventory locked to 0001..0005 on the EXISTING DB binding..." -ForegroundColor Yellow
npx wrangler d1 migrations apply DB --remote
if ($LASTEXITCODE -ne 0) { throw "Remote D1 migration failed." }

Write-Host "Verifying remote migration state after apply..." -ForegroundColor Cyan
npx wrangler d1 migrations list DB --remote
if ($LASTEXITCODE -ne 0) { throw "Unable to verify remote migration state." }

Write-Host "Verifying client_profile_tokens schema + normalized Client Codes (read-only)..." -ForegroundColor Cyan
npx wrangler d1 execute DB --remote --command "SELECT name FROM sqlite_master WHERE type='table' AND name='client_profile_tokens';"
if ($LASTEXITCODE -ne 0) { throw "client_profile_tokens schema probe failed." }
npx wrangler d1 execute DB --remote --command "SELECT id, public_id, client_code, ('CU-' || printf('%03d', id - 1)) AS expected_code, CASE WHEN client_code=('CU-' || printf('%03d', id - 1)) THEN 1 ELSE 0 END AS code_ok FROM clients ORDER BY id;"
if ($LASTEXITCODE -ne 0) { throw "Client Code normalization probe failed." }

Write-Host "Re-reading protected production counts after migration..." -ForegroundColor Cyan
npx wrangler d1 execute DB --remote --command "SELECT 'project_inquiries' AS table_name, COUNT(*) AS rows_count FROM project_inquiries UNION ALL SELECT 'projects', COUNT(*) FROM projects UNION ALL SELECT 'services', COUNT(*) FROM services UNION ALL SELECT 'clients', COUNT(*) FROM clients;"
if ($LASTEXITCODE -ne 0) { throw "Unable to verify protected production counts after migration." }

if (Test-Path .\scripts\RUNTIME_CHECK.ps1) {
    Write-Host "Running existing public runtime checks..." -ForegroundColor Cyan
    .\scripts\RUNTIME_CHECK.ps1
    if ($LASTEXITCODE -ne 0) { throw "Existing runtime check failed after NX-DATA-1.1." }
}

Write-Host "NX-DATA-1.1 REMOTE MIGRATION COMPLETE." -ForegroundColor Green
Write-Host "Stop here. Do not deploy NX-OPS-1.1 runtime/API/UI until this data gate is accepted." -ForegroundColor Yellow
