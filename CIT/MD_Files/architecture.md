# VaultDrive Architecture

VaultDrive is a zero-trust, offline "airlock" gatekeeper for critical infrastructure. It transforms a standard USB drive into an intelligent edge-agent ecosystem by utilizing specialized host software to ensure that malware infection and data exfiltration are prevented in air-gapped environments.

## 1. Core Components

The VaultDrive ecosystem consists of three primary physical and software components:

1. **Standard USB Drive (The Transport)**
   - A standard, off-the-shelf USB thumb drive.
   - Contains a hidden `.vaultdrive` folder used for storing cryptographic keys, event logs, quarantined files, and threat intelligence updates.
2. **Admin Machine (The Dashboard)**
   - Runs the VaultDrive Admin Dashboard, a local-only web application (no central server or internet required).
   - Responsible for provisioning USB drives, analyzing security event logs, and dispensing new threat intelligence updates (YARA rules, DLP configurations).
3. **Air-Gapped Receiver Machine (The Airlock)**
   - Runs the lightweight VaultDrive Client App and background Agent.
   - Restricts direct OS-level access to the USB drive.
   - Intercepts file transfers to perform real-time security scans before files touch the host filesystem.

---

## 2. Three-Way Cryptographic Key System

To ensure that only authorized hardware can interact within a specific organizational environment, VaultDrive implements a strict three-way key matching system.

- **Provisioning**: The Admin Dashboard generates a Master Cryptographic Key.
- **Admin Deployment**: The Admin Dashboard stores this Master Key locally.
- **Receiver Deployment**: During installation on the air-gapped Receiver machine, the Master Key is securely provisioned to the local VaultDrive Agent.
- **USB Provisioning**: When an empty USB is plugged into the Admin Machine, the Admin can "provision" the drive, which writes the Master Key into the USB's hidden `.vaultdrive` folder.
- **Enforcement**: 
  - If a USB without a matching key is plugged into the Receiver Machine, the VaultDrive Client App refuses to mount it or perform transfers.
  - If a keyed USB is plugged into an unauthorized Admin Dashboard, the dashboard rejects it.

---

## 3. Secure File Transfer Flow

When a provisioned VaultDrive USB is plugged into the air-gapped Receiver Machine:

1. **Lockdown**: The background Agent locks direct OS-level file explorer access to the USB drive to prevent accidental or malicious background execution/copying.
2. **Authentication**: The VaultDrive Client App verifies the Master Key on the USB against its own installed key.
3. **Transfer Initiation**: The user opens the dedicated VaultDrive Client App UI to browse the USB and select files to copy to the host (or vice versa).
4. **Real-time Scanning**: As the Client App performs the transfer, it passes the file streams through three offline security checks:
   - **YARA**: Scans for known malware signatures.
   - **Shannon Entropy Analysis**: Detects highly encrypted or obfuscated files indicative of ransomware or packed malware.
   - **Data Loss Prevention (DLP)**: Scans outbound files for sensitive formats (e.g., regex for credentials/keys) to prevent data exfiltration.

---

## 4. Threat Handling & Quarantine

If a file fails any of the security checks during transfer:
- The transfer is immediately aborted for that specific file.
- The malicious file is deleted from its original location or moved to an inaccessible, encrypted `quarantine` directory within the `.vaultdrive` folder on the USB.
- The VaultDrive Agent generates a detailed event log containing the timestamp, file hash, and reason for the block.
- This event log is saved into the `.vaultdrive` folder on the USB drive.

---

## 5. Offline Intelligence Syncing

Because the Receiver Machine is air-gapped, the standard USB drive acts as a physical bridge for syncing logs and threat intelligence.

1. **Log Syncing**: When the USB is brought back to the Admin Machine, the Admin Dashboard verifies the key and automatically reads the event logs from the `.vaultdrive` folder. These logs are ingested into the local webapp for analysis and visualization.
2. **Update Dispensing**: The Admin Dashboard then checks for any new YARA rules, DLP configurations, or software updates. It writes these update packages into the `.vaultdrive/updates` folder on the USB drive.
3. **Edge Updating**: The next time the USB is plugged into the air-gapped Receiver Machine, the VaultDrive Agent detects the new packages in `.vaultdrive/updates`, applies them to its local scanning engine, and deletes the package from the USB.

---

## 6. Development Strategy

### Recommended Tech Stack
- **Dashboard**: React/Next.js for a beautiful, premium local web interface.
- **Client App & Agent**: Rust or Go for a fast, memory-safe cross-platform background agent and UI, with Tauri or Wails for the frontend. 
- **Scanning Engine**: Integration with `yara-rust` or similar bindings for performant offline scanning.

### Next Steps
- Implement the USB Key Provisioning logic on the Admin Dashboard.
- Build the core file transfer interception and scanning loop for the Client App.
- Develop the local log ingestion and rule dispensing mechanism.
