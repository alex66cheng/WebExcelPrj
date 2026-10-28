# Windows version of deploy-dist.sh: build the frontend locally and upload only dist/
# (~8 MB) to the cloud server, instead of the source + node_modules (~700 MB).
#
# Uses the ssh/scp/tar that ship with Windows 10/11 (no rsync needed).
# The server's pm2 "frontend" app serves dist/ with serve-dist.mjs (see ecosystem.config.js).
#
# Usage (PowerShell, from anywhere):
#   .\my-app-pt1\scripts\deploy-dist.ps1
#   .\my-app-pt1\scripts\deploy-dist.ps1 -DeployHost user@host -DeployDir WebExcelPrj -SkipBuild
# If scripts are blocked: powershell -ExecutionPolicy Bypass -File .\my-app-pt1\scripts\deploy-dist.ps1
param(
  [string]$DeployHost = 'alex@www.mygwsite.com',
  [string]$DeployDir = 'WebExcelPrj',   # relative to ~ on the server
  [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'

function Invoke-Checked([string]$exe, [string[]]$cmdArgs) {
  & $exe @cmdArgs
  if ($LASTEXITCODE -ne 0) { throw "$exe failed with exit code $LASTEXITCODE" }
}

$appDir = Split-Path -Parent $PSScriptRoot
Set-Location $appDir

if (-not $SkipBuild) {
  Write-Host 'Building...'
  Invoke-Checked 'npm' @('run', 'build')
}
if (-not (Test-Path 'dist/index.html')) { throw 'dist/index.html not found' }

$archive = Join-Path $env:TEMP 'webexcel-dist.tar.gz'
if (Test-Path $archive) { Remove-Item $archive }
Invoke-Checked 'tar' @('-czf', $archive, '-C', 'dist', '.')

$remote = "$DeployDir/my-app-pt1"
Write-Host "Uploading dist/ to ${DeployHost}:$remote ..."
Invoke-Checked 'scp' @($archive, "${DeployHost}:/tmp/webexcel-dist.tar.gz")
Invoke-Checked 'scp' @('serve-dist.mjs', "${DeployHost}:$remote/serve-dist.mjs")

# Unpack into dist.new then swap, so a restart mid-upload never sees a half-copied dist/.
$swap = "cd '$remote' && rm -rf dist.new dist.old && mkdir dist.new && tar -xzf /tmp/webexcel-dist.tar.gz -C dist.new && rm /tmp/webexcel-dist.tar.gz && { [ -d dist ] && mv dist dist.old || true; } && mv dist.new dist && rm -rf dist.old && pm2 restart frontend --update-env"
Invoke-Checked 'ssh' @($DeployHost, $swap)

Remove-Item $archive
Write-Host 'Deployed. index.html is served no-cache, so browsers pick up the new build on next load.'
