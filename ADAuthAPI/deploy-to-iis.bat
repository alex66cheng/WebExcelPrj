@echo off
REM ============================================
REM ADAuthAPI - IIS Deployment Script
REM ============================================
REM Run this script as Administrator on Windows
REM ============================================

echo.
echo ========================================
echo ADAuthAPI IIS Deployment Script
echo ========================================
echo.

REM Set variables
set PUBLISH_PATH=C:\inetpub\wwwroot\ADAuthAPI
set SITE_NAME=ADAuthAPI
set APP_POOL_NAME=ADAuthAPIPool
set PORT=5000

REM Step 1: Publish the application
echo [1/6] Publishing application...
dotnet publish -c Release -o "%PUBLISH_PATH%"
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Publish failed!
    pause
    exit /b 1
)
echo Published to %PUBLISH_PATH%
echo.

REM Step 2: Create logs directory
echo [2/6] Creating logs directory...
if not exist "%PUBLISH_PATH%\logs" mkdir "%PUBLISH_PATH%\logs"
echo.

REM Step 3: Create Application Pool
echo [3/6] Creating Application Pool...
%windir%\system32\inetsrv\appcmd.exe delete apppool /apppool.name:"%APP_POOL_NAME%" 2>nul
%windir%\system32\inetsrv\appcmd.exe add apppool /name:"%APP_POOL_NAME%" /managedRuntimeVersion:"" /managedPipelineMode:Integrated
%windir%\system32\inetsrv\appcmd.exe set apppool /apppool.name:"%APP_POOL_NAME%" /processModel.identityType:ApplicationPoolIdentity
echo.

REM Step 4: Delete existing site if exists
echo [4/6] Removing existing site (if any)...
%windir%\system32\inetsrv\appcmd.exe delete site /site.name:"%SITE_NAME%" 2>nul
echo.

REM Step 5: Create IIS Website
echo [5/6] Creating IIS Website...
%windir%\system32\inetsrv\appcmd.exe add site /name:"%SITE_NAME%" /physicalPath:"%PUBLISH_PATH%" /bindings:http/*:%PORT%:
%windir%\system32\inetsrv\appcmd.exe set site /site.name:"%SITE_NAME%" /[path='/'].applicationPool:"%APP_POOL_NAME%"
echo.

REM Step 6: Configure Windows Authentication
echo [6/6] Configuring Windows Authentication...
%windir%\system32\inetsrv\appcmd.exe set config "%SITE_NAME%" /section:windowsAuthentication /enabled:true
%windir%\system32\inetsrv\appcmd.exe set config "%SITE_NAME%" /section:anonymousAuthentication /enabled:false
echo.

echo ========================================
echo Deployment Complete!
echo ========================================
echo.
echo Site URL: http://localhost:%PORT%
echo Test URL: http://localhost:%PORT%/api/health
echo AD API:   http://localhost:%PORT%/api/findAD
echo.
echo IMPORTANT: Make sure the following IIS features are enabled:
echo   - Windows Authentication
echo   - ASP.NET Core Module (ANCM)
echo.
echo To install ASP.NET Core Hosting Bundle:
echo   https://dotnet.microsoft.com/download/dotnet/8.0
echo   Download: ASP.NET Core Runtime Hosting Bundle
echo.
pause
