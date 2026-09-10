$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
Write-Host "=== NEXORA Cloudflare update deploy ===" -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
npx wrangler d1 migrations apply DB --remote
if ($LASTEXITCODE -ne 0) { throw "D1 migrations failed." }
npx wrangler deploy
if ($LASTEXITCODE -ne 0) { throw "Deployment failed." }
Write-Host "Update deployed successfully." -ForegroundColor Green
