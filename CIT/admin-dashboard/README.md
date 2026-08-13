This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

---

# VaultDrive - Zero-Trust Offline Airlock for Banking Infrastructure

VaultDrive is an air-gapped file transfer system designed for banking environments. It enforces zero-trust security by scanning every file through YARA rules, entropy analysis, and financial DLP (Data Loss Prevention) before allowing transfer to or from a provisioned USB drive. The system consists of three components that work together in an offline loop.

## Architecture Overview

```
Admin Dashboard (Next.js)           VaultDrive Client (Tauri + React)
  - Generate Master Key               - Detect & lock USB drives
  - Provision USB drives               - Dual-pane file browser
  - Import compliance logs             - Scan files before transfer
  - Push threat intel updates          - Quarantine blocked files
        |                                      |
        v                                      v
   USB Drive (.vaultdrive/)            Scanning Engine (Rust)
     master.key                          - YARA rule matching
     logs/*.json                         - Shannon entropy analysis
     quarantine/                         - Financial DLP (credit card,
     updates/*_update.json                 IBAN, SWIFT detection)
```

## Components

### 1. Admin Dashboard (`admin-dashboard/`)

Next.js web application for security administrators. Provides four main sections:

| Section | Description |
|---------|-------------|
| 01 - Root of Trust | Generate/regenerate a 256-bit cryptographic Master Key |
| 02 - USB Provisioning | Select a USB drive, inject the Master Key, create `.vaultdrive/` structure |
| 03 - Compliance Logs | Import and view transfer logs from a provisioned USB (blocked/passed metrics) |
| 04 - Threat Intelligence | Edit YARA rules and DLP regex patterns, push update packages to USB |

**API Routes:**

| Route | Method | Description |
|-------|--------|-------------|
| `/api/key/generate` | POST | Generate a new 256-bit Master Key |
| `/api/key/status` | GET | Check if a Master Key exists, return fingerprint |
| `/api/usb/detect` | GET | Detect connected removable USB drives |
| `/api/usb/provision` | POST | Provision a USB drive with the Master Key |
| `/api/logs/ingest` | POST | Read `.vaultdrive/logs/*.json` from a USB drive |
| `/api/updates/dispense` | POST | Write a threat intelligence update package to USB |

### 2. VaultDrive Client (`vaultdrive-client/`)

Tauri v2 desktop application (Rust backend + React frontend) for the air-gapped receiver machine.

**Features:**
- Detects removable USB drives via PowerShell
- Verifies the Master Key on the USB matches the local key
- Locks the drive (removes drive letter from Explorer) and operates via Volume GUID paths
- Dual-pane file browser (Local Host vs VaultDrive)
- Every file transfer is scanned through the Scanning Engine before copy
- Blocked files are quarantined to `.vaultdrive/quarantine/` with a JSON event log in `.vaultdrive/logs/`
- On drive lockdown, automatically checks for intelligence update packages in `.vaultdrive/updates/`, applies them to the local scanning config, and deletes them from the USB

### 3. Scanning Engine (`scanning-engine/`)

Rust library crate used by the VaultDrive Client. Three detection layers run on every file:

| Layer | What it detects |
|-------|----------------|
| YARA Rules | PE executables with suspicious sections (UPX-packed), EICAR test file, PowerShell/CMD scripts with malicious patterns |
| Entropy Analysis | Files with Shannon entropy > 7.5 (likely encrypted/compressed/packed) |
| Financial DLP | Credit card numbers (Luhn-validated), IBANs, SWIFT/BIC codes |

The engine supports custom rules via `ScanPipeline::with_config(yara_rules, dlp_patterns)`, which the client uses when intelligence updates have been applied.

## Implementation Steps

| Step | Component | Description | Status |
|------|-----------|-------------|--------|
| 1 | Admin Dashboard | Root of Trust - Master Key generation | Done |
| 2 | Admin Dashboard | USB Provisioning - inject key, create `.vaultdrive/` | Done |
| 3 | VaultDrive Client | USB Detection & Lockdown - verify key, remove drive letter | Done |
| 4 | VaultDrive Client | Secure File Browser & Transfer UI - dual-pane GUID-based browsing | Done |
| 5 | Scanning Engine | YARA + Entropy integration | Done |
| 6 | Scanning Engine | Financial DLP integration (credit card, IBAN, SWIFT) | Done |
| 7 | VaultDrive Client | Transfer Interception & Quarantine - scan before copy, block + quarantine on fail | Done (pending Windows `cargo check`) |
| 8 | Admin Dashboard | Compliance Log Ingestion - manual import from USB | Done |
| 9 | Admin Dashboard | Threat Intelligence Dispensing - push YARA/DLP updates to USB | Done |
| 10 | VaultDrive Client | Intelligence Update Ingestion - detect, validate, apply, delete from USB | Done (pending Windows `cargo check`) |

## USB Drive Structure

When a USB is provisioned, the following hidden directory structure is created:

```
USB Root/
  .vaultdrive/
    master.key              # 256-bit Master Key (hex-encoded)
    master.meta.json        # Key metadata (fingerprint, generation time)
    provision.json          # Provisioning manifest
    logs/                   # Transfer event logs (JSON)
      20260813T120000000Z_report.json
    quarantine/             # Blocked files moved here
      20260813T120000000Z_malware.exe
    updates/                # Threat intelligence packages
      2026-08-13T12-00-00-000Z_update.json
```

## Offline Update Loop

The system supports updating scanning rules without network connectivity:

1. **Admin** edits YARA rules or DLP patterns in the dashboard (Section 04)
2. **Admin** clicks "Push Updates to USB" -- writes a JSON package to `.vaultdrive/updates/`
3. **USB** is physically transported to the air-gapped receiver machine
4. **Receiver** inserts USB, the VaultDrive Client locks the drive
5. **Client** automatically detects the update package, validates the rules (test-compiles YARA, test-builds DLP regexes), saves the config locally, and deletes the package from USB
6. **Future file transfers** on that receiver use the updated scanning rules

### Update Package Format

```json
{
  "createdAt": "2026-08-13T12:00:00.000Z",
  "dispenser": "VaultDrive Admin Dashboard",
  "yaraRules": "rule SuspiciousExecutable { ... }",
  "dlpPatterns": [
    { "name": "credit_card", "regex": "\\b(?:4[0-9]{12}...)\\b" },
    { "name": "iban", "regex": "\\b[A-Z]{2}\\d{2}..." }
  ]
}
```

## End-to-End Smoke Test

1. **Generate a Master Key** in the Admin Dashboard (Section 01)
2. **Provision a USB drive** (Section 02)
3. **Transfer a test file** using the VaultDrive Client -- create a file containing `X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*` (EICAR test string) and attempt to copy it to/from the VaultDrive
4. **Verify it was blocked** -- the client should show a "Transfer BLOCKED" toast, the file should appear in `.vaultdrive/quarantine/`, and a log entry should exist in `.vaultdrive/logs/`
5. **Import logs** -- plug the USB into the admin machine, open the dashboard, click "Import Logs from USB" (Section 03), and verify the blocked entry appears with YARA match reasons
6. **Push an intelligence update** -- edit the YARA rules or DLP patterns (Section 04), click "Push Updates to USB"
7. **Apply the update** -- plug the USB back into the receiver, lock the drive in the client, and verify the "Applied intelligence update(s)" toast appears
8. **Verify updated rules** -- transfer a file that the new rules should catch

## Prerequisites

### Admin Dashboard
- Node.js 18+
- npm

### VaultDrive Client (development)
- Node.js 18+
- Rust toolchain (stable)
- Tauri v2 prerequisites:
  - **Windows:** WebView2 (pre-installed on Windows 10/11)
  - **Linux (dev only):** `glib2-devel gtk3-devel webkit2gtk4.1-devel libsoup3-devel librsvg2-devel pkg-config`

### Scanning Engine
- Rust toolchain (stable, edition 2024)
- Dependencies: `yara-x`, `regex`, `thiserror`, `serde`

## Running

### Admin Dashboard

```bash
cd admin-dashboard
npm install
npm run dev
# Open http://localhost:3000
```

### VaultDrive Client

```bash
cd vaultdrive-client
npm install
# Development mode (opens the Tauri window):
npm run tauri dev
# Production build:
npm run tauri build
```

### Scanning Engine (standalone tests)

```bash
cd scanning-engine
cargo test
```

## Target Platform

The system targets **Windows** for production use. The Admin Dashboard runs on any platform (it's a web app), but the VaultDrive Client relies on Windows-specific PowerShell commands for USB detection and `diskpart`/volume GUID operations for drive lockdown. Development can happen on Linux, but full end-to-end testing requires Windows.
