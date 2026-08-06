#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Sets up IIS for ADAuthAPI with Windows Authentication

.DESCRIPTION
    This script:
    1. Enables required IIS features
    2. Publishes the .NET application
    3. Creates IIS Application Pool and Website
    4. Configures Windows Authentication

.EXAMPLE
    .\Setup-IIS.ps1
#>

param(
    [string]$SiteName = "ADAuthAPI",
    [string]$AppPoolName = "ADAuthAPIPool",
    [string]$PublishPath = "C:\inetpub\wwwroot\ADAuthAPI",
    [int]$Port = 5000
)

$ErrorActionPreference = "Stop"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "ADAuthAPI IIS Setup Script" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check and Enable IIS Features
Write-Host "[1/7] Checking IIS Features..." -ForegroundColor Yellow

$features = @(
    "IIS-WebServerRole",
    "IIS-WebServer",
    "IIS-CommonHttpFeatures",
    "IIS-StaticContent",
    "IIS-DefaultDocument",
    "IIS-HttpErrors",
    "IIS-ApplicationDevelopment",
    "IIS-NetFxExtensibility45",
    "IIS-ASPNET45",
    "IIS-ISAPIExtensions",
    "IIS-ISAPIFilter",
    "IIS-Security",
    "IIS-WindowsAuthentication",
    "IIS-RequestFiltering",
    "IIS-ManagementConsole"
)

foreach ($feature in $features) {
    $state = Get-WindowsOptionalFeature -Online -FeatureName $feature -ErrorAction SilentlyContinue
    if ($state.State -ne "Enabled") {
        Write-Host "  Enabling $feature..." -ForegroundColor Gray
        Enable-WindowsOptionalFeature -Online -FeatureName $feature -NoRestart -All | Out-Null
    }
}
Write-Host "  IIS Features verified." -ForegroundColor Green

# Step 2: Check for ASP.NET Core Hosting Bundle
Write-Host ""
Write-Host "[2/7] Checking ASP.NET Core Module..." -ForegroundColor Yellow

$ancmPath = "$env:ProgramFiles\IIS\Asp.Net Core Module\V2\aspnetcorev2.dll"
if (-not (Test-Path $ancmPath)) {
    Write-Host "  WARNING: ASP.NET Core Hosting Bundle may not be installed!" -ForegroundColor Red
    Write-Host "  Download from: https://dotnet.microsoft.com/download/dotnet/8.0" -ForegroundColor Yellow
    Write-Host "  Install the 'Hosting Bundle' and run this script again." -ForegroundColor Yellow
    Write-Host ""
    $continue = Read-Host "Continue anyway? (y/n)"
    if ($continue -ne "y") { exit 1 }
} else {
    Write-Host "  ASP.NET Core Module found." -ForegroundColor Green
}

# Step 3: Publish Application
Write-Host ""
Write-Host "[3/7] Publishing application..." -ForegroundColor Yellow

$projectPath = $PSScriptRoot
Push-Location $projectPath
try {
    dotnet publish -c Release -o $PublishPath --nologo
    if ($LASTEXITCODE -ne 0) { throw "Publish failed" }
    Write-Host "  Published to $PublishPath" -ForegroundColor Green
} finally {
    Pop-Location
}

# Step 4: Create logs directory
Write-Host ""
Write-Host "[4/7] Creating logs directory..." -ForegroundColor Yellow
$logsPath = Join-Path $PublishPath "logs"
if (-not (Test-Path $logsPath)) {
    New-Item -ItemType Directory -Path $logsPath | Out-Null
}
Write-Host "  Logs directory ready." -ForegroundColor Green

# Step 5: Import IIS Module and Create App Pool
Write-Host ""
Write-Host "[5/7] Configuring Application Pool..." -ForegroundColor Yellow

Import-Module WebAdministration -ErrorAction SilentlyContinue

# Remove existing app pool if exists
if (Test-Path "IIS:\AppPools\$AppPoolName") {
    Remove-WebAppPool -Name $AppPoolName
    Start-Sleep -Seconds 2
}

# Create new app pool
New-WebAppPool -Name $AppPoolName
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name "managedRuntimeVersion" -Value ""
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name "processModel.identityType" -Value "ApplicationPoolIdentity"
Write-Host "  Application Pool '$AppPoolName' created." -ForegroundColor Green

# Step 6: Create Website
Write-Host ""
Write-Host "[6/7] Creating IIS Website..." -ForegroundColor Yellow

# Remove existing site if exists
if (Get-Website -Name $SiteName -ErrorAction SilentlyContinue) {
    Remove-Website -Name $SiteName
    Start-Sleep -Seconds 2
}

# Check if port is in use
$existingSite = Get-Website | Where-Object { $_.Bindings.Collection.bindingInformation -like "*:$Port:*" }
if ($existingSite) {
    Write-Host "  WARNING: Port $Port is already used by site '$($existingSite.Name)'" -ForegroundColor Red
    $newPort = Read-Host "Enter a different port number"
    $Port = [int]$newPort
}

# Create new website
New-Website -Name $SiteName -PhysicalPath $PublishPath -Port $Port -ApplicationPool $AppPoolName
Write-Host "  Website '$SiteName' created on port $Port." -ForegroundColor Green

# Step 7: Configure Authentication
Write-Host ""
Write-Host "[7/7] Configuring Windows Authentication..." -ForegroundColor Yellow

Set-WebConfigurationProperty -Filter "/system.webServer/security/authentication/windowsAuthentication" `
    -Name "enabled" -Value "True" -PSPath "IIS:\Sites\$SiteName"

Set-WebConfigurationProperty -Filter "/system.webServer/security/authentication/anonymousAuthentication" `
    -Name "enabled" -Value "False" -PSPath "IIS:\Sites\$SiteName"

Write-Host "  Windows Authentication enabled." -ForegroundColor Green
Write-Host "  Anonymous Authentication disabled." -ForegroundColor Green

# Start the site
Start-Website -Name $SiteName

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Site URL:    http://localhost:$Port" -ForegroundColor White
Write-Host "Health API:  http://localhost:$Port/api/health" -ForegroundColor White
Write-Host "AD API:      http://localhost:$Port/api/findAD" -ForegroundColor White
Write-Host ""
Write-Host "Test the API by opening in browser:" -ForegroundColor Yellow
Write-Host "  http://localhost:$Port/api/findAD" -ForegroundColor Cyan
Write-Host ""

# Test the health endpoint
Write-Host "Testing health endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "http://localhost:$Port/api/health" -Method Get -TimeoutSec 10
    Write-Host "  Health check: $($response.status)" -ForegroundColor Green
} catch {
    Write-Host "  Health check failed. The site may need a moment to start." -ForegroundColor Red
    Write-Host "  Try again in a few seconds." -ForegroundColor Yellow
}
