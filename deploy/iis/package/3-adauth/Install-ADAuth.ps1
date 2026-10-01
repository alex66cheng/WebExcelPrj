#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Part 3: publishes ADAuthAPI (C# / .NET 8, already compiled) as the IIS application
    https://faapp.pist.com.tw/WebExcelAuth with Windows Authentication only.
    Safe to re-run: binaries are replaced, appsettings.Production.json is rewritten.

.DESCRIPTION
    The frontend calls /WebExcelAuth/api/findAD; IIS negotiates Kerberos/NTLM, ADAuthAPI
    reads the user's AD mail/display name and signs a JWT with the secret shared with
    Part 2. The path is baked into the frontend build (VITE_AD_AUTH_PATH), so a different
    -AppPath needs a rebuild (deploy/iis/build-packages.sh AUTH_PATH=...).

    The server must be domain-joined. Needs the ASP.NET Core 8 Hosting Bundle
    (runtime only - no SDK); install it after IIS, or repair it afterwards.
#>
param(
    [string]$SiteName     = "Default Web Site",
    [string]$AppPath      = "/WebExcelAuth",
    [string]$PhysicalPath = "C:\inetpub\wwwroot\WebExcelAuth",
    [string]$AppPool      = "WebExcelAuth",
    [string]$SecretFile   = "C:\WebExcel\jwt-secret.txt",
    [string]$SiteUrl      = "https://faapp.pist.com.tw"
)
. (Join-Path $PSScriptRoot "..\Common.ps1")
$Source = Join-Path $PSScriptRoot "app"

Write-Host "== Part 3: ADAuthAPI -> $SiteName$AppPath ($PhysicalPath)" -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $Source "ADAuthAPI.dll"))) { Fail "$Source\ADAuthAPI.dll missing - is this the extracted package?" }

Write-Step "1/4" "IIS features and ASP.NET Core Module"
Enable-IisFeatures @("IIS-WebServerRole", "IIS-WebServer", "IIS-Security", "IIS-WindowsAuthentication", "IIS-ManagementConsole")
if (-not (Test-Path "$env:ProgramFiles\IIS\Asp.Net Core Module\V2\aspnetcorev2.dll")) {
    Fail "ASP.NET Core 8 Hosting Bundle missing: https://dotnet.microsoft.com/download/dotnet/8.0 (then re-run)"
}
# Let ADAuthAPI's own web.config set its authentication (locked by default -> HTTP 500.19)
$appcmd = "$env:windir\system32\inetsrv\appcmd.exe"
& $appcmd unlock config -section:system.webServer/security/authentication/windowsAuthentication | Out-Null
& $appcmd unlock config -section:system.webServer/security/authentication/anonymousAuthentication | Out-Null
Write-Ok "Windows Authentication, ANCM V2"

Write-Step "2/4" "JWT secret"
$JwtSecret = Get-JwtSecret $SecretFile

Write-Step "3/4" "Copy app and create IIS application"
# In-process hosting locks ADAuthAPI.dll while the pool runs
if (Test-Path "IIS:\AppPools\$AppPool") { Stop-WebAppPool $AppPool -ErrorAction SilentlyContinue; Start-Sleep 2 }
New-Item -ItemType Directory -Force -Path $PhysicalPath | Out-Null
Copy-Tree $Source $PhysicalPath @("/MIR", "/XD", "logs", "/XF", "appsettings.Production.json")
New-Item -ItemType Directory -Force -Path (Join-Path $PhysicalPath "logs") | Out-Null
$settings = Join-Path $PhysicalPath "appsettings.Production.json"
@{ Jwt = @{ SharedSecret = $JwtSecret } } | ConvertTo-Json | Set-Content $settings -Encoding utf8
Set-IisApp $SiteName $AppPath $PhysicalPath $AppPool
Set-IisAuth $SiteName $AppPath -Anonymous $false -Windows $true
& icacls $PhysicalPath /grant "IIS AppPool\${AppPool}:(OI)(CI)RX" /Q | Out-Null
& icacls (Join-Path $PhysicalPath "logs") /grant "IIS AppPool\${AppPool}:(OI)(CI)M" /Q | Out-Null
# The secret: only admins, SYSTEM and this app's own pool
& icacls $settings /inheritance:r /grant:r "*S-1-5-32-544:F" "*S-1-5-18:F" "IIS AppPool\${AppPool}:R" | Out-Null
Start-WebAppPool $AppPool -ErrorAction SilentlyContinue
Write-Ok "$SiteName$AppPath -> $PhysicalPath (pool $AppPool)"

Write-Step "4/4" "Smoke test"
Start-Sleep 3
Test-Url "ADAuthAPI $AppPath/api/health" "$SiteUrl$AppPath/api/health" @(200) -WinAuth
Test-Url "ADAuthAPI $AppPath/api/findAD" "$SiteUrl$AppPath/api/findAD" @(200) -WinAuth
Write-Host ""
Write-Host "ADAuthAPI done. Logs: $PhysicalPath\logs\stdout_*.log" -ForegroundColor Cyan
exit 0
