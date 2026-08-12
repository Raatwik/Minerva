# 10 — Receiver Agent: Intelligence Update Ingestion

**What to build:** When the locked USB is inserted into the air-gapped Receiver machine, the Agent detects the `.vaultdrive/updates` package, validates it, applies the new rules to its local Scanning Engine, and deletes the package from the USB to complete the offline update loop.

**Blocked by:** 03 — Receiver Agent: USB Detection & Lockdown, 09 — Admin Dashboard: Threat Intelligence Dispensing

**Status:** ready-for-agent

- [ ] Agent checks for `.vaultdrive/updates` on insertion
- [ ] Validate and unpack the update package
- [ ] Apply new YARA and DLP rules to the local engine configuration
- [ ] Delete the update package from the USB after successful application
