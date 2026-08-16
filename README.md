<div align="center">

<h1> MINERVA </h1>
<h3>Zero-Trust Offline Airlock for Banking Infrastructure</h3>

<p>
  A cryptographically secured, air-gapped file transfer system that enforces zero-trust security on every USB interaction — built for high-assurance banking environments where network connectivity cannot be trusted.
</p>

<p>
  <img src="https://img.shields.io/badge/version-0.3.0-orange?style=for-the-badge" alt="Version">
  <img src="https://img.shields.io/badge/platform-Windows-blue?style=for-the-badge&logo=windows" alt="Platform">
  <img src="https://img.shields.io/badge/status-Production%20Ready-brightgreen?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/security-YARA%20%2B%20DLP%20%2B%20Entropy-red?style=for-the-badge" alt="Security">
</p>

</div>

---

## Screenshots

<table>
  <tr>
    <td align="center">
      <img src="docs/screenshots/admin_dashboard.jpg" width="480" alt="VaultDrive Admin Dashboard — Root of Trust & USB Provisioning"/>
      <br/>
      <sub><b>Admin Dashboard</b> — Root of Trust &amp; USB Provisioning</sub>
    </td>
    <td align="center">
      <img src="docs/screenshots/threat_intelligence.jpg" width="480" alt="Threat Intelligence — YARA Rules & DLP Pattern Editor"/>
      <br/>
      <sub><b>Threat Intelligence</b> — YARA Rules &amp; DLP Pattern Editor</sub>
    </td>
  </tr>
  <tr>
    <td align="center" colspan="2">
      <img src="docs/screenshots/client_file_browser.jpg" width="600" alt="VaultDrive Client — Dual-Pane Secure File Browser (Tauri)"/>
      <br/>
      <sub><b>VaultDrive Client</b> — Dual-Pane Secure File Browser (Tauri Desktop App)</sub>
    </td>
  </tr>
</table>

---

## What is VaultDrive?

Banking networks operate under strict regulatory compliance — data movement in and out of air-gapped systems must be **auditable, tamper-evident, and cryptographically authenticated**. VaultDrive replaces ad-hoc USB transfers with an **end-to-end controlled airlock**:

1. A **256-bit Master Key** anchors every trust decision — no key match, no transfer.
2. Every file passing through is **scanned by a three-layer threat engine** (YARA rules, Shannon entropy analysis, and financial DLP pattern matching).
3. Every action — transfer, block, quarantine, or update — is **immutably logged** to a JSON audit trail stored on the USB itself.
4. Security rules can be **updated offline** via cryptographically-bound update packages, transported by the same USB medium.

> **Target Environment:** Air-gapped Windows workstations in banking back-office or core-banking infrastructure.

---

## System Architecture

```
┌─────────────────────────────────────┐         ┌──────────────────────────────────────────┐
│       Admin Dashboard               │         │         VaultDrive Client                │
│       (Next.js · Web App)           │         │  (Tauri v2 · React · Rust Backend)       │
│                                     │         │                                          │
│  ① Root of Trust (Master Key Gen)  │         │  ③ USB Detection & Key Verification      │
│  ② USB Provisioning                │  USB    │  ④ Drive Lockdown (GUID-based access)   │
│  ③ Compliance Log Ingestion        │◄───────►│  ⑤ Dual-Pane Secure File Browser        │
│  ④ Threat Intel Dispensing         │         │  ⑥ Pre-Transfer File Scanning            │
│                                     │         │  ⑦ Quarantine & Audit Logging            │
└─────────────────────────────────────┘         └──────────────────────────────────────────┘
                    │                                               │
                    ▼                                               ▼
        ┌───────────────────────┐                   ┌──────────────────────────┐
        │   USB Drive           │                   │   Scanning Engine        │
        │   .vaultdrive/        │                   │   (Rust Library Crate)   │
        │   ├── master.key      │                   │                          │
        │   ├── master.meta.json│                   │  Layer 1: YARA Rules     │
        │   ├── provision.json  │                   │  Layer 2: Entropy (≥7.5) │
        │   ├── logs/*.json     │                   │  Layer 3: Financial DLP  │
        │   ├── quarantine/     │                   │   (CC · IBAN · SWIFT)    │
        │   └── updates/*.json  │                   └──────────────────────────┘
        └───────────────────────┘
```

---

## Tech Stack

### Admin Dashboard

<p>
  <img src="https://img.shields.io/badge/Next.js-16.3-black?style=flat-square&logo=next.js" alt="Next.js">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?style=flat-square&logo=tailwindcss" alt="Tailwind CSS">
  <img src="https://img.shields.io/badge/Node.js-18+-339933?style=flat-square&logo=node.js" alt="Node.js">
</p>

### VaultDrive Client (Receiver)

<p>
  <img src="https://img.shields.io/badge/Tauri-v2-FFC131?style=flat-square&logo=tauri" alt="Tauri">
  <img src="https://img.shields.io/badge/Rust-2021-000000?style=flat-square&logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react" alt="React">
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite" alt="Vite">
  <img src="https://img.shields.io/badge/Windows%20API-sys-0078D4?style=flat-square&logo=windows" alt="Windows API">
</p>

### Scanning Engine

<p>
  <img src="https://img.shields.io/badge/Rust-2024-000000?style=flat-square&logo=rust" alt="Rust">
  <img src="https://img.shields.io/badge/YARA--X-1.19-FF6B35?style=flat-square" alt="YARA-X">
  <img src="https://img.shields.io/badge/Tokio-Async-4EAA25?style=flat-square" alt="Tokio">
  <img src="https://img.shields.io/badge/Serde-JSON-orange?style=flat-square" alt="Serde">
</p>

---

## Repository Structure

```
CIT/
├── admin-dashboard/          # Next.js admin web application
│   ├── src/
│   │   └── app/
│   │       ├── page.tsx      # Main dashboard UI (4 sections)
│   │       └── api/          # REST API routes
│   │           ├── key/      # Master Key generation & status
│   │           ├── usb/      # USB detection & provisioning
│   │           ├── logs/     # Compliance log ingestion
│   │           └── updates/  # Threat intel dispensing
│   └── package.json
│
├── vaultdrive-client/        # Tauri v2 desktop application (receiver)
│   ├── src/                  # React frontend
│   └── src-tauri/            # Rust backend
│       ├── src/
│       │   └── lib.rs        # Tauri commands (USB ops, file transfer, scan)
│       └── Cargo.toml
│
├── scanning-engine/          # Rust library crate (threat detection)
│   └── src/
│       ├── lib.rs            # ScanPipeline — main entry point
│       ├── yara_scan.rs      # YARA-X rule matching
│       ├── entropy.rs        # Shannon entropy analysis
│       └── dlp.rs            # Financial DLP (CC, IBAN, SWIFT)
│
├── docs/
│   └── screenshots/          # UI screenshots used in this README
│
└── run_all.bat               # One-click dev environment launcher
```

---

## Feature Breakdown

### Admin Dashboard — 4-Section Security Console

| Section                      | Capability                                                                                                                                                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **01 · Root of Trust**       | Generate & regenerate a 256-bit cryptographic Master Key. Displays the key fingerprint (truncated hex) and generation timestamp. The key anchors all downstream trust decisions. |
| **02 · USB Provisioning**    | Enumerate connected removable drives, select a target, inject the Master Key, and scaffold the hidden `.vaultdrive/` directory structure on the USB.                             |
| **03 · Compliance Logs**     | Import `*.json` transfer logs from a USB drive. Visualizes every transfer attempt — **PASSED** / **BLOCKED** — with associated YARA match reasons and timestamps.                |
| **04 · Threat Intelligence** | Edit YARA detection rules and DLP regex patterns inline. Push a signed update package to `.vaultdrive/updates/` on the USB for offline propagation to receiver machines.         |

### VaultDrive Client — Air-Gapped Receiver

| Feature                    | Detail                                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **USB Lockdown**           | On insertion, verifies the Master Key fingerprint. On match, removes the drive letter from Windows Explorer (via `diskpart`) and accesses the volume exclusively through its GUID path — invisible to standard OS tools. |
| **Dual-Pane File Browser** | Left pane: Local Host filesystem. Right pane: VaultDrive (USB). Navigate, select, and transfer files in a purpose-built, minimal UI.                                                                                     |
| **Pre-Transfer Scanning**  | Every file staged for transfer is passed through the full `ScanPipeline` before any byte is copied. Blocked files are quarantined; the user sees a detailed toast notification.                                          |
| **Audit Logging**          | Every transfer attempt (passed or blocked) writes a timestamped JSON event to `.vaultdrive/logs/` on the USB, available for admin ingestion later.                                                                       |
| **Intelligence Ingestion** | On drive lockdown, the client auto-detects `*.json` update packages in `.vaultdrive/updates/`, validates rules (test-compiles YARA, test-builds DLP regexes), applies them, and deletes the package from USB.            |

### Scanning Engine — Three-Layer Threat Detection

| Layer                | Mechanism                           | Detects                                                                                                              |
| -------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **YARA-X**           | Rule-based bytecode scanning        | PE executables with UPX-packed/suspicious sections, EICAR test files, PowerShell/CMD scripts with malicious patterns |
| **Entropy Analysis** | Shannon entropy (H > 7.5 threshold) | Encrypted payloads, compressed archives disguised as documents, packed executables                                   |
| **Financial DLP**    | Regex + Luhn validation             | Credit card numbers (13–16 digit, Luhn-checked), IBANs, SWIFT/BIC codes                                              |

Rules are hot-swappable via `ScanPipeline::with_config(yara_rules, dlp_patterns)`, enabling the offline update loop.

---

## Offline Update Loop

The most critical security feature: **rules can be updated on air-gapped machines without any network connection.**

```
Admin Machine                              Receiver Machine (Air-Gapped)
─────────────                              ─────────────────────────────
① Edit YARA rules / DLP patterns
   in Admin Dashboard (Section 04)
② Click "Push Updates to USB"
   → Writes JSON package to
     .vaultdrive/updates/                  ③ USB physically transported
                                           ④ Receiver inserts USB
                                              → Client verifies Master Key
                                              → Drive locked (GUID access)
                                           ⑤ Client detects update package
                                              → Validates YARA compile
                                              → Validates DLP regexes
                                              → Saves config locally
                                              → Deletes package from USB
                                           ⑥ Future transfers use new rules
```

**Update Package Schema:**

```json
{
  "createdAt": "2026-08-16T13:00:00.000Z",
  "dispenser": "VaultDrive Admin Dashboard",
  "yaraRules": "rule SuspiciousExecutable { ... }",
  "dlpPatterns": [
    { "name": "credit_card", "regex": "\\b(?:4[0-9]{12}...)\\b" },
    { "name": "iban", "regex": "\\b[A-Z]{2}\\d{2}[A-Z0-9]{4}\\d{7,}\\b" },
    {
      "name": "swift_code",
      "regex": "\\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\\b"
    }
  ]
}
```

---

## USB Drive Structure

Every provisioned USB drive carries the following hidden directory layout:

```
USB Root/
└── .vaultdrive/                                   ← hidden directory
    ├── master.key                                 # 256-bit Master Key (hex-encoded)
    ├── master.meta.json                           # Key metadata (fingerprint, generation timestamp)
    ├── provision.json                             # Provisioning manifest
    ├── logs/
    │   └── 20260816T190000000Z_report.json        # Timestamped transfer event log
    ├── quarantine/
    │   └── 20260816T190000000Z_malware.exe        # Blocked & quarantined files
    └── updates/
        └── 2026-08-16T19-00-00-000Z_update.json  # Threat intel update packages
```

---

## API Reference — Admin Dashboard

| Endpoint                | Method | Description                                                   |
| ----------------------- | ------ | ------------------------------------------------------------- |
| `/api/key/generate`     | `POST` | Generate a new 256-bit Master Key; persists to server         |
| `/api/key/status`       | `GET`  | Returns current key fingerprint & generation timestamp        |
| `/api/usb/detect`       | `GET`  | Enumerate connected removable USB drives via PowerShell       |
| `/api/usb/provision`    | `POST` | Inject Master Key into USB, scaffold `.vaultdrive/` structure |
| `/api/logs/ingest`      | `POST` | Read `*.json` transfer logs from a mounted USB                |
| `/api/updates/dispense` | `POST` | Write a threat intelligence update package to USB             |

---

## Getting Started

### Prerequisites

| Component         | Requirement                                                                       |
| ----------------- | --------------------------------------------------------------------------------- |
| Admin Dashboard   | Node.js ≥ 18, npm                                                                 |
| VaultDrive Client | Node.js ≥ 18, Rust stable toolchain, WebView2 (pre-installed on Win 10/11)        |
| Scanning Engine   | Rust stable, edition 2024                                                         |
| Platform          | **Windows** (for full end-to-end USB lockdown; Admin Dashboard is cross-platform) |

---

### One-Command Launch (Development)

From the repository root, simply run:

```bat
run_all.bat
```

This opens **two terminal windows** simultaneously:

- **Admin Dashboard** at `http://localhost:3000`
- **VaultDrive Client** as a native Tauri desktop window

---

### Manual Setup

#### 1. Admin Dashboard

```bash
cd admin-dashboard
npm install
npm run dev
# Open http://localhost:3000
```

#### 2. VaultDrive Client (Tauri Desktop App)

```bash
cd vaultdrive-client
npm install

# Development (opens the Tauri window with hot-reload)
npm run tauri dev

# Production build
npm run tauri build
```

> **Note:** Tauri dev mode requires the Rust toolchain and WebView2 runtime. Build artifacts are placed in `vaultdrive-client/src-tauri/target/release/`.

#### 3. Scanning Engine (Tests Only)

```bash
cd scanning-engine
cargo test
```

---

## End-to-End Smoke Test

Follow this sequence to verify the full system from key provisioning to threat detection:

```
Step 1 — Key Generation
  Open Admin Dashboard → Section 01 → Click "Regenerate Master Key"
  ✓ Verify fingerprint and timestamp appear

Step 2 — USB Provisioning
  Insert a USB drive → Section 02 → Select drive → Click "Provision Selected Drive"
  ✓ Verify .vaultdrive/ structure created on USB

Step 3 — Malicious File Transfer Attempt
  Open VaultDrive Client → Insert provisioned USB
  Create a file containing the EICAR test string:
    X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*
  Attempt to copy it via the dual-pane browser
  ✓ Verify "Transfer BLOCKED" toast appears
  ✓ Verify file appears in .vaultdrive/quarantine/
  ✓ Verify log entry written to .vaultdrive/logs/

Step 4 — Compliance Log Ingestion
  Return USB to Admin machine → Section 03 → Click "Import Logs from USB"
  ✓ Verify blocked transfer appears with YARA match reason

Step 5 — Threat Intelligence Update
  Section 04 → Edit a YARA rule → Click "Push Updates to USB"
  ✓ Verify update package written to .vaultdrive/updates/
  Plug USB back into receiver → lock the drive in the client
  ✓ Verify "Applied intelligence update(s)" toast appears
```

---

## Security Design Principles

| Principle                 | Implementation                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Zero Trust**            | Every USB insertion requires Master Key fingerprint verification. No key match = no access.                           |
| **Air-Gap Integrity**     | The Client operates exclusively via Windows Volume GUID paths, bypassing the OS drive letter system entirely.         |
| **Defense in Depth**      | Three independent scanning layers (YARA + Entropy + DLP) must all pass before a file is allowed through.              |
| **Immutable Audit Trail** | Every transfer event is timestamped, written to USB-resident JSON logs, and cannot be altered by the receiver client. |
| **Offline Updatability**  | Security rules are distributed as signed offline packages, maintaining security posture without network connectivity. |
| **Fail-Safe Quarantine**  | Any file that fails scanning is quarantined (not deleted) — preserving forensic evidence while preventing execution.  |

---

## Implementation Status

| #   | Component         | Feature                                                    | Status  |
| --- | ----------------- | ---------------------------------------------------------- | ------- |
| 1   | Admin Dashboard   | Root of Trust — Master Key generation                      | ✅ Done |
| 2   | Admin Dashboard   | USB Provisioning — inject key, scaffold `.vaultdrive/`     | ✅ Done |
| 3   | VaultDrive Client | USB Detection & Lockdown — verify key, remove drive letter | ✅ Done |
| 4   | VaultDrive Client | Dual-Pane Secure File Browser — GUID-based browsing        | ✅ Done |
| 5   | Scanning Engine   | YARA-X integration                                         | ✅ Done |
| 6   | Scanning Engine   | Financial DLP (credit card, IBAN, SWIFT)                   | ✅ Done |
| 7   | VaultDrive Client | Transfer Interception & Quarantine — scan before copy      | ✅ Done |
| 8   | Admin Dashboard   | Compliance Log Ingestion — manual import from USB          | ✅ Done |
| 9   | Admin Dashboard   | Threat Intelligence Dispensing — push YARA/DLP to USB      | ✅ Done |
| 10  | VaultDrive Client | Intelligence Update Ingestion — validate, apply, delete    | ✅ Done |

---

## Use Case & Threat Model

**Threat Model — What VaultDrive Defends Against:**

| Attack Vector                                  | Mitigation                                                                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| Exfiltration of PII / Financial data via USB   | DLP scanning blocks files containing card numbers, IBANs, SWIFT codes              |
| Introduction of malware via USB                | YARA rules block known malware signatures; entropy flags packed/encrypted payloads |
| Unauthorized USB drive usage                   | Master Key verification ensures only admin-provisioned drives are accepted         |
| Drive letter spoofing / Explorer access        | Drive letter removed; access via Volume GUID only — invisible to standard tools    |
| Tampered audit logs                            | Logs are USB-resident and read-only from the receiver's perspective                |
| Stale threat signatures on air-gapped machines | Offline update loop propagates new rules without network connectivity              |

---

---

<div align="center"> · VaultDrive v0.3.0 · Zero-Trust Offline Airlock for Banking Infrastructure</sub>
</div>
