#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Complete IIS Deployment Script for ADAuthAPI

.DESCRIPTION
    Run this script on Windows Server/Windows 10+ with Administrator privileges.
    It will:
    1. Install .NET SDK if needed
    2. Enable IIS features
    3. Build and publish the application
    4. Configure IIS with Windows Authentication

.EXAMPLE
    .\Deploy-Complete.ps1
#>

param(
    [string]$SiteName = "ADAuthAPI",
    [string]$AppPoolName = "ADAuthAPIPool",
    [string]$PublishPath = "C:\inetpub\wwwroot\ADAuthAPI",
    [int]$Port = 5000
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

function Write-Step {
    param([string]$Step, [string]$Message)
    Write-Host ""
    Write-Host "[$Step] $Message" -ForegroundColor Yellow
    Write-Host ("-" * 50) -ForegroundColor DarkGray
}

function Write-Success {
    param([string]$Message)
    Write-Host "  [OK] $Message" -ForegroundColor Green
}

function Write-Info {
    param([string]$Message)
    Write-Host "  $Message" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   ADAuthAPI - IIS Deployment Script" -ForegroundColor White
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "   Site Name:    $SiteName"
Write-Host "   Port:         $Port"
Write-Host "   Publish Path: $PublishPath"
Write-Host "======================================================" -ForegroundColor Cyan

# ============================================
# Step 1: Check .NET SDK
# ============================================
Write-Step "1/8" "Checking .NET SDK..."

$dotnetVersion = $null
try {
    $dotnetVersion = & dotnet --version 2>$null
} catch {}

if ($dotnetVersion) {
    Write-Success ".NET SDK found: $dotnetVersion"
} else {
    Write-Host "  .NET SDK not found. Please install from:" -ForegroundColor Red
    Write-Host "  https://dotnet.microsoft.com/download/dotnet/8.0" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Download and install '.NET 8.0 SDK' then run this script again." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# ============================================
# Step 2: Check/Install IIS Features
# ============================================
Write-Step "2/8" "Enabling IIS Features..."

$features = @(
    @{Name="IIS-WebServerRole"; Desc="Web Server (IIS)"},
    @{Name="IIS-WebServer"; Desc="Web Server"},
    @{Name="IIS-CommonHttpFeatures"; Desc="Common HTTP Features"},
    @{Name="IIS-StaticContent"; Desc="Static Content"},
    @{Name="IIS-DefaultDocument"; Desc="Default Document"},
    @{Name="IIS-HttpErrors"; Desc="HTTP Errors"},
    @{Name="IIS-ApplicationDevelopment"; Desc="Application Development"},
    @{Name="IIS-NetFxExtensibility45"; Desc=".NET Extensibility 4.5"},
    @{Name="IIS-ASPNET45"; Desc="ASP.NET 4.5"},
    @{Name="IIS-ISAPIExtensions"; Desc="ISAPI Extensions"},
    @{Name="IIS-ISAPIFilter"; Desc="ISAPI Filters"},
    @{Name="IIS-Security"; Desc="Security"},
    @{Name="IIS-WindowsAuthentication"; Desc="Windows Authentication"},
    @{Name="IIS-RequestFiltering"; Desc="Request Filtering"},
    @{Name="IIS-ManagementConsole"; Desc="IIS Management Console"}
)

$enabledCount = 0
foreach ($feature in $features) {
    $state = Get-WindowsOptionalFeature -Online -FeatureName $feature.Name -ErrorAction SilentlyContinue
    if ($state.State -ne "Enabled") {
        Write-Host "  Enabling $($feature.Desc)..." -ForegroundColor Gray
        Enable-WindowsOptionalFeature -Online -FeatureName $feature.Name -NoRestart -All -WarningAction SilentlyContinue | Out-Null
        $enabledCount++
    }
}

if ($enabledCount -gt 0) {
    Write-Success "Enabled $enabledCount IIS features"
} else {
    Write-Success "All IIS features already enabled"
}

# ============================================
# Step 3: Check ASP.NET Core Hosting Bundle
# ============================================
Write-Step "3/8" "Checking ASP.NET Core Hosting Bundle..."

$ancmDll = "$env:ProgramFiles\IIS\Asp.Net Core Module\V2\aspnetcorev2.dll"
$ancmInstalled = Test-Path $ancmDll

if ($ancmInstalled) {
    Write-Success "ASP.NET Core Module V2 found"
} else {
    Write-Host "  ASP.NET Core Hosting Bundle NOT found!" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Please download and install from:" -ForegroundColor Yellow
    Write-Host "  https://dotnet.microsoft.com/download/dotnet/8.0" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Look for: 'Hosting Bundle' under ASP.NET Core Runtime 8.0.x" -ForegroundColor Yellow
    Write-Host ""

    $openUrl = Read-Host "Open download page in browser? (y/n)"
    if ($openUrl -eq "y") {
        Start-Process "https://dotnet.microsoft.com/download/dotnet/8.0"
    }

    Write-Host ""
    Write-Host "After installing the Hosting Bundle, run this script again." -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

# ============================================
# Step 4: Restore & Publish Application
# ============================================
Write-Step "4/8" "Building and publishing application..."

Push-Location $scriptDir
try {
    Write-Host "  Restoring packages..." -ForegroundColor Gray
    & dotnet restore --nologo -v q
    if ($LASTEXITCODE -ne 0) { throw "Restore failed" }

    Write-Host "  Publishing Release build..." -ForegroundColor Gray
    & dotnet publish -c Release -o $PublishPath --nologo -v q
    if ($LASTEXITCODE -ne 0) { throw "Publish failed" }

    Write-Success "Published to $PublishPath"
} catch {
    Write-Host "  BUILD FAILED: $_" -ForegroundColor Red
    exit 1
} finally {
    Pop-Location
}

# ============================================
# Step 5: Create logs directory
# ============================================
Write-Step "5/8" "Creating logs directory..."

$logsPath = Join-Path $PublishPath "logs"
if (-not (Test-Path $logsPath)) {
    New-Item -ItemType Directory -Path $logsPath -Force | Out-Null
}
Write-Success "Logs directory: $logsPath"

# ============================================
# Step 6: Configure Application Pool
# ============================================
Write-Step "6/8" "Configuring Application Pool..."

Import-Module WebAdministration -ErrorAction Stop

# Remove existing pool
if (Test-Path "IIS:\AppPools\$AppPoolName") {
    Write-Host "  Removing existing pool..." -ForegroundColor Gray
    Stop-WebAppPool -Name $AppPoolName -ErrorAction SilentlyContinue
    Remove-WebAppPool -Name $AppPoolName
    Start-Sleep -Seconds 1
}

# Create new pool
New-WebAppPool -Name $AppPoolName | Out-Null
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name "managedRuntimeVersion" -Value ""
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name "processModel.identityType" -Value "ApplicationPoolIdentity"
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name "startMode" -Value "AlwaysRunning"

Write-Success "Application Pool '$AppPoolName' configured"

# ============================================
# Step 7: Configure Website
# ============================================
Write-Step "7/8" "Configuring IIS Website..."

# Remove existing site
$existingSite = Get-Website -Name $SiteName -ErrorAction SilentlyContinue
if ($existingSite) {
    Write-Host "  Removing existing site..." -ForegroundColor Gray
    Stop-Website -Name $SiteName -ErrorAction SilentlyContinue
    Remove-Website -Name $SiteName
    Start-Sleep -Seconds 1
}

# Check port availability
$portInUse = Get-Website | Where-Object {
    $_.Bindings.Collection | Where-Object { $_.bindingInformation -like "*:$Port:*" }
}
if ($portInUse) {
    Write-Host "  Port $Port is in use by: $($portInUse.Name)" -ForegroundColor Red
    $newPort = Read-Host "  Enter different port"
    $Port = [int]$newPort
}

# Create website
New-Website -Name $SiteName `
    -PhysicalPath $PublishPath `
    -Port $Port `
    -ApplicationPool $AppPoolName | Out-Null

Write-Success "Website '$SiteName' created on port $Port"

# ============================================
# Step 8: Configure Authentication
# ============================================
Write-Step "8/8" "Configuring Windows Authentication..."

# Enable Windows Auth
Set-WebConfigurationProperty `
    -Filter "/system.webServer/security/authentication/windowsAuthentication" `
    -Name "enabled" -Value "True" `
    -PSPath "IIS:\Sites\$SiteName"

# Disable Anonymous Auth
Set-WebConfigurationProperty `
    -Filter "/system.webServer/security/authentication/anonymousAuthentication" `
    -Name "enabled" -Value "False" `
    -PSPath "IIS:\Sites\$SiteName"

Write-Success "Windows Authentication: ENABLED"
Write-Success "Anonymous Authentication: DISABLED"

# Start the site
Start-Website -Name $SiteName
Start-WebAppPool -Name $AppPoolName

# ============================================
# Done - Test the API
# ============================================
Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host "   DEPLOYMENT COMPLETE!" -ForegroundColor White
Write-Host "======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "   API Endpoints:" -ForegroundColor Cyan
Write-Host "   Health:  http://localhost:$Port/api/health" -ForegroundColor White
Write-Host "   AD Auth: http://localhost:$Port/api/findAD" -ForegroundColor White
Write-Host ""
Write-Host "======================================================" -ForegroundColor Green
Write-Host ""

# Test health endpoint
Write-Host "Testing API..." -ForegroundColor Yellow
Start-Sleep -Seconds 2

try {
    $health = Invoke-RestMethod -Uri "http://localhost:$Port/api/health" -TimeoutSec 10
    Write-Host "  Health Check: $($health.status)" -ForegroundColor Green

    # Test AD endpoint
    $ad = Invoke-RestMethod -Uri "http://localhost:$Port/api/findAD" -UseDefaultCredentials -TimeoutSec 10
    if ($ad.authenticated) {
        Write-Host "  AD User: $($ad.fullName)" -ForegroundColor Green
    }
} catch {
    Write-Host "  API test failed - site may need a moment to warm up" -ForegroundColor Yellow
    Write-Host "  Try opening in browser: http://localhost:$Port/api/findAD" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Open browser to test: http://localhost:$Port/api/findAD" -ForegroundColor Cyan
Write-Host ""
