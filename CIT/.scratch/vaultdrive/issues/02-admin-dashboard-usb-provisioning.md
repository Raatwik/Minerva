# 02 — Admin Dashboard: USB Provisioning

**What to build:** The dashboard detects an inserted USB drive (or a mock virtual directory path for testing), creates the hidden `.vaultdrive` folder at its root, and securely writes the previously generated Master Key into it. This officially provisions the USB for use in the secure environment.

**Blocked by:** 01 — Admin Dashboard: UI Setup & Key Generation

**Status:** ready-for-agent

- [ ] Implement logic to detect target USB/directory
- [ ] Create hidden `.vaultdrive` folder
- [ ] Write the Master Key into the `.vaultdrive` folder securely
- [ ] Provide UI feedback that the USB is provisioned
