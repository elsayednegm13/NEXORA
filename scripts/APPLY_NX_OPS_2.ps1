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
$ExpectedWranglerVersion = '4.129.1'
$ExpectedNodeVersion = 'v22.23.2'

# NX-OPS-2 R4 intentionally does NOT use the machine-wide Node runtime.
# The release runner supplies a verified portable Node 22 LTS runtime.
$NodeExe = $env:NEXORA_NODE_EXE
if ([string]::IsNullOrWhiteSpace($NodeExe) -or -not (Test-Path -LiteralPath $NodeExe)) {
    throw 'Verified Node runtime is missing. Run .\scripts\RUN_NX_OPS_2_RELEASE.ps1 instead of APPLY_NX_OPS_2.ps1 directly.'
}
$nodeVersion = (& $NodeExe --version 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne $ExpectedNodeVersion) {
    throw "Unexpected Node runtime. Required: $ExpectedNodeVersion. Detected: $nodeVersion"
}
Write-Host "PASS pinned Node runtime: $ExpectedNodeVersion" -ForegroundColor Green

$WranglerJs = $env:NEXORA_WRANGLER_JS
if ([string]::IsNullOrWhiteSpace($WranglerJs) -or -not (Test-Path -LiteralPath $WranglerJs)) {
    throw 'Verified Wrangler runtime is missing. Run .\scripts\RUN_NX_OPS_2_RELEASE.ps1 instead of APPLY_NX_OPS_2.ps1 directly.'
}
$wranglerVersion = (& $NodeExe $WranglerJs --version 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $wranglerVersion -notmatch [regex]::Escape($ExpectedWranglerVersion)) {
    throw "Unexpected Wrangler runtime. Required version: $ExpectedWranglerVersion. Detected: $wranglerVersion"
}
Write-Host "PASS pinned Wrangler runtime: $ExpectedWranglerVersion" -ForegroundColor Green

function Invoke-Wrangler {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    & $NodeExe $WranglerJs @Arguments
    $script:WranglerExitCode = $LASTEXITCODE
}

Write-Host 'NEXORA NX-OPS-2 - Client Project Workspace' -ForegroundColor Cyan
Write-Host "Target: existing Worker $ExpectedWorker / existing D1 DB -> $ExpectedDbName" -ForegroundColor DarkGray
Write-Host 'Code/assets only: 0007 is already Live; this script never applies a migration, creates/replaces D1, resets Secrets, or seeds Client Project business rows.' -ForegroundColor Yellow

& $NodeExe .\scripts\NX_OPS_2_CHECK.mjs
if ($LASTEXITCODE -ne 0) { throw 'NX-OPS-2 engineering gate failed. Remote deployment is blocked.' }

if (-not (Test-Path .\wrangler.jsonc)) { throw 'wrangler.jsonc was not found.' }
$config = Get-Content -Raw -Encoding UTF8 .\wrangler.jsonc | ConvertFrom-Json
$db = @($config.d1_databases | Where-Object { $_.binding -eq 'DB' })
if ($db.Count -ne 1) { throw 'Expected exactly one existing D1 binding named DB.' }
if ($db[0].database_name -ne $ExpectedDbName -or $db[0].database_id -ne $ExpectedDbId) { throw "D1 identity mismatch. Expected $ExpectedDbName / $ExpectedDbId." }
if ($config.name -ne $ExpectedWorker) { throw "Worker identity mismatch. Expected $ExpectedWorker." }
Write-Host "PASS canonical local target: $ExpectedWorker / DB -> $ExpectedDbName / $ExpectedDbId" -ForegroundColor Green

Write-Host 'Checking Cloudflare identity...' -ForegroundColor Cyan
Invoke-Wrangler whoami
if ($WranglerExitCode -ne 0) { throw 'Cloudflare authentication check failed.' }

Write-Host 'Verifying existing D1 identity from account inventory...' -ForegroundColor Cyan
$d1Raw = (Invoke-Wrangler d1 list --json 2>$null | Out-String)
if ($WranglerExitCode -ne 0) { throw 'Unable to list D1 databases.' }
$d1List = @($d1Raw | ConvertFrom-Json)
$target = @($d1List | Where-Object { $_.uuid -eq $ExpectedDbId -and $_.name -eq $ExpectedDbName })
if ($target.Count -ne 1) { throw "Verified D1 identity not found exactly once: $ExpectedDbName / $ExpectedDbId" }
Write-Host "PASS existing D1 identity: $ExpectedDbName / $ExpectedDbId" -ForegroundColor Green

Write-Host 'Verifying accepted remote migration chain through 0007 has no pending migration...' -ForegroundColor Cyan
$migrationOutput = (Invoke-Wrangler d1 migrations list DB --remote 2>&1 | Out-String)
if ($WranglerExitCode -ne 0) { throw 'Unable to read remote migration state.' }
Write-Host $migrationOutput
if ($migrationOutput -notmatch 'No migrations to apply') { throw 'Remote D1 has pending migrations. NX-OPS-2 deployment is blocked.' }

function Invoke-D1JsonGuard {
    param(
        [Parameter(Mandatory=$true)][ValidateSet('count','fk-empty')][string]$Mode,
        [Parameter(Mandatory=$true)][AllowEmptyString()][string]$RawJson,
        [Parameter(Mandatory=$true)][string]$Context
    )

    $guardScript = Join-Path $PSScriptRoot 'D1_JSON_GUARD.mjs'
    if (-not (Test-Path -LiteralPath $guardScript)) { throw 'D1 JSON guard script is missing.' }
    $tmp = Join-Path $env:TEMP ("NEXORA_D1_JSON_" + [guid]::NewGuid().ToString('N') + '.json')
    try {
        [System.IO.File]::WriteAllText($tmp, $RawJson, (New-Object System.Text.UTF8Encoding($false)))
        $guardOut = (& $NodeExe $guardScript $Mode $tmp 2>&1 | Out-String).Trim()
        $guardExit = $LASTEXITCODE
        if ($guardExit -ne 0) {
            Write-Host "D1 JSON guard failed for $Context" -ForegroundColor Red
            if (-not [string]::IsNullOrWhiteSpace($guardOut)) { Write-Host $guardOut }
            if (-not [string]::IsNullOrWhiteSpace($RawJson)) { Write-Host $RawJson }
            throw "Unable to validate D1 JSON for $Context"
        }
        return $guardOut
    } finally {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
}

Write-Host 'Running foreign-key integrity probe (read-only)...' -ForegroundColor Cyan
$fkRaw = (Invoke-Wrangler d1 execute DB --remote --json --command "PRAGMA foreign_key_check;" 2>&1 | Out-String)
if ($WranglerExitCode -ne 0) {
    if (-not [string]::IsNullOrWhiteSpace($fkRaw)) { Write-Host $fkRaw }
    throw 'Unable to run foreign_key_check.'
}
$fkViolationCount = [int](Invoke-D1JsonGuard -Mode 'fk-empty' -RawJson $fkRaw -Context 'pre-deploy foreign_key_check')
if ($fkViolationCount -ne 0) { throw "foreign_key_check returned $fkViolationCount violation(s)." }
Write-Host 'PASS foreign_key_check returned no violations.' -ForegroundColor Green

# R4 deliberately avoids a wide UNION ALL count query. D1 rejected the nine-term
# compound SELECT in production even though every individual read succeeded.
# Keep the table list explicit and query one table at a time so the release gate
# does not depend on an environment-specific compound-SELECT limit.
$CountTables = @(
    'clients',
    'client_profile_tokens',
    'project_inquiries',
    'projects',
    'services',
    'client_projects',
    'client_project_services',
    'client_project_members',
    'inquiry_project_links'
)

function Get-RemoteCountSnapshot {
    param([Parameter(Mandatory=$true)][string]$Phase)

    $rows = @()
    foreach ($table in $CountTables) {
        $sql = "SELECT COUNT(*) AS rows_count FROM $table;"
        $raw = (Invoke-Wrangler d1 execute DB --remote --json --command $sql 2>&1 | Out-String)
        if ($WranglerExitCode -ne 0) {
            if (-not [string]::IsNullOrWhiteSpace($raw)) { Write-Host $raw }
            throw "Unable to read $Phase count for table: $table"
        }

        $countText = Invoke-D1JsonGuard -Mode 'count' -RawJson $raw -Context "$Phase count for table: $table"
        $parsedCount = 0L
        if (-not [int64]::TryParse($countText, [ref]$parsedCount)) {
            Write-Host $raw
            throw "D1 count guard returned a non-integer value while reading $Phase table: $table"
        }

        $rows += [pscustomobject]@{
            table_name = $table
            rows_count = $parsedCount
        }
    }

    Write-Host ($rows | Sort-Object table_name | ConvertTo-Json -Depth 3)
    return $rows
}

Write-Host 'Reading protected production + Client Project counts before deployment (read-only, per-table)...' -ForegroundColor Cyan
$beforeResults = @(Get-RemoteCountSnapshot -Phase 'pre-deploy')
$beforeSignature = (($beforeResults | Sort-Object table_name | ForEach-Object { "$($_.table_name)=$($_.rows_count)" }) -join ';')

Write-Host 'Running current live runtime smoke before deployment...' -ForegroundColor Cyan
.\scripts\RUNTIME_CHECK.ps1
if ($LASTEXITCODE -ne 0) { throw 'Current live runtime check failed before NX-OPS-2 deployment.' }

if (-not $DeployRemote) {
    Write-Host ''
    Write-Host 'PRE-FLIGHT PASS. No Worker deployment, migration, Secret change, or business-data write was performed.' -ForegroundColor Green
    Write-Host '0007 remains the latest accepted Live migration and no pending migration exists.' -ForegroundColor Green
    Write-Host 'After owner review run:' -ForegroundColor Yellow
    Write-Host '.\scripts\RUN_NX_OPS_2_RELEASE.ps1 -DeployRemote' -ForegroundColor White
    exit 0
}

Write-Host 'Deploying NX-OPS-2 Worker + Admin assets...' -ForegroundColor Cyan
Invoke-Wrangler deploy
if ($WranglerExitCode -ne 0) { throw 'Cloudflare Worker deployment failed.' }

Write-Host 'Running public runtime checks after deployment...' -ForegroundColor Cyan
.\scripts\RUNTIME_CHECK.ps1
if ($LASTEXITCODE -ne 0) { throw 'Runtime check failed after NX-OPS-2 deployment.' }

Write-Host 'Verifying migration state remains unchanged after code deployment...' -ForegroundColor Cyan
$afterMigrationOutput = (Invoke-Wrangler d1 migrations list DB --remote 2>&1 | Out-String)
if ($WranglerExitCode -ne 0) { throw 'Unable to read post-deploy migration state.' }
Write-Host $afterMigrationOutput
if ($afterMigrationOutput -notmatch 'No migrations to apply') { throw 'Unexpected pending migration appeared after NX-OPS-2 deployment.' }

Write-Host 'Re-reading protected production + Client Project counts after code-only deployment (read-only, per-table)...' -ForegroundColor Cyan
$afterResults = @(Get-RemoteCountSnapshot -Phase 'post-deploy')
$afterSignature = (($afterResults | Sort-Object table_name | ForEach-Object { "$($_.table_name)=$($_.rows_count)" }) -join ';')
if ($beforeSignature -ne $afterSignature) { throw "Production counts changed during code-only deployment. Before=$beforeSignature After=$afterSignature" }
Write-Host 'PASS production and Client Project counts unchanged across code-only deployment.' -ForegroundColor Green

Write-Host 'Running post-deploy foreign-key integrity probe (read-only)...' -ForegroundColor Cyan
$fkAfterRaw = (Invoke-Wrangler d1 execute DB --remote --json --command "PRAGMA foreign_key_check;" 2>&1 | Out-String)
if ($WranglerExitCode -ne 0) {
    if (-not [string]::IsNullOrWhiteSpace($fkAfterRaw)) { Write-Host $fkAfterRaw }
    throw 'Unable to run post-deploy foreign_key_check.'
}
$fkAfterViolationCount = [int](Invoke-D1JsonGuard -Mode 'fk-empty' -RawJson $fkAfterRaw -Context 'post-deploy foreign_key_check')
if ($fkAfterViolationCount -ne 0) { throw "Post-deploy foreign_key_check returned $fkAfterViolationCount violation(s)." }
Write-Host 'PASS post-deploy foreign_key_check returned no violations.' -ForegroundColor Green

Write-Host 'Reading active production deployment...' -ForegroundColor Cyan
Invoke-Wrangler deployments status --name $ExpectedWorker --json
if ($WranglerExitCode -ne 0) { throw 'Unable to read active deployment after deploy.' }

Write-Host ''
Write-Host 'NX-OPS-2 REMOTE DEPLOY COMPLETE.' -ForegroundColor Green
Write-Host 'Real-browser acceptance remains required: create/edit/archive/restore one Client Project and verify AR/EN + Dark/Light + Desktop/Tablet/Mobile.' -ForegroundColor Yellow
