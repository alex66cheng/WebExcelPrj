#Requires -RunAsAdministrator
# Runs the three parts in dependency order: backend (creates the JWT secret),
# AD auth (uses it), frontend (its smoke test goes through the proxy to the backend).
# Each part can also be run on its own, e.g. to redeploy only the frontend.
$ErrorActionPreference = "Stop"
& (Join-Path $PSScriptRoot "2-backend\Install-Backend.ps1")
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot "3-adauth\Install-ADAuth.ps1")
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& (Join-Path $PSScriptRoot "1-frontend\Install-Frontend.ps1")
