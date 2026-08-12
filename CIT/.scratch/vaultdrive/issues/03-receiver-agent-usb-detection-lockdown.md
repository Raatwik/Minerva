# 03 — Receiver Agent: USB Detection & Lockdown

**What to build:** A Rust/Go background daemon for the air-gapped machine that detects when a USB is inserted. It checks if the `.vaultdrive` folder contains a Master Key matching its own installed key. If authorized, the daemon issues OS-level commands (e.g., `umount`, removing drive letters, or `udev` rules) to lock direct file explorer access to the volume, securing it from normal OS interaction.

**Blocked by:** 02 — Admin Dashboard: USB Provisioning

**Status:** ready-for-agent

- [ ] Implement OS-level USB insertion detection
- [ ] Verify Master Key in the USB's `.vaultdrive` folder against local key
- [ ] Execute OS-level lockdown (unmount/hide) if authorized
- [ ] Prevent default OS file explorer access to the volume
