param(
    [switch]$ApplyDataRemote,
    [switch]$DeployRemote
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

if ($ApplyDataRemote -and $DeployRemote) {
    throw 'Choose exactly one remote action. Data migration and Worker deployment are separate owner gates.'
}

$ExpectedDbName = 'nexora-db'
$ExpectedDbId = '71c3bf88-b71d-465b-9032-5251a11fde64'
$ExpectedWorker = 'nexoratechnologies'
$ExpectedWranglerVersion = '4.129.1'
$ExpectedNodeVersion = 'v22.23.2'
$ExpectedMigration = '0008_client_project_execution.sql'

$NodeExe = $env:NEXORA_NODE_EXE
if ([string]::IsNullOrWhiteSpace($NodeExe) -or -not (Test-Path -LiteralPath $NodeExe)) {
    throw 'Verified Node runtime is missing. Run .\scripts\RUN_NX_OPS_3_RELEASE.ps1 instead of APPLY_NX_OPS_3.ps1 directly.'
}
$nodeVersion = (& $NodeExe --version 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne $ExpectedNodeVersion) {
    throw "Unexpected Node runtime. Required: $ExpectedNodeVersion. Detected: $nodeVersion"
}
Write-Host "PASS pinned Node runtime: $ExpectedNodeVersion" -ForegroundColor Green

$WranglerJs = $env:NEXORA_WRANGLER_JS
if ([string]::IsNullOrWhiteSpace($WranglerJs) -or -not (Test-Path -LiteralPath $WranglerJs)) {
    throw 'Verified Wrangler runtime is missing. Run .\scripts\RUN_NX_OPS_3_RELEASE.ps1 instead of APPLY_NX_OPS_3.ps1 directly.'
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

function Get-RemoteCount {
    param(
        [Parameter(Mandatory=$true)][string]$Sql,
        [Parameter(Mandatory=$true)][string]$Context
    )
    $raw = (Invoke-Wrangler d1 execute DB --remote --json --command $Sql 2>&1 | Out-String)
    if ($WranglerExitCode -ne 0) {
        if (-not [string]::IsNullOrWhiteSpace($raw)) { Write-Host $raw }
        throw "Unable to read D1 count for $Context"
    }
    $countText = Invoke-D1JsonGuard -Mode 'count' -RawJson $raw -Context $Context
    $parsed = 0L
    if (-not [int64]::TryParse($countText,[ref]$parsed)) {
        if (-not [string]::IsNullOrWhiteSpace($raw)) { Write-Host $raw }
        throw "D1 count guard returned a non-integer for $Context"
    }
    return $parsed
}

function Get-RemoteCountSnapshot {
    param(
        [Parameter(Mandatory=$true)][string]$Phase,
        [Parameter(Mandatory=$true)][string[]]$Tables
    )
    $rows=@()
    foreach($table in $Tables){
        $count=Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM $table;" -Context "$Phase count for table: $table"
        $rows += [pscustomobject]@{table_name=$table;rows_count=$count}
    }
    Write-Host ($rows | Sort-Object table_name | ConvertTo-Json -Depth 3)
    return $rows
}

function Get-SnapshotSignature {
    param([Parameter(Mandatory=$true)][object[]]$Rows)
    return (($Rows | Sort-Object table_name | ForEach-Object { "$($_.table_name)=$($_.rows_count)" }) -join ';')
}

function Invoke-ForeignKeyCheck {
    param([Parameter(Mandatory=$true)][string]$Phase)
    $raw=(Invoke-Wrangler d1 execute DB --remote --json --command "PRAGMA foreign_key_check;" 2>&1 | Out-String)
    if($WranglerExitCode -ne 0){if(-not [string]::IsNullOrWhiteSpace($raw)){Write-Host $raw};throw "Unable to run $Phase foreign_key_check."}
    $violations=[int](Invoke-D1JsonGuard -Mode 'fk-empty' -RawJson $raw -Context "$Phase foreign_key_check")
    if($violations -ne 0){throw "$Phase foreign_key_check returned $violations violation(s)."}
    Write-Host "PASS $Phase foreign_key_check returned no violations." -ForegroundColor Green
}

function Get-PendingMigrationNames {
    param([Parameter(Mandatory=$true)][string]$Output)
    return @([regex]::Matches($Output,'\b\d{4}_[A-Za-z0-9_.-]+\.sql\b') | ForEach-Object { $_.Value } | Sort-Object -Unique)
}

function Get-MigrationState {
    $output=(Invoke-Wrangler d1 migrations list DB --remote 2>&1 | Out-String)
    if($WranglerExitCode -ne 0){throw 'Unable to read remote migration state.'}
    Write-Host $output
    $pending=@(Get-PendingMigrationNames -Output $output)
    if($pending.Count -eq 0 -and $output -notmatch 'No migrations to apply'){
        throw 'Unable to prove remote migration state from Wrangler output.'
    }
    return [pscustomobject]@{Output=$output;Pending=$pending}
}

$BaseCountTables=@(
    'clients','client_profile_tokens','project_inquiries','projects','services',
    'client_projects','client_project_services','client_project_members','inquiry_project_links'
)
$ExecutionTables=@('client_project_milestones','client_project_tasks','client_project_task_assignees')

Write-Host 'NEXORA NX-DATA-3 + NX-OPS-3 - Project Execution Release Gate' -ForegroundColor Cyan
Write-Host "Target: existing Worker $ExpectedWorker / existing D1 DB -> $ExpectedDbName" -ForegroundColor DarkGray
Write-Host 'Migration apply and Worker/Admin deployment are separate actions. No business rows are seeded.' -ForegroundColor Yellow

& $NodeExe .\scripts\NX_OPS_3_CHECK.mjs
if($LASTEXITCODE -ne 0){throw 'NX-OPS-3 engineering gate failed. Remote actions are blocked.'}

if(-not (Test-Path .\wrangler.jsonc)){throw 'wrangler.jsonc was not found.'}
$config=Get-Content -Raw -Encoding UTF8 .\wrangler.jsonc | ConvertFrom-Json
$db=@($config.d1_databases | Where-Object { $_.binding -eq 'DB' })
if($db.Count -ne 1){throw 'Expected exactly one existing D1 binding named DB.'}
if($db[0].database_name -ne $ExpectedDbName -or $db[0].database_id -ne $ExpectedDbId){throw "D1 identity mismatch. Expected $ExpectedDbName / $ExpectedDbId."}
if($config.name -ne $ExpectedWorker){throw "Worker identity mismatch. Expected $ExpectedWorker."}
Write-Host "PASS canonical local target: $ExpectedWorker / DB -> $ExpectedDbName / $ExpectedDbId" -ForegroundColor Green

Write-Host 'Checking Cloudflare identity...' -ForegroundColor Cyan
Invoke-Wrangler whoami
if($WranglerExitCode -ne 0){throw 'Cloudflare authentication check failed.'}

Write-Host 'Verifying existing D1 identity from account inventory...' -ForegroundColor Cyan
$d1Raw=(Invoke-Wrangler d1 list --json 2>&1 | Out-String)
if($WranglerExitCode -ne 0){if($d1Raw){Write-Host $d1Raw};throw 'Unable to list D1 databases.'}
$d1List=@($d1Raw | ConvertFrom-Json)
$target=@($d1List | Where-Object { $_.uuid -eq $ExpectedDbId -and $_.name -eq $ExpectedDbName })
if($target.Count -ne 1){throw "Verified D1 identity not found exactly once: $ExpectedDbName / $ExpectedDbId"}
Write-Host "PASS existing D1 identity: $ExpectedDbName / $ExpectedDbId" -ForegroundColor Green

Write-Host 'Reading remote migration state...' -ForegroundColor Cyan
$migration=Get-MigrationState
$pending=@($migration.Pending)

# Validate historical client codes without assuming COUNT(clients)=1 means CU-001.
$clientCodeMismatches=Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM clients WHERE client_code IS NULL OR client_code <> ('CU-' || printf('%03d',id));" -Context 'live Client Code invariant'
if($clientCodeMismatches -ne 0){throw "Live Client Code invariant failed for $clientCodeMismatches row(s)."}
Write-Host 'PASS live Client Codes remain historical ID-derived identities (no positional renumbering).' -ForegroundColor Green

Invoke-ForeignKeyCheck -Phase 'pre-action'

if($ApplyDataRemote){
    if($pending.Count -ne 1 -or $pending[0] -ne $ExpectedMigration){
        throw "NX-DATA-3 apply requires exactly one pending migration: $ExpectedMigration. Found: $($pending -join ', ')"
    }
    Write-Host 'Reading protected production counts before NX-DATA-3 (read-only, per-table)...' -ForegroundColor Cyan
    $before=@(Get-RemoteCountSnapshot -Phase 'pre-data' -Tables $BaseCountTables)
    $beforeSig=Get-SnapshotSignature -Rows $before

    Write-Host 'Running current live runtime smoke before migration...' -ForegroundColor Cyan
    .\scripts\RUNTIME_CHECK.ps1
    if($LASTEXITCODE -ne 0){throw 'Current live runtime check failed before NX-DATA-3.'}

    Write-Host "Applying only $ExpectedMigration to the EXISTING D1 binding..." -ForegroundColor Cyan
    Invoke-Wrangler d1 migrations apply DB --remote
    if($WranglerExitCode -ne 0){throw 'NX-DATA-3 remote migration apply failed.'}

    Write-Host 'Verifying no pending migrations remain...' -ForegroundColor Cyan
    $afterMigration=Get-MigrationState
    if(@($afterMigration.Pending).Count -ne 0){throw "Unexpected pending migrations remain after NX-DATA-3: $(@($afterMigration.Pending) -join ', ')"}

    Write-Host 'Verifying Project Execution tables exist and start empty...' -ForegroundColor Cyan
    foreach($table in $ExecutionTables){
        $count=Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM $table;" -Context "post-data table: $table"
        if($count -ne 0){throw "New Project Execution table is not empty: $table=$count"}
    }
    Write-Host 'PASS Project Execution tables exist and start empty.' -ForegroundColor Green

    Invoke-ForeignKeyCheck -Phase 'post-data'
    Write-Host 'Re-reading protected production counts after NX-DATA-3...' -ForegroundColor Cyan
    $after=@(Get-RemoteCountSnapshot -Phase 'post-data' -Tables $BaseCountTables)
    $afterSig=Get-SnapshotSignature -Rows $after
    if($beforeSig -ne $afterSig){throw "Protected production counts changed during schema-only NX-DATA-3. Before=$beforeSig After=$afterSig"}
    Write-Host 'PASS protected production counts unchanged across schema-only migration.' -ForegroundColor Green

    $clientCodeMismatchesAfter=Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM clients WHERE client_code IS NULL OR client_code <> ('CU-' || printf('%03d',id));" -Context 'post-data Client Code invariant'
    if($clientCodeMismatchesAfter -ne 0){throw 'Client Code invariant changed during NX-DATA-3.'}

    Write-Host 'Running live runtime smoke after migration...' -ForegroundColor Cyan
    .\scripts\RUNTIME_CHECK.ps1
    if($LASTEXITCODE -ne 0){throw 'Runtime check failed after NX-DATA-3 migration.'}

    Write-Host ''
    Write-Host 'NX-DATA-3 REMOTE APPLY COMPLETE.' -ForegroundColor Green
    Write-Host 'No Worker/Admin deployment or Project Execution business-row seed was performed.' -ForegroundColor Green
    Write-Host 'Next owner gate: run read-only preflight again, then approve -DeployRemote.' -ForegroundColor Yellow
    exit 0
}

if($DeployRemote){
    if($pending.Count -ne 0){throw "NX-OPS-3 deploy requires no pending migrations. Found: $($pending -join ', ')"}

    Write-Host 'Verifying Project Execution tables are available before code deployment...' -ForegroundColor Cyan
    foreach($table in $ExecutionTables){[void](Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM $table;" -Context "pre-deploy table: $table")}
    Write-Host 'PASS Project Execution table availability.' -ForegroundColor Green

    $allTables=@($BaseCountTables+$ExecutionTables)
    Write-Host 'Reading production counts before NX-OPS-3 deployment (read-only, per-table)...' -ForegroundColor Cyan
    $before=@(Get-RemoteCountSnapshot -Phase 'pre-deploy' -Tables $allTables)
    $beforeSig=Get-SnapshotSignature -Rows $before

    Write-Host 'Running current live runtime smoke before deployment...' -ForegroundColor Cyan
    .\scripts\RUNTIME_CHECK.ps1
    if($LASTEXITCODE -ne 0){throw 'Current live runtime check failed before NX-OPS-3 deployment.'}

    Write-Host 'Deploying NX-OPS-3 Worker + Admin assets...' -ForegroundColor Cyan
    Invoke-Wrangler deploy
    if($WranglerExitCode -ne 0){throw 'Cloudflare Worker deployment failed.'}

    Write-Host 'Running public runtime checks after deployment...' -ForegroundColor Cyan
    .\scripts\RUNTIME_CHECK.ps1
    if($LASTEXITCODE -ne 0){throw 'Runtime check failed after NX-OPS-3 deployment.'}

    Write-Host 'Verifying migration state remains closed after code deployment...' -ForegroundColor Cyan
    $afterMigration=Get-MigrationState
    if(@($afterMigration.Pending).Count -ne 0){throw "Unexpected pending migration appeared after NX-OPS-3 deployment: $(@($afterMigration.Pending) -join ', ')"}

    Write-Host 'Re-reading production counts after code-only deployment...' -ForegroundColor Cyan
    $after=@(Get-RemoteCountSnapshot -Phase 'post-deploy' -Tables $allTables)
    $afterSig=Get-SnapshotSignature -Rows $after
    if($beforeSig -ne $afterSig){throw "Production counts changed during code-only deployment. Before=$beforeSig After=$afterSig"}
    Write-Host 'PASS production counts unchanged across code-only deployment.' -ForegroundColor Green

    Invoke-ForeignKeyCheck -Phase 'post-deploy'
    $clientCodeMismatchesAfter=Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM clients WHERE client_code IS NULL OR client_code <> ('CU-' || printf('%03d',id));" -Context 'post-deploy Client Code invariant'
    if($clientCodeMismatchesAfter -ne 0){throw 'Client Code invariant changed during NX-OPS-3 deployment.'}

    Write-Host 'Reading active production deployment...' -ForegroundColor Cyan
    Invoke-Wrangler deployments status --name $ExpectedWorker --json
    if($WranglerExitCode -ne 0){throw 'Unable to read active deployment after deploy.'}

    Write-Host ''
    Write-Host 'NX-OPS-3 REMOTE DEPLOY COMPLETE.' -ForegroundColor Green
    Write-Host 'Real-browser acceptance remains required: Client -> Projects navigation, Milestones, Tasks, assignment, calculated progress, AR/EN, Dark/Light and responsive layouts.' -ForegroundColor Yellow
    exit 0
}

# Read-only preflight is state-aware: before 0008 it prepares Data Gate; after 0008 it prepares Code Gate.
if($pending.Count -eq 1 -and $pending[0] -eq $ExpectedMigration){
    Write-Host 'Reading protected production counts before NX-DATA-3 (read-only, per-table)...' -ForegroundColor Cyan
    [void](Get-RemoteCountSnapshot -Phase 'preflight-data' -Tables $BaseCountTables)
    Write-Host 'Running current live runtime smoke...' -ForegroundColor Cyan
    .\scripts\RUNTIME_CHECK.ps1
    if($LASTEXITCODE -ne 0){throw 'Current live runtime check failed.'}
    Write-Host ''
    Write-Host "PRE-FLIGHT PASS - DATA GATE. Pending migration is exactly $ExpectedMigration." -ForegroundColor Green
    Write-Host 'No migration, Worker deployment, Secret change, or business-data write was performed.' -ForegroundColor Green
    Write-Host 'After owner review run:' -ForegroundColor Yellow
    Write-Host '.\scripts\RUN_NX_OPS_3_RELEASE.ps1 -ApplyDataRemote' -ForegroundColor White
    exit 0
}

if($pending.Count -eq 0){
    Write-Host 'Verifying Project Execution tables are available (read-only)...' -ForegroundColor Cyan
    foreach($table in $ExecutionTables){[void](Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM $table;" -Context "preflight table: $table")}
    [void](Get-RemoteCountSnapshot -Phase 'preflight-deploy' -Tables @($BaseCountTables+$ExecutionTables))
    Write-Host 'Running current live runtime smoke...' -ForegroundColor Cyan
    .\scripts\RUNTIME_CHECK.ps1
    if($LASTEXITCODE -ne 0){throw 'Current live runtime check failed.'}
    Write-Host ''
    Write-Host 'PRE-FLIGHT PASS - CODE GATE. 0008 is already applied and no migration is pending.' -ForegroundColor Green
    Write-Host 'No Worker deployment, migration, Secret change, or business-data write was performed.' -ForegroundColor Green
    Write-Host 'After owner review run:' -ForegroundColor Yellow
    Write-Host '.\scripts\RUN_NX_OPS_3_RELEASE.ps1 -DeployRemote' -ForegroundColor White
    exit 0
}

throw "Unexpected remote migration state. Pending: $($pending -join ', ')"
