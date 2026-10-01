#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Part 1: publishes the prebuilt frontend (dist/ only, no source) as the IIS
    application https://faapp.pist.com.tw/WebExcelApp -> C:\inetpub\wwwroot\WebExcelApp.
    Safe to re-run: the folder is mirrored from .\site on every run.

.DESCRIPTION
    .\site is the output of `vite build --base=/WebExcelApp/` plus web.config, which
    proxies /WebExcelApp/api/* and /WebExcelApp/excel-room-* (WebSockets) to the
    Part 2 Node service on 127.0.0.1:3000. The app path is baked into the build, so
    a different -AppPath needs a rebuild (deploy/iis/build-packages.sh APP_PATH=...).

    Needs IIS URL Rewrite 2.1 and Application Request Routing 3.0 installed.
#>
param(
    [string]$SiteName     = "Default Web Site",
    [string]$AppPath      = "/WebExcelApp",
    [string]$PhysicalPath = "C:\inetpub\wwwroot\WebExcelApp",
    [string]$AppPool      = "WebExcelApp",
    [string]$SiteUrl      = "https://faapp.pist.com.tw"
)
. (Join-Path $PSScriptRoot "..\Common.ps1")
$Source = Join-Path $PSScriptRoot "site"

Write-Host "== Part 1: frontend -> $SiteName$AppPath ($PhysicalPath)" -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $Source "index.html"))) { Fail "$Source\index.html missing - is this the extracted package?" }
$builtFor = Select-String -Path (Join-Path $Source "index.html") -Pattern 'src="([^"]*)/assets/' | ForEach-Object { $_.Matches[0].Groups[1].Value } | Select-Object -First 1
if ($builtFor -ne $AppPath) { Fail "this build is for '$builtFor', not '$AppPath'. Rebuild with APP_PATH=$AppPath" }

Write-Step "1/4" "IIS features and modules"
Enable-IisFeatures @("IIS-WebServerRole", "IIS-WebServer", "IIS-StaticContent", "IIS-DefaultDocument",
    "IIS-HttpCompressionStatic", "IIS-HttpCompressionDynamic", "IIS-WebSockets", "IIS-RequestFiltering", "IIS-ManagementConsole")
$missing = @()
if (-not (Test-Path "$env:windir\system32\inetsrv\rewrite.dll")) {
    $missing += "IIS URL Rewrite 2.1             https://www.iis.net/downloads/microsoft/url-rewrite"
}
if (-not (Test-Path "$env:ProgramFiles\IIS\Application Request Routing\requestRouter.dll")) {
    $missing += "IIS Application Request Routing https://www.iis.net/downloads/microsoft/application-request-routing"
}
if ($missing.Count) { $missing | ForEach-Object { Write-Warn $_ }; Fail "install the above, then re-run" }
Write-Ok "static content, WebSocket Protocol, URL Rewrite, ARR"

Write-Step "2/4" "ARR proxy (server-wide setting) and JSON compression"
$apphost = "MACHINE/WEBROOT/APPHOST"
Set-WebConfigurationProperty -PSPath $apphost -Filter "system.webServer/proxy" -Name "enabled" -Value "True"
# Excel imports / large workbook opens can take a while
Set-WebConfigurationProperty -PSPath $apphost -Filter "system.webServer/proxy" -Name "timeout" -Value "00:10:00"
Set-WebConfigurationProperty -PSPath $apphost -Filter "system.webServer/proxy" -Name "reverseRewriteHostInResponseHeaders" -Value "False"
# IIS doesn't compress JSON by default; WebSideAPI responses are mostly JSON
if (-not (Get-WebConfiguration -PSPath $apphost -Filter "system.webServer/httpCompression/dynamicTypes/add[@mimeType='application/json']")) {
    Add-WebConfigurationProperty -PSPath $apphost -Filter "system.webServer/httpCompression/dynamicTypes" -Name "." -Value @{ mimeType = "application/json"; enabled = "True" }
}
Write-Ok "proxy enabled"

Write-Step "3/4" "Copy site and create IIS application"
New-Item -ItemType Directory -Force -Path $PhysicalPath | Out-Null
Copy-Tree $Source $PhysicalPath @("/MIR")
Set-IisApp $SiteName $AppPath $PhysicalPath $AppPool
# Anonymous: the page itself is public; the API checks the AD-issued JWT
Set-IisAuth $SiteName $AppPath -Anonymous $true -Windows $false
& icacls $PhysicalPath /grant "IIS AppPool\${AppPool}:(OI)(CI)RX" /T /Q | Out-Null
Start-WebAppPool $AppPool -ErrorAction SilentlyContinue
Write-Ok "$SiteName$AppPath -> $PhysicalPath (pool $AppPool)"

Write-Step "4/4" "Smoke test"
Start-Sleep 2
Test-Url "frontend $AppPath/"                 "$SiteUrl$AppPath/"                       @(200)
Test-Url "SPA route $AppPath/like-excel"      "$SiteUrl$AppPath/like-excel"             @(200)
Test-Url "API proxy (401 = proxy + Node OK)"  "$SiteUrl$AppPath/api/excel-pool/list"    @(401)
Write-Host ""
Write-Host "Frontend done: $SiteUrl$AppPath/" -ForegroundColor Cyan
exit 0
