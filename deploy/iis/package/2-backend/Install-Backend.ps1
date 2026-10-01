#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Part 2: installs WebSideAPI (Node.js) as the Windows service "WebExcelAPI",
    listening on 127.0.0.1:3000 only (reached through the Part 1 IIS proxy).
    Safe to re-run: code and node_modules are replaced, user data is kept.

.DESCRIPTION
    .\WebSideAPI already contains its node_modules (all pure JavaScript), so the
    server needs no npm/internet access. Layout under -InstallRoot (default C:\WebExcel):
      app\WebSideAPI\              code; sqlite-dbs\, uploads\, excel-pool-meta.json are user data
      app\Excels\                  Excel file pool (user data)
      logs\websideapi.*.log        service stdout/stderr (rotated at 10 MB)
      jwt-secret.txt               shared with Part 3 (ADAuthAPI)

    Needs: Node.js 22.13+ (24 LTS recommended), NSSM on PATH, MongoDB on 127.0.0.1:27017.
#>
param(
    [string]$InstallRoot = "C:\WebExcel",
    [string]$ServiceName = "WebExcelAPI",
    [string]$SecretFile  = "C:\WebExcel\jwt-secret.txt"
)
. (Join-Path $PSScriptRoot "..\Common.ps1")
$Source = Join-Path $PSScriptRoot "WebSideAPI"
$ApiDir = Join-Path $InstallRoot "app\WebSideAPI"
$LogDir = Join-Path $InstallRoot "logs"

Write-Host "== Part 2: backend -> service $ServiceName ($ApiDir)" -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $Source "node_modules"))) { Fail "$Source\node_modules missing - is this the extracted package?" }

Write-Step "1/4" "Prerequisites"
$missing = @()
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { $missing += "Node.js 22.13+ (24 LTS)  https://nodejs.org" }
else {
    # WebSideAPI uses the built-in node:sqlite module, unflagged since 22.13
    $v = [version]((& node -v).TrimStart('v'))
    if ($v -lt [version]"22.13.0") { $missing += "Node.js $v is too old: need 22.13+ for node:sqlite" }
}
if (-not (Get-Command nssm -ErrorAction SilentlyContinue)) { $missing += "NSSM (copy win64\nssm.exe to C:\Windows\System32)  https://nssm.cc/download" }
if ($missing.Count) { $missing | ForEach-Object { Write-Warn $_ }; Fail "install the above, then re-run" }
if (-not (Test-NetConnection 127.0.0.1 -Port 27017 -InformationLevel Quiet -WarningAction SilentlyContinue)) {
    Write-Warn "nothing listening on 127.0.0.1:27017 - install MongoDB Community (MSI, 'Install as a Service'). Continuing."
}
Write-Ok "node $(& node -v), nssm"

Write-Step "2/4" "Folders and JWT secret"
foreach ($d in @($ApiDir, $LogDir, (Join-Path $InstallRoot "app\Excels"))) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
$JwtSecret = Get-JwtSecret $SecretFile

Write-Step "3/4" "Copy code"
$svc = Get-Service $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -ne "Stopped") { & nssm stop $ServiceName | Out-Null }
# /E without /MIR on purpose: never purge the user data that lives inside the app dir
Copy-Tree $Source $ApiDir @("/E", "/XD", "node_modules", "sqlite-dbs", "uploads", "/XF", "excel-pool-meta.json")
Copy-Tree (Join-Path $Source "node_modules") (Join-Path $ApiDir "node_modules") @("/MIR")
Write-Ok "code -> $ApiDir"

Write-Step "4/4" "Windows service"
if (-not $svc) { Invoke-Checked "nssm install" { nssm install $ServiceName $node.Source index.js } }
& nssm set $ServiceName Application $node.Source | Out-Null
& nssm set $ServiceName AppParameters index.js | Out-Null
& nssm set $ServiceName AppDirectory $ApiDir | Out-Null
& nssm set $ServiceName DisplayName "WebExcel API (WebSideAPI)" | Out-Null
& nssm set $ServiceName Start SERVICE_AUTO_START | Out-Null
# HOST=127.0.0.1: only the IIS reverse proxy can reach the API, not the network
& nssm set $ServiceName AppEnvironmentExtra "HOST=127.0.0.1" "JWT_SECRET=$JwtSecret" "NODE_ENV=production" | Out-Null
& nssm set $ServiceName AppStdout (Join-Path $LogDir "websideapi.out.log") | Out-Null
& nssm set $ServiceName AppStderr (Join-Path $LogDir "websideapi.err.log") | Out-Null
& nssm set $ServiceName AppRotateFiles 1 | Out-Null
& nssm set $ServiceName AppRotateOnline 1 | Out-Null
& nssm set $ServiceName AppRotateBytes 10485760 | Out-Null
Invoke-Checked "nssm start" { nssm start $ServiceName }
Start-Sleep 3
Test-Url "Node 127.0.0.1:3000 (no token = 401)" "http://127.0.0.1:3000/api/excel-pool/list" @(401)
Write-Host ""
Write-Host "Backend done. Logs: $LogDir\websideapi.err.log" -ForegroundColor Cyan
exit 0
