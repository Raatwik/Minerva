# 07 — Client App: Transfer Interception & Quarantine

**What to build:** Integrates the Scanning Engine into the Client App's file transfer flow. When a user attempts to transfer a file, it is scanned mid-stream. If the scan fails (due to malware or DLP), the transfer aborts, the file is safely moved to `.vaultdrive/quarantine`, and a detailed JSON event log is written to `.vaultdrive/logs`.

**Blocked by:** 04 — Client App: Secure File Browser & Transfer UI, 06 — Scanning Engine: Financial DLP Integration

**Status:** ready-for-agent

- [ ] Pipe the file transfer stream through the Scanning Engine
- [ ] Implement abort logic if scan returns 'fail'
- [ ] Move blocked files to `.vaultdrive/quarantine`
- [ ] Generate and save JSON event log in `.vaultdrive/logs`
- [ ] Display clear error/block message to the user in the UI
