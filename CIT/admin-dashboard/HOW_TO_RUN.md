# VaultDrive Admin Dashboard — Step-by-Step Run & Deployment Guide

This guide provides complete instructions on how to set up, run, and test the **VaultDrive Admin Dashboard** (Air-Gapped Security Key Provisioning System).

---

## 📌 Prerequisites

Before running the application, make sure you have the following installed on your machine:
- **Node.js**: v18.x or higher (recommended v20+)
- **npm**: v9.x or higher (comes with Node.js)
- **OS**: Windows 10/11 (for native PowerShell USB drive detection) or any OS (using built-in Mock USB mode)

---

## 🚀 Quick Start (Running the Dashboard)

### Step 1: Open Terminal in the Project Directory

> ⚠️ **Important**: The `package.json` file is located inside `d:\Minerva\CIT\admin-dashboard`, **not** in the repository root (`d:\Minerva`). Running `npm` commands directly in `d:\Minerva` will cause an `ENOENT` error.

Open PowerShell or Command Prompt and navigate to the project directory:

```powershell
cd d:\Minerva\CIT\admin-dashboard
```

---

### Step 2: Install Dependencies (If running for the first time)

If `node_modules` is missing or missing packages:

```powershell
npm install
```

---

### Step 3: Start the Development Server

Run the following command to start the Next.js development server:

```powershell
npm run dev
```

You should see output similar to:
```text
▲ Next.js 16.3.0 (Turbopack)
- Local:         http://localhost:3000
- Network:       http://10.9.116.79:3000
✓ Ready in 2-3s
```

---

### Step 4: Access the Dashboard

Open your web browser and navigate to:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🛠️ Dashboard Workflow & Testing

Once the dashboard is open in your browser, follow these steps to test the provisioning workflow:

1. **Step 1: Master Cryptographic Key Status**
   - Click **Generate Master Key** (if no key exists yet).
   - The server will generate a 256-bit AES cryptographic key saved to `CIT/admin-dashboard/data/master.key`.
   - Once generated, the dashboard will display **Key Active & Valid**.

2. **Step 2: Detect Target USB Drive**
   - Insert a physical USB flash drive (e.g. Drive `E:\` or `F:\`), OR
   - Select **Mock USB (Development)** which uses the local `mock-usb-drive/` folder.
   - Click **Refresh Drives** to detect plugged-in drives.

3. **Step 3: Provision Target Drive**
   - Click **Provision Drive**.
   - The application creates a hidden `.vaultdrive` directory structure on the target drive containing:
     - `master.key` & `master.meta.json`
     - `provision.json` manifest
     - `/logs`, `/quarantine`, and `/updates` folders

---

## 🔧 Production Build & Deployment

To test or run the production build instead of dev mode:

```powershell
# 1. Navigate to project directory
cd d:\Minerva\CIT\admin-dashboard

# 2. Build the application
npm run build

# 3. Start production server
npm start
```

---

## ⚡ Troubleshooting Common Errors

### 🔴 Error: `ENOENT: no such file or directory, open 'D:\Minerva\package.json'`
* **Cause**: You ran `npm run dev` inside `d:\Minerva` instead of the project directory.
* **Fix**: Change directory first:
  ```powershell
  cd d:\Minerva\CIT\admin-dashboard
  npm run dev
  ```

### 🔴 Port 3000 is already in use
* **Fix**: Run on a custom port:
  ```powershell
  npx next dev -p 3001
  ```

### 🔴 Physical USB Drive Not Detected
* **Cause**: On Windows, drive detection uses PowerShell CIM query `Win32_LogicalDisk` filtering for `DriveType -eq 2` (Removable).
* **Fix**: Ensure your USB drive is formatted (FAT32/NTFS/exFAT) and assigned a drive letter in Windows. Alternatively, use the built-in **Mock USB (Development)** drive option.

---

## 📁 Project Directory Structure

```text
d:\Minerva\CIT\admin-dashboard\
├── data/                    # Generated master cryptographic keys
├── mock-usb-drive/          # Local fallback directory for USB testing
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── key/         # Key generation & status endpoints
│   │   │   └── usb/         # Drive detection & provisioning endpoints
│   │   ├── globals.css      # Styling & design system
│   │   └── page.tsx         # VaultDrive Admin Dashboard UI
└── package.json
```
