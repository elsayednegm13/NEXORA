param(
    [switch]$DeployRemote
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$SourceRoot = Split-Path -Parent $PSScriptRoot
$ManifestPath = Join-Path $PSScriptRoot 'NX_COLLAB_1_UI_R4_RELEASE_MANIFEST.json'
$ExpectedWranglerVersion = '4.129.1'
$ExpectedNodeVersion = 'v22.23.2'
$ExpectedNodeFolder = 'node-v22.23.2-win-x64'
$ExpectedNodeArchiveSha256 = '1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97'
$NodeArchiveUrl = 'https://nodejs.org/download/release/v22.23.2/node-v22.23.2-win-x64.zip'

Write-Host 'NEXORA NX-COLLAB-1 UI R4 CLEAN RELEASE RUNNER' -ForegroundColor Cyan
Write-Host 'Code-only R4: SHA-verified clean stage, real-browser architecture gate, Wrangler dry-run, then owner-controlled deploy.' -ForegroundColor DarkGray

if(-not (Test-Path -LiteralPath $ManifestPath)){throw 'R4 release manifest is missing.'}
$manifest=Get-Content -Raw -Encoding UTF8 $ManifestPath | ConvertFrom-Json
if($manifest.release -ne 'NX-COLLAB-1-UI-R4-PROJECT-WORKSPACE-PORTAL-CORRECTION-CLEAN'){throw 'Unexpected R4 release manifest identity.'}
if($manifest.node_version -ne $ExpectedNodeVersion){throw 'Release manifest Node version mismatch.'}
if($manifest.wrangler_version -ne $ExpectedWranglerVersion){throw 'Release manifest Wrangler version mismatch.'}
if($manifest.node_archive_sha256 -ne $ExpectedNodeArchiveSha256){throw 'Release manifest Node archive SHA-256 mismatch.'}

Write-Host 'Validating release files and hashes...' -ForegroundColor Cyan
foreach($entry in $manifest.files){
    $src=Join-Path $SourceRoot $entry.path
    if(-not (Test-Path -LiteralPath $src)){throw "Release file missing: $($entry.path)"}
    $actual=(Get-FileHash -Algorithm SHA256 -LiteralPath $src).Hash.ToLowerInvariant()
    if($actual -ne $entry.sha256){throw "Release file hash mismatch: $($entry.path)"}
}
Write-Host "PASS release integrity: $($manifest.files.Count) files" -ForegroundColor Green

$ToolBase=Join-Path $env:LOCALAPPDATA 'NEXORA\tooling'
$NodeRoot=Join-Path $ToolBase $ExpectedNodeFolder
$NodeExe=Join-Path $NodeRoot 'node.exe'
$NpmCmd=Join-Path $NodeRoot 'npm.cmd'
$nodeValid=$false
if(Test-Path -LiteralPath $NodeExe){$detectedNode=(& $NodeExe --version 2>$null | Out-String).Trim();if($LASTEXITCODE -eq 0 -and $detectedNode -eq $ExpectedNodeVersion){$nodeValid=$true}}
if(-not $nodeValid){
    Write-Host "Installing verified portable Node.js $ExpectedNodeVersion for NEXORA release tooling..." -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $ToolBase -Force | Out-Null
    $nodeZip=Join-Path $env:TEMP ("NEXORA_"+$ExpectedNodeFolder+'_'+[guid]::NewGuid().ToString('N')+'.zip')
    try{
        [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $NodeArchiveUrl -OutFile $nodeZip -UseBasicParsing
        $archiveHash=(Get-FileHash -Algorithm SHA256 -LiteralPath $nodeZip).Hash.ToLowerInvariant()
        if($archiveHash -ne $ExpectedNodeArchiveSha256){throw "Node archive SHA-256 mismatch. Expected $ExpectedNodeArchiveSha256, got $archiveHash"}
        if(Test-Path -LiteralPath $NodeRoot){Remove-Item -LiteralPath $NodeRoot -Recurse -Force}
        Expand-Archive -LiteralPath $nodeZip -DestinationPath $ToolBase -Force
    }finally{Remove-Item -LiteralPath $nodeZip -Force -ErrorAction SilentlyContinue}
}
if(-not (Test-Path -LiteralPath $NodeExe) -or -not (Test-Path -LiteralPath $NpmCmd)){throw 'Portable Node.js runtime was not installed correctly.'}
$detectedNode=(& $NodeExe --version 2>$null | Out-String).Trim()
if($LASTEXITCODE -ne 0 -or $detectedNode -ne $ExpectedNodeVersion){throw "Portable Node.js verification failed. Required $ExpectedNodeVersion, detected $detectedNode"}
Write-Host "PASS isolated Node runtime: $ExpectedNodeVersion" -ForegroundColor Green

$WranglerRoot=Join-Path $ToolBase "wrangler-$ExpectedWranglerVersion-node22"
$WranglerJs=Join-Path $WranglerRoot 'node_modules\wrangler\bin\wrangler.js'
$wranglerValid=$false
if(Test-Path -LiteralPath $WranglerJs){$versionText=(& $NodeExe $WranglerJs --version 2>$null | Out-String).Trim();if($LASTEXITCODE -eq 0 -and $versionText -match [regex]::Escape($ExpectedWranglerVersion)){$wranglerValid=$true}}
if(-not $wranglerValid){
    Write-Host "Installing pinned Wrangler $ExpectedWranglerVersion under Node $ExpectedNodeVersion..." -ForegroundColor Cyan
    if(Test-Path -LiteralPath $WranglerRoot){Remove-Item -LiteralPath $WranglerRoot -Recurse -Force}
    New-Item -ItemType Directory -Path $WranglerRoot -Force | Out-Null
    Push-Location $WranglerRoot
    try{& $NpmCmd install --no-save --no-package-lock --no-audit --no-fund "wrangler@$ExpectedWranglerVersion";if($LASTEXITCODE -ne 0){throw 'Pinned Wrangler installation failed.'}}finally{Pop-Location}
}
if(-not (Test-Path -LiteralPath $WranglerJs)){throw 'Pinned Wrangler runtime was not installed correctly.'}
$versionText=(& $NodeExe $WranglerJs --version 2>$null | Out-String).Trim()
if($LASTEXITCODE -ne 0 -or $versionText -notmatch [regex]::Escape($ExpectedWranglerVersion)){throw "Pinned Wrangler verification failed. Detected: $versionText"}
Write-Host "PASS isolated Wrangler runtime: $ExpectedWranglerVersion" -ForegroundColor Green

$StageRoot=Join-Path $env:TEMP ("NEXORA_NX_COLLAB_1_UI_R4_"+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $StageRoot -Force | Out-Null
$success=$false
try{
    Write-Host "Creating clean R4 stage: $StageRoot" -ForegroundColor Cyan
    foreach($entry in $manifest.files){
        $src=Join-Path $SourceRoot $entry.path;$dst=Join-Path $StageRoot $entry.path;$dstDir=Split-Path -Parent $dst
        if(-not (Test-Path -LiteralPath $dstDir)){New-Item -ItemType Directory -Path $dstDir -Force | Out-Null}
        Copy-Item -LiteralPath $src -Destination $dst -Force
    }
    Copy-Item -LiteralPath $ManifestPath -Destination (Join-Path $StageRoot 'scripts\NX_COLLAB_1_UI_R4_RELEASE_MANIFEST.json') -Force

    $ApplyScript=Join-Path $StageRoot 'scripts\APPLY_NX_COLLAB_1_UI_R4.ps1'
    $parseTokens=$null;$parseErrors=$null
    [void][System.Management.Automation.Language.Parser]::ParseFile($ApplyScript,[ref]$parseTokens,[ref]$parseErrors)
    if(@($parseErrors).Count -ne 0){$messages=@($parseErrors | ForEach-Object { $_.Message }) -join ' | ';throw "PowerShell parser gate failed for APPLY_NX_COLLAB_1_UI_R4.ps1: $messages"}
    Write-Host 'PASS Windows PowerShell parser gate for staged R4 apply script' -ForegroundColor Green

    $DryRunDir=Join-Path $StageRoot '.wrangler-dry-run'
    Push-Location $StageRoot
    try{& $NodeExe $WranglerJs deploy --dry-run --outdir $DryRunDir;if($LASTEXITCODE -ne 0){throw 'Wrangler R4 deployment dry-run compile gate failed.'}}
    finally{Pop-Location;Remove-Item -LiteralPath $DryRunDir -Recurse -Force -ErrorAction SilentlyContinue}
    Write-Host 'PASS Wrangler deployment dry-run: exact R4 Worker + Durable Object + D1 + R2 + Assets compile' -ForegroundColor Green

    $env:NEXORA_NODE_EXE=$NodeExe;$env:NEXORA_WRANGLER_JS=$WranglerJs
    Push-Location $StageRoot
    try{
        if($DeployRemote){& .\scripts\APPLY_NX_COLLAB_1_UI_R4.ps1 -DeployRemote}else{& .\scripts\APPLY_NX_COLLAB_1_UI_R4.ps1}
        if($LASTEXITCODE -ne 0){throw "R4 release execution failed with exit code $LASTEXITCODE."}
    }finally{Pop-Location}
    $success=$true
}finally{
    Remove-Item Env:\NEXORA_NODE_EXE -ErrorAction SilentlyContinue
    Remove-Item Env:\NEXORA_WRANGLER_JS -ErrorAction SilentlyContinue
    if($success){Remove-Item -LiteralPath $StageRoot -Recurse -Force -ErrorAction SilentlyContinue}else{Write-Host "Diagnostic R4 stage preserved at: $StageRoot" -ForegroundColor Yellow}
}
