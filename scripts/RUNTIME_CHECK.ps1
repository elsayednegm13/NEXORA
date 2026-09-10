param(
  [string]$BaseUrl = "https://nexoratechnologies.elsayedmohamed963.workers.dev"
)
$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd('/')
$paths = @(
  "/api/v1/health",
  "/api/v1/health/db",
  "/api/v1/services",
  "/api/v1/services/websites",
  "/api/v1/projects",
  "/api/v1/projects/nineveh-platform",
  "/api/v1/project-inquiries/config",
  "/api/v1/admin/setup/status"
)
foreach ($path in $paths) {
  $url = "$BaseUrl$path"
  try {
    $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 30
    Write-Host ("PASS {0} {1}" -f $res.StatusCode, $path) -ForegroundColor Green
  } catch {
    Write-Host ("FAIL {0} :: {1}" -f $path, $_.Exception.Message) -ForegroundColor Red
    throw
  }
}
