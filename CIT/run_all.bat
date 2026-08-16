@echo off
:: Check for Administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting administrative privileges...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

:: Ensure the script runs from its own directory
cd /d "%~dp0"

echo Starting VaultDrive Admin Dashboard...
start "Admin Dashboard" cmd /k "cd admin-dashboard && npm run dev"

echo Starting VaultDrive Client...
start "VaultDrive Client" cmd /k "cd vaultdrive-client && npm run tauri dev"

echo All services are starting up!

