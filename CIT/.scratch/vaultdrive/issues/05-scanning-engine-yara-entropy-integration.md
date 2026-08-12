# 05 — Scanning Engine: YARA & Entropy Integration

**What to build:** A standalone Rust/Go module that accepts a file byte-stream and processes it. It runs `yara-rust` signatures to check for known malware and calculates the Shannon Entropy to flag highly obfuscated/packed payloads. It returns a pass/fail boolean.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Set up `yara-rust` bindings and load basic rules
- [ ] Implement Shannon Entropy calculation over byte streams
- [ ] Create scanning pipeline that takes a file stream and returns pass/fail
- [ ] Add unit tests with benign and mock-malicious byte streams
