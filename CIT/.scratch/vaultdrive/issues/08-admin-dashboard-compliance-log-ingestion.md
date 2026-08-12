# 08 — Admin Dashboard: Compliance Log Ingestion

**What to build:** When a used USB is plugged back into the Admin machine, the Dashboard detects it, automatically reads the JSON log files from `.vaultdrive/logs`, and displays a table of transfer attempts and DLP/Malware blocks for auditing purposes.

**Blocked by:** 02 — Admin Dashboard: USB Provisioning, 07 — Client App: Transfer Interception & Quarantine

**Status:** ready-for-agent

- [ ] Detect `.vaultdrive/logs` on inserted USB
- [ ] Ingest and parse JSON log files
- [ ] Display logs in a readable data table in the Admin Dashboard UI
- [ ] Include metrics for total blocks and transfer attempts
