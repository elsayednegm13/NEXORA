param(
    [switch]$CreateR2Remote,
    [switch]$ApplyDataRemote,
    [switch]$DeployRemote
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$remoteActions=@($CreateR2Remote,$ApplyDataRemote,$DeployRemote) | Where-Object { [bool]$_ }
if(@($remoteActions).Count -gt 1){ throw 'Choose exactly one remote action. R2 infrastructure, Data migration and Worker deployment are separate owner gates.' }

$ExpectedDbName = 'nexora-db'
$ExpectedDbId = '71c3bf88-b71d-465b-9032-5251a11fde64'
$ExpectedWorker = 'nexoratechnologies'
$ExpectedWranglerVersion = '4.129.1'
$ExpectedNodeVersion = 'v22.23.2'
$ExpectedMigration = '0010_client_project_collaboration.sql'
$ExpectedR2Bucket = 'nexora-project-files'
$D1ReadMaxAttempts = 4
$D1ReadBaseDelaySeconds = 2

$NodeExe = $env:NEXORA_NODE_EXE
if ([string]::IsNullOrWhiteSpace($NodeExe) -or -not (Test-Path -LiteralPath $NodeExe)) {
    throw 'Verified Node runtime is missing. Run .\scripts\RUN_NX_COLLAB_1_RELEASE.ps1 instead of APPLY_NX_COLLAB_1.ps1 directly.'
}
$nodeVersion = (& $NodeExe --version 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne $ExpectedNodeVersion) {
    throw "Unexpected Node runtime. Required: $ExpectedNodeVersion. Detected: $nodeVersion"
}
Write-Host "PASS pinned Node runtime: $ExpectedNodeVersion" -ForegroundColor Green

$WranglerJs = $env:NEXORA_WRANGLER_JS
if ([string]::IsNullOrWhiteSpace($WranglerJs) -or -not (Test-Path -LiteralPath $WranglerJs)) {
    throw 'Verified Wrangler runtime is missing. Run .\scripts\RUN_NX_COLLAB_1_RELEASE.ps1 instead of APPLY_NX_COLLAB_1.ps1 directly.'
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

function Test-TransientD1ReadFailure {
    param([AllowEmptyString()][string]$Raw)
    if ([string]::IsNullOrWhiteSpace($Raw)) { return $false }
    return $Raw -match '(?i)fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network error|network request failed|HTTP\s+(502|503|504)|status\s+(502|503|504)'
}

function Get-RemoteCount {
    param(
        [Parameter(Mandatory=$true)][string]$Sql,
        [Parameter(Mandatory=$true)][string]$Context
    )
    for($attempt=1;$attempt -le $D1ReadMaxAttempts;$attempt++){
        $raw = (Invoke-Wrangler d1 execute DB --remote --json --command $Sql 2>&1 | Out-String)
        if ($WranglerExitCode -eq 0) {
            $countText = Invoke-D1JsonGuard -Mode 'count' -RawJson $raw -Context $Context
            $parsed = 0L
            if (-not [int64]::TryParse($countText,[ref]$parsed)) {
                if (-not [string]::IsNullOrWhiteSpace($raw)) { Write-Host $raw }
                throw "D1 count guard returned a non-integer for $Context"
            }
            return $parsed
        }

        $isTransient=Test-TransientD1ReadFailure -Raw $raw
        if((-not $isTransient) -or $attempt -ge $D1ReadMaxAttempts){
            if (-not [string]::IsNullOrWhiteSpace($raw)) { Write-Host $raw }
            throw "Unable to read D1 count for $Context"
        }

        $delay=[int]($D1ReadBaseDelaySeconds * [math]::Pow(2,$attempt-1))
        Write-Host "WARN transient D1 read failure for $Context. Retry $($attempt + 1)/$D1ReadMaxAttempts in $delay second(s)." -ForegroundColor Yellow
        Start-Sleep -Seconds $delay
    }
    throw "Unable to read D1 count for $Context"
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

function Test-R2BucketExists {
    $oldPref=$ErrorActionPreference
    $ErrorActionPreference='Continue'
    try { $raw=(& $NodeExe $WranglerJs r2 bucket list 2>&1 | Out-String); $exit=$LASTEXITCODE }
    finally { $ErrorActionPreference=$oldPref }
    if($exit -ne 0){ if($raw){Write-Host $raw}; throw 'Unable to read R2 bucket inventory.' }
    return [regex]::IsMatch($raw, '(?m)(^|\s)' + [regex]::Escape($ExpectedR2Bucket) + '(\s|$)')
}

$BaseCountTables=@(
    'clients','client_profile_tokens','project_inquiries','projects','services',
    'client_projects','client_project_services','client_project_members','inquiry_project_links'
)
$ExecutionTables=@('client_project_milestones','client_project_tasks','client_project_task_assignees')
$SupportTables=@('client_project_access_grants','client_portal_sessions','client_project_tickets','client_project_ticket_messages','client_project_ticket_events')
$CollaborationTables=@('client_project_folders','client_project_files','client_project_file_versions','client_project_ticket_attachments')

Write-Host 'NEXORA NX-DATA-5 + NX-COLLAB-1 - Collaboration + Private Files Foundation Release Gate' -ForegroundColor Cyan
Write-Host "Target: existing Worker $ExpectedWorker / existing D1 DB -> $ExpectedDbName" -ForegroundColor DarkGray
Write-Host 'Migration apply and Worker/Admin deployment are separate actions. No business rows are seeded.' -ForegroundColor Yellow

if(-not (Test-Path .\wrangler.jsonc)){throw 'wrangler.jsonc was not found.'}
$config=Get-Content -Raw -Encoding UTF8 .\wrangler.jsonc | ConvertFrom-Json
$db=@($config.d1_databases | Where-Object { $_.binding -eq 'DB' })
if($db.Count -ne 1){throw 'Expected exactly one existing D1 binding named DB.'}
if($db[0].database_name -ne $ExpectedDbName -or $db[0].database_id -ne $ExpectedDbId){throw "D1 identity mismatch. Expected $ExpectedDbName / $ExpectedDbId."}
if($config.name -ne $ExpectedWorker){throw "Worker identity mismatch. Expected $ExpectedWorker."}
Write-Host "PASS canonical local target: $ExpectedWorker / DB -> $ExpectedDbName / $ExpectedDbId" -ForegroundColor Green

Write-Host 'Running NX-COLLAB-1 engineering gate before any Cloudflare action...' -ForegroundColor Cyan
& $NodeExe (Join-Path $PSScriptRoot 'NX_COLLAB_1_CHECK.mjs')
if($LASTEXITCODE -ne 0){ throw 'NX-COLLAB-1 engineering gate failed. Remote actions are blocked.' }

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
if(-not (($pending.Count -eq 0) -or ($pending.Count -eq 1 -and $pending[0] -eq $ExpectedMigration))){ throw "Unexpected remote migration state before NX-COLLAB-1. Pending: $($pending -join ', ')" }

Write-Host 'Checking private R2 project-file bucket state (read-only)...' -ForegroundColor Cyan
$r2Exists=Test-R2BucketExists
if($r2Exists){ Write-Host "PASS existing private R2 bucket: $ExpectedR2Bucket" -ForegroundColor Green }
else { Write-Host "INFO private R2 bucket is not created yet: $ExpectedR2Bucket" -ForegroundColor Yellow }

if($CreateR2Remote){
    if($r2Exists){ throw "R2 infrastructure gate expected an absent bucket, but $ExpectedR2Bucket already exists. No create action is required." }
    Write-Host "Creating only private R2 bucket $ExpectedR2Bucket..." -ForegroundColor Cyan
    Invoke-Wrangler r2 bucket create $ExpectedR2Bucket
    if($WranglerExitCode -ne 0){ throw 'R2 bucket creation failed.' }
    if(-not (Test-R2BucketExists)){ throw 'R2 bucket was not visible after create.' }
    Write-Host ''
    Write-Host 'NX-COLLAB-1 INFRASTRUCTURE CREATE COMPLETE.' -ForegroundColor Green
    Write-Host 'No D1 migration, Worker deployment, Secret change, or business-data write was performed.' -ForegroundColor Green
    Write-Host 'Next owner gate: run read-only preflight again.' -ForegroundColor Yellow
    exit 0
}

# Validate historical client codes without assuming COUNT(clients)=1 means CU-001.
$clientCodeMismatches=Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM clients WHERE client_code IS NULL OR client_code <> ('CU-' || printf('%03d',id));" -Context 'live Client Code invariant'
if($clientCodeMismatches -ne 0){throw "Live Client Code invariant failed for $clientCodeMismatches row(s)."}
Write-Host 'PASS live Client Codes remain historical ID-derived identities (no positional renumbering).' -ForegroundColor Green

Invoke-ForeignKeyCheck -Phase 'pre-action'

if($ApplyDataRemote){
    if(-not $r2Exists){ throw 'NX-DATA-5 apply is blocked until the approved private R2 bucket exists.' }
    if($pending.Count -ne 1 -or $pending[0] -ne $ExpectedMigration){
        throw "NX-DATA-5 apply requires exactly one pending migration: $ExpectedMigration. Found: $($pending -join ', ')"
    }
    Write-Host 'Reading protected production counts before NX-DATA-5 (read-only, per-table)...' -ForegroundColor Cyan
    $before=@(Get-RemoteCountSnapshot -Phase 'pre-data' -Tables @($BaseCountTables+$ExecutionTables))
    $beforeSig=Get-SnapshotSignature -Rows $before

    Write-Host 'Running current live runtime smoke before migration...' -ForegroundColor Cyan
    .\scripts\RUNTIME_CHECK.ps1
    if($LASTEXITCODE -ne 0){throw 'Current live runtime check failed before NX-DATA-5.'}

    Write-Host "Applying only $ExpectedMigration to the EXISTING D1 binding..." -ForegroundColor Cyan
    Invoke-Wrangler d1 migrations apply DB --remote
    if($WranglerExitCode -ne 0){throw 'NX-DATA-5 remote migration apply failed.'}

    Write-Host 'Verifying no pending migrations remain...' -ForegroundColor Cyan
    $afterMigration=Get-MigrationState
    if(@($afterMigration.Pending).Count -ne 0){throw "Unexpected pending migrations remain after NX-DATA-5: $(@($afterMigration.Pending) -join ', ')"}

    Write-Host 'Verifying new Collaboration file tables exist and start empty...' -ForegroundColor Cyan
    foreach($table in $CollaborationTables){
        $count=Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM $table;" -Context "post-data table: $table"
        if($count -ne 0){throw "New Collaboration table is not empty: $table=$count"}
    }
    Write-Host 'PASS new Collaboration file tables exist and start empty.' -ForegroundColor Green
    $ticketRequestColumn=Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM pragma_table_info('client_project_tickets') WHERE name='client_request_id';" -Context 'ticket client_request_id column'
    $messageRequestColumn=Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM pragma_table_info('client_project_ticket_messages') WHERE name='client_request_id';" -Context 'message client_request_id column'
    if($ticketRequestColumn -ne 1 -or $messageRequestColumn -ne 1){throw 'Idempotency columns are missing after NX-DATA-5.'}
    Write-Host 'PASS ticket/message idempotency columns are present.' -ForegroundColor Green
    $taskVisibleColumn=Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM pragma_table_info('client_project_tasks') WHERE name='client_visible';" -Context 'task client_visible column'
    $milestoneVisibleColumn=Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM pragma_table_info('client_project_milestones') WHERE name='client_visible';" -Context 'milestone client_visible column'
    if($taskVisibleColumn -ne 1 -or $milestoneVisibleColumn -ne 1){throw 'Client visibility columns are missing after NX-DATA-5.'}
    Write-Host 'PASS client_visible columns are present on Tasks and Milestones.' -ForegroundColor Green

    Invoke-ForeignKeyCheck -Phase 'post-data'
    Write-Host 'Re-reading protected production counts after NX-DATA-5...' -ForegroundColor Cyan
    $after=@(Get-RemoteCountSnapshot -Phase 'post-data' -Tables @($BaseCountTables+$ExecutionTables))
    $afterSig=Get-SnapshotSignature -Rows $after
    if($beforeSig -ne $afterSig){throw "Protected production counts changed during schema-only NX-DATA-5. Before=$beforeSig After=$afterSig"}
    Write-Host 'PASS protected production counts unchanged across schema-only migration.' -ForegroundColor Green

    $clientCodeMismatchesAfter=Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM clients WHERE client_code IS NULL OR client_code <> ('CU-' || printf('%03d',id));" -Context 'post-data Client Code invariant'
    if($clientCodeMismatchesAfter -ne 0){throw 'Client Code invariant changed during NX-DATA-5.'}

    Write-Host 'Running live runtime smoke after migration...' -ForegroundColor Cyan
    .\scripts\RUNTIME_CHECK.ps1
    if($LASTEXITCODE -ne 0){throw 'Runtime check failed after NX-DATA-5 migration.'}

    Write-Host ''
    Write-Host 'NX-DATA-5 REMOTE APPLY COMPLETE.' -ForegroundColor Green
    Write-Host 'No Worker/Admin deployment or Collaboration business-row seed was performed.' -ForegroundColor Green
    Write-Host 'Next owner gate: run read-only preflight again, then approve -DeployRemote.' -ForegroundColor Yellow
    exit 0
}

if($DeployRemote){
    if(-not $r2Exists){ throw 'NX-COLLAB-1 deploy is blocked until the approved private R2 bucket exists.' }
    if($pending.Count -ne 0){throw "NX-COLLAB-1 deploy requires no pending migrations. Found: $($pending -join ', ')"}

    Write-Host 'Verifying Collaboration + Private Files tables are available before code deployment...' -ForegroundColor Cyan
    foreach($table in @($SupportTables+$CollaborationTables)){[void](Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM $table;" -Context "pre-deploy table: $table")}
    Write-Host 'PASS Collaboration + Private Files table availability.' -ForegroundColor Green

    $allTables=@($BaseCountTables+$ExecutionTables+$SupportTables+$CollaborationTables)
    Write-Host 'Reading production counts before NX-COLLAB-1 deployment (read-only, per-table)...' -ForegroundColor Cyan
    $before=@(Get-RemoteCountSnapshot -Phase 'pre-deploy' -Tables $allTables)
    $beforeSig=Get-SnapshotSignature -Rows $before

    Write-Host 'Running current live runtime smoke before deployment...' -ForegroundColor Cyan
    .\scripts\RUNTIME_CHECK.ps1
    if($LASTEXITCODE -ne 0){throw 'Current live runtime check failed before NX-COLLAB-1 deployment.'}

    Write-Host 'Deploying NX-COLLAB-1 Worker + Admin assets...' -ForegroundColor Cyan
    Invoke-Wrangler deploy
    if($WranglerExitCode -ne 0){throw 'Cloudflare Worker deployment failed.'}

    Write-Host 'Running public runtime checks after deployment...' -ForegroundColor Cyan
    .\scripts\RUNTIME_CHECK.ps1
    if($LASTEXITCODE -ne 0){throw 'Runtime check failed after NX-COLLAB-1 deployment.'}
    try{$portalRes=Invoke-WebRequest -Uri 'https://nexoratechnologies.elsayedmohamed963.workers.dev/project-portal.html' -UseBasicParsing -TimeoutSec 30;if($portalRes.StatusCode -ne 200){throw 'portal status'}}catch{throw 'Project Portal static runtime check failed after deployment.'}
    Write-Host 'PASS 200 /project-portal.html' -ForegroundColor Green

    Write-Host 'Verifying migration state remains closed after code deployment...' -ForegroundColor Cyan
    $afterMigration=Get-MigrationState
    if(@($afterMigration.Pending).Count -ne 0){throw "Unexpected pending migration appeared after NX-COLLAB-1 deployment: $(@($afterMigration.Pending) -join ', ')"}

    Write-Host 'Re-reading production counts after code-only deployment...' -ForegroundColor Cyan
    $after=@(Get-RemoteCountSnapshot -Phase 'post-deploy' -Tables $allTables)
    $afterSig=Get-SnapshotSignature -Rows $after
    if($beforeSig -ne $afterSig){throw "Production counts changed during code-only deployment. Before=$beforeSig After=$afterSig"}
    Write-Host 'PASS production counts unchanged across code-only deployment.' -ForegroundColor Green

    Invoke-ForeignKeyCheck -Phase 'post-deploy'
    $clientCodeMismatchesAfter=Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM clients WHERE client_code IS NULL OR client_code <> ('CU-' || printf('%03d',id));" -Context 'post-deploy Client Code invariant'
    if($clientCodeMismatchesAfter -ne 0){throw 'Client Code invariant changed during NX-COLLAB-1 deployment.'}

    Write-Host 'Reading active production deployment...' -ForegroundColor Cyan
    Invoke-Wrangler deployments status --name $ExpectedWorker --json
    if($WranglerExitCode -ne 0){throw 'Unable to read active deployment after deploy.'}

    Write-Host ''
    Write-Host 'NX-COLLAB-1 REMOTE DEPLOY COMPLETE.' -ForegroundColor Green
    Write-Host 'Real-browser acceptance remains required: two-browser realtime Tickets/Messages/Project progress, closed-ticket enforcement, private R2 file upload/preview/download, voice note, AR/EN, Dark/Light and responsive layouts.' -ForegroundColor Yellow
    exit 0
}

# Read-only preflight is state-aware: Infrastructure -> Data -> Code.
if(-not $r2Exists){
    Write-Host ''
    Write-Host "PRE-FLIGHT PASS - INFRASTRUCTURE GATE. Private R2 bucket is required: $ExpectedR2Bucket" -ForegroundColor Green
    Write-Host 'No R2 bucket, migration, Worker deployment, Secret change, or business-data write was performed.' -ForegroundColor Green
    Write-Host 'After owner review run:' -ForegroundColor Yellow
    Write-Host '.\scripts\RUN_NX_COLLAB_1_RELEASE.ps1 -CreateR2Remote' -ForegroundColor White
    exit 0
}

if($pending.Count -eq 1 -and $pending[0] -eq $ExpectedMigration){
    Write-Host 'Reading protected production counts before NX-DATA-5 (read-only, per-table)...' -ForegroundColor Cyan
    [void](Get-RemoteCountSnapshot -Phase 'preflight-data' -Tables @($BaseCountTables+$ExecutionTables))
    Write-Host 'Running current live runtime smoke...' -ForegroundColor Cyan
    .\scripts\RUNTIME_CHECK.ps1
    if($LASTEXITCODE -ne 0){throw 'Current live runtime check failed.'}
    Write-Host ''
    Write-Host "PRE-FLIGHT PASS - DATA GATE. Pending migration is exactly $ExpectedMigration." -ForegroundColor Green
    Write-Host 'No migration, Worker deployment, Secret change, or business-data write was performed.' -ForegroundColor Green
    Write-Host 'After owner review run:' -ForegroundColor Yellow
    Write-Host '.\scripts\RUN_NX_COLLAB_1_RELEASE.ps1 -ApplyDataRemote' -ForegroundColor White
    exit 0
}

if($pending.Count -eq 0){
    Write-Host 'Verifying Collaboration + Private Files tables are available (read-only)...' -ForegroundColor Cyan
    foreach($table in @($SupportTables+$CollaborationTables)){[void](Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM $table;" -Context "preflight table: $table")}
    [void](Get-RemoteCountSnapshot -Phase 'preflight-deploy' -Tables @($BaseCountTables+$ExecutionTables+$SupportTables+$CollaborationTables))
    Write-Host 'Running current live runtime smoke...' -ForegroundColor Cyan
    .\scripts\RUNTIME_CHECK.ps1
    if($LASTEXITCODE -ne 0){throw 'Current live runtime check failed.'}
    Write-Host ''
    Write-Host 'PRE-FLIGHT PASS - CODE GATE. 0010 is already applied and no migration is pending.' -ForegroundColor Green
    Write-Host 'No Worker deployment, migration, Secret change, or business-data write was performed.' -ForegroundColor Green
    Write-Host 'After owner review run:' -ForegroundColor Yellow
    Write-Host '.\scripts\RUN_NX_COLLAB_1_RELEASE.ps1 -DeployRemote' -ForegroundColor White
    exit 0
}

throw "Unexpected remote migration state. Pending: $($pending -join ', ')"
