@echo off
echo Starting VaultDrive Admin Dashboard...
start "Admin Dashboard" cmd /k "cd admin-dashboard && npm run dev"

echo Starting VaultDrive Client...
start "VaultDrive Client" cmd /k "cd vaultdrive-client && npm run tauri dev"

echo All services are starting up!
