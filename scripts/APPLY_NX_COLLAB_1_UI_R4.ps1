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
$ExpectedR2Bucket = 'nexora-project-files'
$ExpectedUiMarker = 'NX-COLLAB-1-UI-R4'
$D1ReadMaxAttempts = 4
$D1ReadBaseDelaySeconds = 2

$NodeExe = $env:NEXORA_NODE_EXE
if ([string]::IsNullOrWhiteSpace($NodeExe) -or -not (Test-Path -LiteralPath $NodeExe)) {
    throw 'Verified Node runtime is missing. Run .\scripts\RUN_NX_COLLAB_1_UI_R4_RELEASE.ps1 instead of APPLY_NX_COLLAB_1_UI_R4.ps1 directly.'
}
$nodeVersion = (& $NodeExe --version 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $nodeVersion -ne $ExpectedNodeVersion) { throw "Unexpected Node runtime. Required: $ExpectedNodeVersion. Detected: $nodeVersion" }
Write-Host "PASS pinned Node runtime: $ExpectedNodeVersion" -ForegroundColor Green

$WranglerJs = $env:NEXORA_WRANGLER_JS
if ([string]::IsNullOrWhiteSpace($WranglerJs) -or -not (Test-Path -LiteralPath $WranglerJs)) {
    throw 'Verified Wrangler runtime is missing. Run .\scripts\RUN_NX_COLLAB_1_UI_R4_RELEASE.ps1 instead of APPLY_NX_COLLAB_1_UI_R4.ps1 directly.'
}
$wranglerVersion = (& $NodeExe $WranglerJs --version 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $wranglerVersion -notmatch [regex]::Escape($ExpectedWranglerVersion)) { throw "Unexpected Wrangler runtime. Required version: $ExpectedWranglerVersion. Detected: $wranglerVersion" }
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
    } finally { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
}

function Test-TransientD1ReadFailure {
    param([AllowEmptyString()][string]$Raw)
    if ([string]::IsNullOrWhiteSpace($Raw)) { return $false }
    return $Raw -match '(?i)fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|network error|network request failed|HTTP\s+(502|503|504)|status\s+(502|503|504)'
}

function Invoke-D1ReadJson {
    param(
        [Parameter(Mandatory=$true)][string]$Sql,
        [Parameter(Mandatory=$true)][string]$Context
    )
    for($attempt=1;$attempt -le $D1ReadMaxAttempts;$attempt++){
        $raw=(Invoke-Wrangler d1 execute DB --remote --json --command $Sql 2>&1 | Out-String)
        if($WranglerExitCode -eq 0){ return $raw }
        $isTransient=Test-TransientD1ReadFailure -Raw $raw
        if((-not $isTransient) -or $attempt -ge $D1ReadMaxAttempts){
            if(-not [string]::IsNullOrWhiteSpace($raw)){Write-Host $raw}
            throw "Unable to read D1 for $Context"
        }
        $delay=[int]($D1ReadBaseDelaySeconds * [math]::Pow(2,$attempt-1))
        Write-Host "WARN transient D1 read failure for $Context. Retry $($attempt + 1)/$D1ReadMaxAttempts in $delay second(s)." -ForegroundColor Yellow
        Start-Sleep -Seconds $delay
    }
    throw "Unable to read D1 for $Context"
}

function Get-RemoteCount {
    param([Parameter(Mandatory=$true)][string]$Sql,[Parameter(Mandatory=$true)][string]$Context)
    $raw=Invoke-D1ReadJson -Sql $Sql -Context $Context
    $countText=Invoke-D1JsonGuard -Mode 'count' -RawJson $raw -Context $Context
    $parsed=0L
    if(-not [int64]::TryParse($countText,[ref]$parsed)){throw "D1 count guard returned a non-integer for $Context"}
    return $parsed
}

function Get-RemoteCountSnapshot {
    param([Parameter(Mandatory=$true)][string]$Phase,[Parameter(Mandatory=$true)][string[]]$Tables)
    $rows=@()
    foreach($table in $Tables){$count=Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM $table;" -Context "$Phase count for table: $table";$rows += [pscustomobject]@{table_name=$table;rows_count=$count}}
    Write-Host ($rows | Sort-Object table_name | ConvertTo-Json -Depth 3)
    return $rows
}
function Get-SnapshotSignature { param([Parameter(Mandatory=$true)][object[]]$Rows); return (($Rows | Sort-Object table_name | ForEach-Object { "$($_.table_name)=$($_.rows_count)" }) -join ';') }
function Invoke-ForeignKeyCheck {
    param([Parameter(Mandatory=$true)][string]$Phase)
    $raw=Invoke-D1ReadJson -Sql 'PRAGMA foreign_key_check;' -Context "$Phase foreign_key_check"
    $violations=[int](Invoke-D1JsonGuard -Mode 'fk-empty' -RawJson $raw -Context "$Phase foreign_key_check")
    if($violations -ne 0){throw "$Phase foreign_key_check returned $violations violation(s)."}
    Write-Host "PASS $Phase foreign_key_check returned no violations." -ForegroundColor Green
}
function Get-PendingMigrationNames { param([Parameter(Mandatory=$true)][string]$Output); return @([regex]::Matches($Output,'\b\d{4}_[A-Za-z0-9_.-]+\.sql\b') | ForEach-Object { $_.Value } | Sort-Object -Unique) }
function Get-MigrationState {
    $output=(Invoke-Wrangler d1 migrations list DB --remote 2>&1 | Out-String)
    if($WranglerExitCode -ne 0){throw 'Unable to read remote migration state.'}
    Write-Host $output
    $pending=@(Get-PendingMigrationNames -Output $output)
    if($pending.Count -eq 0 -and $output -notmatch 'No migrations to apply'){throw 'Unable to prove remote migration state from Wrangler output.'}
    return [pscustomobject]@{Output=$output;Pending=$pending}
}
function Test-R2BucketExists {
    $oldPref=$ErrorActionPreference;$ErrorActionPreference='Continue'
    try{$raw=(& $NodeExe $WranglerJs r2 bucket list 2>&1 | Out-String);$exit=$LASTEXITCODE}finally{$ErrorActionPreference=$oldPref}
    if($exit -ne 0){if($raw){Write-Host $raw};throw 'Unable to read R2 bucket inventory.'}
    return [regex]::IsMatch($raw,'(?m)(^|\s)'+[regex]::Escape($ExpectedR2Bucket)+'(\s|$)')
}
function Assert-LiveUiMarker {
    param([Parameter(Mandatory=$true)][string]$Url,[Parameter(Mandatory=$true)][string]$Label)
    try{$res=Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 30}catch{throw "$Label runtime request failed after deployment."}
    if($res.StatusCode -ne 200){throw "$Label runtime status is not 200."}
    if($res.Content -notmatch [regex]::Escape($ExpectedUiMarker)){throw "$Label does not serve the R4 UI marker after deployment."}
    Write-Host "PASS R4 marker served: $Label" -ForegroundColor Green
}

$BaseCountTables=@('clients','client_profile_tokens','project_inquiries','projects','services','client_projects','client_project_services','client_project_members','inquiry_project_links')
$ExecutionTables=@('client_project_milestones','client_project_tasks','client_project_task_assignees')
$SupportTables=@('client_project_access_grants','client_portal_sessions','client_project_tickets','client_project_ticket_messages','client_project_ticket_events')
$CollaborationTables=@('client_project_folders','client_project_files','client_project_file_versions','client_project_ticket_attachments')
$AllTables=@($BaseCountTables+$ExecutionTables+$SupportTables+$CollaborationTables)

Write-Host 'NEXORA NX-COLLAB-1 UI R4 - Project Workspace + Client Portal Correction' -ForegroundColor Cyan
Write-Host "Target: existing Worker $ExpectedWorker / existing D1 DB -> $ExpectedDbName" -ForegroundColor DarkGray
Write-Host 'Code/assets only. No migration, R2 creation, Secret mutation, or business-row seed is permitted.' -ForegroundColor Yellow

if(-not (Test-Path .\wrangler.jsonc)){throw 'wrangler.jsonc was not found.'}
$config=Get-Content -Raw -Encoding UTF8 .\wrangler.jsonc | ConvertFrom-Json
$db=@($config.d1_databases | Where-Object { $_.binding -eq 'DB' })
if($db.Count -ne 1){throw 'Expected exactly one existing D1 binding named DB.'}
if($db[0].database_name -ne $ExpectedDbName -or $db[0].database_id -ne $ExpectedDbId){throw "D1 identity mismatch. Expected $ExpectedDbName / $ExpectedDbId."}
if($config.name -ne $ExpectedWorker){throw "Worker identity mismatch. Expected $ExpectedWorker."}
if($config.main -ne './src/cloudflare-worker.js'){throw 'Cloudflare Worker entrypoint changed unexpectedly.'}
Write-Host "PASS canonical local target: $ExpectedWorker / DB -> $ExpectedDbName / $ExpectedDbId" -ForegroundColor Green

Write-Host 'Running R4 engineering + real-browser architecture gate before any Cloudflare action...' -ForegroundColor Cyan
& $NodeExe (Join-Path $PSScriptRoot 'NX_COLLAB_1_UI_R4_CHECK.mjs')
if($LASTEXITCODE -ne 0){throw 'R4 engineering gate failed. Remote deployment is blocked.'}

Write-Host 'Checking Cloudflare identity...' -ForegroundColor Cyan
Invoke-Wrangler whoami
if($WranglerExitCode -ne 0){throw 'Cloudflare authentication check failed.'}
Write-Host 'Verifying existing D1 identity from account inventory...' -ForegroundColor Cyan
$d1Raw=(Invoke-Wrangler d1 list --json 2>&1 | Out-String)
if($WranglerExitCode -ne 0){if($d1Raw){Write-Host $d1Raw};throw 'Unable to list D1 databases.'}
$d1List=@($d1Raw | ConvertFrom-Json);$target=@($d1List | Where-Object { $_.uuid -eq $ExpectedDbId -and $_.name -eq $ExpectedDbName })
if($target.Count -ne 1){throw "Verified D1 identity not found exactly once: $ExpectedDbName / $ExpectedDbId"}
Write-Host "PASS existing D1 identity: $ExpectedDbName / $ExpectedDbId" -ForegroundColor Green

Write-Host 'Reading remote migration state...' -ForegroundColor Cyan
$migration=Get-MigrationState;$pending=@($migration.Pending)
if($pending.Count -ne 0){throw "R4 is code-only and requires no pending migrations. Found: $($pending -join ', ')"}
Write-Host 'PASS no pending migrations; 0010 remains the latest applied schema migration.' -ForegroundColor Green

Write-Host 'Checking existing private R2 project-file bucket...' -ForegroundColor Cyan
if(-not (Test-R2BucketExists)){throw "Required existing private R2 bucket is missing: $ExpectedR2Bucket"}
Write-Host "PASS existing private R2 bucket: $ExpectedR2Bucket" -ForegroundColor Green

$clientCodeMismatches=Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM clients WHERE client_code IS NULL OR client_code <> ('CU-' || printf('%03d',id));" -Context 'live Client Code invariant'
if($clientCodeMismatches -ne 0){throw "Live Client Code invariant failed for $clientCodeMismatches row(s)."}
Write-Host 'PASS live Client Codes remain historical ID-derived identities.' -ForegroundColor Green
Invoke-ForeignKeyCheck -Phase 'pre-action'

Write-Host 'Verifying Collaboration + Private Files tables are available...' -ForegroundColor Cyan
foreach($table in @($SupportTables+$CollaborationTables)){[void](Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM $table;" -Context "preflight table: $table")}
Write-Host 'PASS Collaboration + Private Files table availability.' -ForegroundColor Green

Write-Host 'Reading production counts before R4 code action (read-only, per-table)...' -ForegroundColor Cyan
$before=@(Get-RemoteCountSnapshot -Phase 'pre-r4' -Tables $AllTables);$beforeSig=Get-SnapshotSignature -Rows $before
Write-Host 'Running current live runtime smoke...' -ForegroundColor Cyan
.\scripts\RUNTIME_CHECK.ps1
if($LASTEXITCODE -ne 0){throw 'Current live runtime check failed before R4.'}

if(-not $DeployRemote){
    Write-Host ''
    Write-Host 'PRE-FLIGHT PASS - R4 CODE GATE.' -ForegroundColor Green
    Write-Host 'R4 browser architecture, D1/R2/schema/runtime checks passed. No remote mutation was performed.' -ForegroundColor Green
    Write-Host 'After owner review run:' -ForegroundColor Yellow
    Write-Host '.\scripts\RUN_NX_COLLAB_1_UI_R4_RELEASE.ps1 -DeployRemote' -ForegroundColor White
    exit 0
}

Write-Host 'Deploying R4 Worker + Admin/Client Portal assets...' -ForegroundColor Cyan
Invoke-Wrangler deploy
if($WranglerExitCode -ne 0){throw 'Cloudflare Worker deployment failed.'}

Write-Host 'Running public runtime checks after R4 deployment...' -ForegroundColor Cyan
.\scripts\RUNTIME_CHECK.ps1
if($LASTEXITCODE -ne 0){throw 'Runtime check failed after R4 deployment.'}
Assert-LiveUiMarker -Url 'https://nexoratechnologies.elsayedmohamed963.workers.dev/admin/index.html' -Label 'Admin UI'
Assert-LiveUiMarker -Url 'https://nexoratechnologies.elsayedmohamed963.workers.dev/project-portal.html' -Label 'Client Project Portal'

Write-Host 'Verifying migration state remains closed after R4 code-only deployment...' -ForegroundColor Cyan
$afterMigration=Get-MigrationState
if(@($afterMigration.Pending).Count -ne 0){throw "Unexpected pending migration appeared after R4 deployment: $(@($afterMigration.Pending) -join ', ')"}
Write-Host 'Re-reading production counts after R4 code-only deployment...' -ForegroundColor Cyan
$after=@(Get-RemoteCountSnapshot -Phase 'post-r4' -Tables $AllTables);$afterSig=Get-SnapshotSignature -Rows $after
if($beforeSig -ne $afterSig){throw "Production counts changed during R4 code-only deployment. Before=$beforeSig After=$afterSig"}
Write-Host 'PASS production counts unchanged across R4 code-only deployment.' -ForegroundColor Green
Invoke-ForeignKeyCheck -Phase 'post-r4'
$clientCodeMismatchesAfter=Get-RemoteCount -Sql "SELECT COUNT(*) AS rows_count FROM clients WHERE client_code IS NULL OR client_code <> ('CU-' || printf('%03d',id));" -Context 'post-r4 Client Code invariant'
if($clientCodeMismatchesAfter -ne 0){throw 'Client Code invariant changed during R4 deployment.'}
Write-Host 'Reading active production deployment...' -ForegroundColor Cyan
Invoke-Wrangler deployments status --name $ExpectedWorker --json
if($WranglerExitCode -ne 0){throw 'Unable to read active deployment after R4 deploy.'}
Write-Host ''
Write-Host 'NX-COLLAB-1 UI R4 REMOTE DEPLOY COMPLETE.' -ForegroundColor Green
Write-Host 'No migration, R2 creation, Secret change, or business-data seed was performed.' -ForegroundColor Green
Write-Host 'Final live acceptance: Admin full Project Workspace + Client link discoverability + two-browser Client Portal realtime/files/closed-ticket/AR-EN/Dark-Light/responsive.' -ForegroundColor Yellow
