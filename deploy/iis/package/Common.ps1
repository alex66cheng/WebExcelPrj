# Helpers dot-sourced by the three Install-*.ps1 scripts.
$ErrorActionPreference = "Stop"

function Write-Step([string]$Step, [string]$Message) {
    Write-Host ""
    Write-Host "[$Step] $Message" -ForegroundColor Yellow
}
function Write-Ok([string]$Message) { Write-Host "  [OK] $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "  [!] $Message" -ForegroundColor Red }
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

function Enable-IisFeatures([string[]]$Names) {
    foreach ($f in $Names) {
        $state = Get-WindowsOptionalFeature -Online -FeatureName $f -ErrorAction SilentlyContinue
        if ($state -and $state.State -ne "Enabled") {
            Write-Host "  enabling $f" -ForegroundColor Gray
            Enable-WindowsOptionalFeature -Online -FeatureName $f -All -NoRestart -WarningAction SilentlyContinue | Out-Null
        }
    }
    Import-Module WebAdministration
}

# Shared by WebSideAPI (verifies) and ADAuthAPI (signs). Created once by whichever
# installer runs first and reused afterwards, so sessions survive redeploys. Only
# Administrators and SYSTEM can read the file.
function Get-JwtSecret([string]$SecretFile) {
    if (-not (Test-Path $SecretFile)) {
        New-Item -ItemType Directory -Force -Path (Split-Path $SecretFile) | Out-Null
        $bytes = New-Object byte[] 48
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        Set-Content -Path $SecretFile -Value ([Convert]::ToBase64String($bytes)) -NoNewline -Encoding ascii
        & icacls $SecretFile /inheritance:r /grant:r "*S-1-5-32-544:F" "*S-1-5-18:F" | Out-Null
        Write-Ok "generated new JWT secret -> $SecretFile"
    } else {
        Write-Ok "reusing JWT secret $SecretFile"
    }
    return (Get-Content $SecretFile -Raw).Trim()
}

# IIS application (not a virtual directory) with its own "No Managed Code" pool
function Set-IisApp([string]$Site, [string]$AppPath, [string]$PhysicalPath, [string]$Pool) {
    if (-not (Get-Website -Name $Site -ErrorAction SilentlyContinue)) {
        Fail "IIS site '$Site' not found (pass -SiteName; Get-Website lists them)"
    }
    if (-not (Test-Path "IIS:\AppPools\$Pool")) { New-WebAppPool -Name $Pool | Out-Null }
    Set-ItemProperty "IIS:\AppPools\$Pool" -Name managedRuntimeVersion -Value ""
    Set-ItemProperty "IIS:\AppPools\$Pool" -Name startMode -Value AlwaysRunning
    $name = $AppPath.Trim('/')
    if (-not (Get-WebApplication -Site $Site -Name $name)) {
        New-WebApplication -Site $Site -Name $name -PhysicalPath $PhysicalPath -ApplicationPool $Pool | Out-Null
    } else {
        Set-ItemProperty "IIS:\Sites\$Site\$name" -Name physicalPath -Value $PhysicalPath
        Set-ItemProperty "IIS:\Sites\$Site\$name" -Name applicationPool -Value $Pool
    }
}

function Set-IisAuth([string]$Site, [string]$AppPath, [bool]$Anonymous, [bool]$Windows) {
    $apphost = "MACHINE/WEBROOT/APPHOST"
    $loc = "$Site/$($AppPath.Trim('/'))"
    $authBase = "system.webServer/security/authentication"
    Set-WebConfigurationProperty -PSPath $apphost -Location $loc -Filter "$authBase/anonymousAuthentication" -Name enabled -Value $Anonymous
    Set-WebConfigurationProperty -PSPath $apphost -Location $loc -Filter "$authBase/windowsAuthentication" -Name enabled -Value $Windows
}

function Test-Url([string]$Name, [string]$Url, [int[]]$Expect, [switch]$WinAuth) {
    try {
        $r = Invoke-WebRequest $Url -UseBasicParsing -UseDefaultCredentials:$WinAuth -TimeoutSec 20
        $code = [int]$r.StatusCode
    } catch {
        $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    }
    if ($Expect -contains $code) { Write-Ok "$Name -> $code" }
    else {
        Write-Warn "$Name -> $code (expected $($Expect -join '/')) $Url"
        if ($WinAuth -and $code -eq 401) {
            Write-Host "      401 when the server calls its own host name is usually Windows' NTLM loopback" -ForegroundColor Yellow
            Write-Host "      check, not a real failure - open the URL from a client PC (README, Troubleshooting)." -ForegroundColor Yellow
        }
        if ($code -eq 0) {
            Write-Host "      no response: is $Url reachable from this server (DNS / binding / certificate)?" -ForegroundColor Yellow
        }
    }
}
