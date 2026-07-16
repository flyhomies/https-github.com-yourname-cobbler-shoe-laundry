
@echo off
title COBBLER SHOE LAUNDRY
cls
echo ====================================
echo   COBBLER SHOE LAUNDRY
echo   Starting Application...
echo ====================================
cd /d "%~dp0"

echo.
echo [1/4] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)
node --version
echo OK

echo.
echo [2/4] Starting Server...
start "COBBLER SERVER" cmd /k "npm start"
if errorlevel 1 (
    echo ERROR: Failed to start server!
    echo.
    pause
    exit /b 1
)
echo OK

echo.
echo [3/4] Waiting for server to start...
echo Waiting 4 seconds...
timeout /t 4 /nobreak >nul
echo OK

echo.
echo [4/4] Opening Browser...
start "" "http://localhost:5000"
if errorlevel 1 (
    echo WARNING: Could not open browser automatically.
    echo Please open: http://localhost:5000
) else (
    echo OK
)

echo.
echo ====================================
echo   Application is running!
echo   URL: http://localhost:5000
echo.
echo   Server window: COBBLER SERVER
echo.
echo   To stop, close the COBBLER SERVER window or press Ctrl+C there.
echo ====================================
echo.
echo Press any key to close this window (server continues running)...
pause >nul
