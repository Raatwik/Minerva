# 09 — Admin Dashboard: Threat Intelligence Dispensing

**What to build:** The Dashboard provides a UI feature to upload new YARA rules or modify DLP regex patterns. When applied, the dashboard writes these updates as a package into the `.vaultdrive/updates` folder on the inserted USB drive.

**Blocked by:** 02 — Admin Dashboard: USB Provisioning

**Status:** ready-for-agent

- [ ] Build UI for uploading/editing YARA rules and DLP patterns
- [ ] Package the updates into a format for the Receiver Agent
- [ ] Write the update package to `.vaultdrive/updates` on the USB
