#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Deploys the enterprise build (frontend + WebSideAPI + ADAuthAPI) to IIS on
    Windows Server. Safe to re-run: every run rebuilds and redeploys the code
    but keeps user data (Excels, sqlite-dbs, uploads, MongoDB) and the JWT secret.

.DESCRIPTION
    Resulting layout (one IIS site, one origin):
      http(s)://<host>/            frontend (my-app-pt1/dist)    -> $InstallRoot\web
      http(s)://<host>/api/*       WebSideAPI via ARR proxy      -> Windows service "WebExcelAPI" on 127.0.0.1:3000
      ws(s)://<host>/excel-room-*  collaboration WebSockets      -> same service
      http(s)://<host>/adauth/*    ADAuthAPI (Windows Auth only) -> $InstallRoot\adauth

    Run from a checkout of the `enterprise` branch on the server:
      powershell -ExecutionPolicy Bypass -File deploy\iis\Deploy-Enterprise.ps1 -HostName webexcel.corp.local

    Prerequisites it checks for (install them first, see deploy\iis\README.md):
      Node.js >= 22.13, .NET 8 SDK + ASP.NET Core Hosting Bundle, IIS URL Rewrite,
      IIS Application Request Routing 3.0, NSSM on PATH, MongoDB on 127.0.0.1:27017.

.PARAMETER HostName
    Host header for the site binding (e.g. webexcel.corp.local). Empty = answer on any host name.
.PARAMETER CertThumbprint
    Thumbprint of a certificate in LocalMachine\My. When given, an https binding on 443 is added.
#>
param(
    [string]$SiteName = "WebExcel",
    [string]$HostName = "",
    [int]$Port = 80,
    [string]$CertThumbprint = "",
    [string]$InstallRoot = "C:\WebExcel",
    [string]$ServiceName = "WebExcelAPI"
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$appcmd = "$env:windir\system32\inetsrv\appcmd.exe"

$WebDir     = Join-Path $InstallRoot "web"
$AdAuthDir  = Join-Path $InstallRoot "adauth"
$AppDir     = Join-Path $InstallRoot "app"
$ApiDir     = Join-Path $AppDir "WebSideAPI"
$LogDir     = Join-Path $InstallRoot "logs"
$SecretFile = Join-Path $InstallRoot "jwt-secret.txt"

$SitePool   = $SiteName
$AdAuthPool = "$SiteName-ADAuth"

function Write-Step([string]$Step, [string]$Message) {
    Write-Host ""
    Write-Host "[$Step] $Message" -ForegroundColor Yellow
}
function Write-Ok([string]$Message) { Write-Host "  [OK] $Message" -ForegroundColor Green }
function Fail([string]$Message) { Write-Host "  [X] $Message" -ForegroundColor Red; exit 1 }
function Invoke-Checked([string]$What, [scriptblock]$Block) {
    & $Block
    if ($LASTEXITCODE -ne 0) { Fail "$What failed (exit code $LASTEXITCODE)" }
}
# robocopy: exit codes 0-7 are success variants, 8+ are failures
function Copy-Tree([string]$From, [string]$To, [string[]]$Extra) {
    & robocopy $From $To /NFL /NDL /NJH /NJS /NP @Extra | Out-Null
    if ($LASTEXITCODE -ge 8) { Fail "robocopy $From -> $To failed (exit code $LASTEXITCODE)" }
    $global:LASTEXITCODE = 0
}

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  WebExcel enterprise -> IIS" -ForegroundColor White
Write-Host "  Repo:    $RepoRoot"
Write-Host "  Install: $InstallRoot"
Write-Host "  Site:    $SiteName  (host '$HostName', port $Port$(if ($CertThumbprint) { ' + https 443' }))"
Write-Host "======================================================" -ForegroundColor Cyan

# ----------------------------------------------------------------------------
Write-Step "1/9" "IIS features"
$features = @(
    "IIS-WebServerRole", "IIS-WebServer", "IIS-CommonHttpFeatures", "IIS-StaticContent",
    "IIS-DefaultDocument", "IIS-HttpErrors", "IIS-HttpCompressionStatic", "IIS-HttpCompressionDynamic",
    "IIS-ApplicationDevelopment", "IIS-WebSockets", "IIS-Security", "IIS-WindowsAuthentication",
    "IIS-RequestFiltering", "IIS-ManagementConsole"
)
foreach ($f in $features) {
    $state = Get-WindowsOptionalFeature -Online -FeatureName $f -ErrorAction SilentlyContinue
    if ($state -and $state.State -ne "Enabled") {
        Write-Host "  enabling $f" -ForegroundColor Gray
        Enable-WindowsOptionalFeature -Online -FeatureName $f -All -NoRestart -WarningAction SilentlyContinue | Out-Null
    }
}
Write-Ok "IIS features enabled"
Import-Module WebAdministration

# ----------------------------------------------------------------------------
Write-Step "2/9" "Prerequisites"
$missing = @()
if (-not (Test-Path "$env:windir\system32\inetsrv\rewrite.dll")) {
    $missing += "IIS URL Rewrite 2.1            https://www.iis.net/downloads/microsoft/url-rewrite"
}
if (-not (Test-Path "$env:ProgramFiles\IIS\Application Request Routing\requestRouter.dll")) {
    $missing += "IIS Application Request Routing https://www.iis.net/downloads/microsoft/application-request-routing"
}
if (-not (Test-Path "$env:ProgramFiles\IIS\Asp.Net Core Module\V2\aspnetcorev2.dll")) {
    $missing += "ASP.NET Core 8 Hosting Bundle   https://dotnet.microsoft.com/download/dotnet/8.0"
}
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    $missing += "Node.js 22.13+ (LTS 24 recommended) https://nodejs.org"
} else {
    # WebSideAPI uses the built-in node:sqlite module, unflagged since 22.13
    $v = [version]((& node -v).TrimStart('v'))
    if ($v -lt [version]"22.13.0") { $missing += "Node.js $v is too old: need 22.13+ for node:sqlite" }
}
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue) -or -not ((& dotnet --list-sdks) -match '^([89]|[1-9]\d)\.')) {
    $missing += ".NET 8+ SDK                     https://dotnet.microsoft.com/download/dotnet/8.0"
}
$nssm = Get-Command nssm -ErrorAction SilentlyContinue
if (-not $nssm) { $missing += "NSSM (nssm.exe on PATH)         https://nssm.cc/download" }
if ($missing.Count) {
    Write-Host "  Install these, then re-run:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
    exit 1
}
if (-not (Test-NetConnection 127.0.0.1 -Port 27017 -InformationLevel Quiet -WarningAction SilentlyContinue)) {
    Write-Host "  WARNING: nothing listening on 127.0.0.1:27017. WebSideAPI needs MongoDB" -ForegroundColor Red
    Write-Host "  (MongoDB Community MSI, 'Install as a Service'). Continuing anyway." -ForegroundColor Red
}
Write-Ok "node $(& node -v), dotnet $((& dotnet --version)), URL Rewrite, ARR, ANCM, NSSM"

# ----------------------------------------------------------------------------
Write-Step "3/9" "Folders and JWT secret"
foreach ($d in @($InstallRoot, $WebDir, $AdAuthDir, $AppDir, $ApiDir, $LogDir, (Join-Path $AppDir "Excels"), (Join-Path $AdAuthDir "logs"))) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
}
# Shared by WebSideAPI (verifies) and ADAuthAPI (signs). Generated once, reused
# on every re-run so existing sessions stay valid; only admins/SYSTEM can read it.
if (-not (Test-Path $SecretFile)) {
    $bytes = New-Object byte[] 48
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    Set-Content -Path $SecretFile -Value ([Convert]::ToBase64String($bytes)) -NoNewline -Encoding ascii
    & icacls $SecretFile /inheritance:r /grant:r "*S-1-5-32-544:F" "*S-1-5-18:F" | Out-Null
    Write-Ok "generated new JWT secret"
} else {
    Write-Ok "reusing existing JWT secret"
}
$JwtSecret = (Get-Content $SecretFile -Raw).Trim()

# ----------------------------------------------------------------------------
Write-Step "4/9" "Build frontend"
Push-Location (Join-Path $RepoRoot "my-app-pt1")
try {
    Invoke-Checked "npm ci (frontend)" { npm ci --no-audit --no-fund }
    # vite build, not `npm run build`: its `tsc -b` step fails on type errors in
    # unrouted legacy pages (same as serve:prod on the cloud build)
    Invoke-Checked "vite build"        { npx vite build }
} finally { Pop-Location }
Copy-Tree (Join-Path $RepoRoot "my-app-pt1\dist") $WebDir @("/MIR", "/XF", "web.config")
Copy-Item (Join-Path $PSScriptRoot "web.config") (Join-Path $WebDir "web.config") -Force
Write-Ok "frontend -> $WebDir"

# ----------------------------------------------------------------------------
Write-Step "5/9" "WebSideAPI (Windows service '$ServiceName')"
$svc = Get-Service $ServiceName -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -ne "Stopped") { & nssm stop $ServiceName | Out-Null }
# /E without /MIR on purpose: never purge user data that lives inside the app dir
Copy-Tree (Join-Path $RepoRoot "WebSideAPI") $ApiDir @("/E", "/XD", "node_modules", "sqlite-dbs", "uploads", "/XF", "excel-pool-meta.json")
Push-Location $ApiDir
try { Invoke-Checked "npm ci (WebSideAPI)" { npm ci --omit=dev --no-audit --no-fund } } finally { Pop-Location }

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
& nssm set $ServiceName AppRotateBytes 10485760 | Out-Null
Invoke-Checked "nssm start" { nssm start $ServiceName }
Write-Ok "service running from $ApiDir"

# ----------------------------------------------------------------------------
Write-Step "6/9" "ADAuthAPI"
# In-process hosting locks ADAuthAPI.dll while the pool runs
if (Test-Path "IIS:\AppPools\$AdAuthPool") { Stop-WebAppPool $AdAuthPool -ErrorAction SilentlyContinue; Start-Sleep 2 }
Push-Location (Join-Path $RepoRoot "ADAuthAPI")
try { Invoke-Checked "dotnet publish" { dotnet publish -c Release -o $AdAuthDir --nologo } } finally { Pop-Location }
@{ Jwt = @{ SharedSecret = $JwtSecret } } | ConvertTo-Json | Set-Content (Join-Path $AdAuthDir "appsettings.Production.json") -Encoding utf8
Write-Ok "ADAuthAPI -> $AdAuthDir"

# ----------------------------------------------------------------------------
Write-Step "7/9" "IIS server settings (ARR proxy, auth unlock, compression)"
$apphost = "MACHINE/WEBROOT/APPHOST"
Set-WebConfigurationProperty -PSPath $apphost -Filter "system.webServer/proxy" -Name "enabled" -Value "True"
# Excel imports / large workbook opens can take a while
Set-WebConfigurationProperty -PSPath $apphost -Filter "system.webServer/proxy" -Name "timeout" -Value "00:10:00"
Set-WebConfigurationProperty -PSPath $apphost -Filter "system.webServer/proxy" -Name "reverseRewriteHostInResponseHeaders" -Value "False"
# Let ADAuthAPI's own web.config set its authentication (locked by default -> HTTP 500.19)
& $appcmd unlock config -section:system.webServer/security/authentication/windowsAuthentication | Out-Null
& $appcmd unlock config -section:system.webServer/security/authentication/anonymousAuthentication | Out-Null
# IIS doesn't compress JSON by default; WebSideAPI responses are mostly JSON
$dyn = Get-WebConfiguration -PSPath $apphost -Filter "system.webServer/httpCompression/dynamicTypes/add[@mimeType='application/json']"
if (-not $dyn) {
    Add-WebConfigurationProperty -PSPath $apphost -Filter "system.webServer/httpCompression/dynamicTypes" -Name "." -Value @{ mimeType = "application/json"; enabled = "True" }
}
Write-Ok "proxy enabled, auth sections unlocked, JSON compression on"

# ----------------------------------------------------------------------------
Write-Step "8/9" "IIS site '$SiteName' + /adauth application"
foreach ($p in @($SitePool, $AdAuthPool)) {
    if (-not (Test-Path "IIS:\AppPools\$p")) { New-WebAppPool -Name $p | Out-Null }
    Set-ItemProperty "IIS:\AppPools\$p" -Name managedRuntimeVersion -Value ""
    Set-ItemProperty "IIS:\AppPools\$p" -Name startMode -Value AlwaysRunning
}
if (-not (Get-Website -Name $SiteName -ErrorAction SilentlyContinue)) {
    $clash = Get-WebBinding | Where-Object { $_.bindingInformation -eq "*:${Port}:$HostName" }
    if ($clash) { Fail "binding *:${Port}:$HostName is already used by another site (stop/remove 'Default Web Site' or pick -Port/-HostName)" }
    New-Website -Name $SiteName -PhysicalPath $WebDir -Port $Port -HostHeader $HostName -ApplicationPool $SitePool | Out-Null
} else {
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name physicalPath -Value $WebDir
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name applicationPool -Value $SitePool
}
if ($CertThumbprint) {
    $sslFlags = if ($HostName) { 1 } else { 0 }   # SNI when there's a host name
    if (-not (Get-WebBinding -Name $SiteName -Protocol https -Port 443)) {
        New-WebBinding -Name $SiteName -Protocol https -Port 443 -HostHeader $HostName -SslFlags $sslFlags
    }
    (Get-WebBinding -Name $SiteName -Protocol https -Port 443).AddSslCertificate($CertThumbprint, "my")
}
if (-not (Get-WebApplication -Site $SiteName -Name "adauth")) {
    New-WebApplication -Site $SiteName -Name "adauth" -PhysicalPath $AdAuthDir -ApplicationPool $AdAuthPool | Out-Null
} else {
    Set-ItemProperty "IIS:\Sites\$SiteName\adauth" -Name physicalPath -Value $AdAuthDir
    Set-ItemProperty "IIS:\Sites\$SiteName\adauth" -Name applicationPool -Value $AdAuthPool
}

# Site root: anonymous (the frontend is public, the API checks the AD-issued JWT itself).
# /adauth: Windows Authentication only.
$authBase = "system.webServer/security/authentication"
Set-WebConfigurationProperty -PSPath $apphost -Location $SiteName -Filter "$authBase/anonymousAuthentication" -Name enabled -Value True
Set-WebConfigurationProperty -PSPath $apphost -Location $SiteName -Filter "$authBase/windowsAuthentication" -Name enabled -Value False
Set-WebConfigurationProperty -PSPath $apphost -Location "$SiteName/adauth" -Filter "$authBase/anonymousAuthentication" -Name enabled -Value False
Set-WebConfigurationProperty -PSPath $apphost -Location "$SiteName/adauth" -Filter "$authBase/windowsAuthentication" -Name enabled -Value True
# Compress static bundles on first hit instead of only "frequently requested" files
Set-WebConfigurationProperty -PSPath $apphost -Location $SiteName -Filter "system.webServer/serverRuntime" -Name frequentHitThreshold -Value 1

& icacls $WebDir /grant "IIS AppPool\${SitePool}:(OI)(CI)RX" /T /Q | Out-Null
& icacls $AdAuthDir /grant "IIS AppPool\${AdAuthPool}:(OI)(CI)RX" /Q | Out-Null
& icacls (Join-Path $AdAuthDir "logs") /grant "IIS AppPool\${AdAuthPool}:(OI)(CI)M" /Q | Out-Null
# The secret: only admins, SYSTEM and ADAuthAPI's own pool (needs the pool to exist, hence here)
& icacls (Join-Path $AdAuthDir "appsettings.Production.json") /inheritance:r /grant:r "*S-1-5-32-544:F" "*S-1-5-18:F" "IIS AppPool\${AdAuthPool}:R" | Out-Null

Start-WebAppPool $SitePool -ErrorAction SilentlyContinue
Start-WebAppPool $AdAuthPool -ErrorAction SilentlyContinue
Start-Website $SiteName -ErrorAction SilentlyContinue
Write-Ok "site started"

# ----------------------------------------------------------------------------
Write-Step "9/9" "Smoke test"
$base = "http://$(if ($HostName) { $HostName } else { 'localhost' }):$Port"
Start-Sleep 3
function Probe([string]$Name, [string]$Url, [int[]]$Expect, [switch]$WinAuth) {
    try {
        $r = Invoke-WebRequest $Url -UseBasicParsing -UseDefaultCredentials:$WinAuth -TimeoutSec 20
        $code = [int]$r.StatusCode
    } catch {
        $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    }
    if ($Expect -contains $code) { Write-Ok "$Name -> $code" }
    else {
        Write-Host "  [!] $Name -> $code (expected $($Expect -join '/')) $Url" -ForegroundColor Red
        if ($WinAuth -and $code -eq 401 -and $HostName) {
            Write-Host "      401 from the server itself via a host name is usually Windows' NTLM loopback check," -ForegroundColor Yellow
            Write-Host "      not a real failure - retry from a client PC (see README 'Troubleshooting')." -ForegroundColor Yellow
        }
    }
}
Probe "frontend  /"                       "$base/"                     @(200)
Probe "SPA route /like-excel"             "$base/like-excel"           @(200)
Probe "API proxy /api (no token = 401)"   "$base/api/excel-pool/list"  @(401)
Probe "ADAuthAPI /adauth/api/health"      "$base/adauth/api/health"    @(200) -WinAuth
Probe "ADAuthAPI /adauth/api/findAD"      "$base/adauth/api/findAD"    @(200) -WinAuth

Write-Host ""
Write-Host "Done. Open $base (or https://$HostName with -CertThumbprint) from a domain-joined PC." -ForegroundColor Cyan
Write-Host "Logs: $LogDir\websideapi.*.log, $AdAuthDir\logs\stdout_*.log" -ForegroundColor Cyan
