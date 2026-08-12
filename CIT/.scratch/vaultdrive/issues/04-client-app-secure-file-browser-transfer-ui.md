# 04 — Client App: Secure File Browser & Transfer UI

**What to build:** A Tauri/Wails frontend for the Receiver machine. It provides a dual-pane interface showing the local host files and the contents of the locked USB (accessed directly by the app, bypassing the OS explorer). It allows the user to select and initiate a file transfer that successfully copies a benign file between the host and the USB.

**Blocked by:** 03 — Receiver Agent: USB Detection & Lockdown

**Status:** ready-for-agent

- [ ] Build dual-pane file browser UI
- [ ] Implement backend logic to read from the locked USB path
- [ ] Implement basic file copy operation between host and USB
- [ ] Display transfer progress and success indicators
