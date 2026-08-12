# 06 — Scanning Engine: Financial DLP Integration

**What to build:** Expands the Scanning Engine to include regex-based Data Loss Prevention (DLP). Specifically, it parses the byte-stream for patterns matching PCI-DSS data, IBANs, and SWIFT codes to prevent unauthorized financial data exfiltration.

**Blocked by:** 05 — Scanning Engine: YARA & Entropy Integration

**Status:** ready-for-agent

- [ ] Add regex scanning module to the pipeline
- [ ] Implement patterns for Credit Cards, IBANs, and SWIFT codes
- [ ] Ensure DLP flags the stream as 'fail' on match
- [ ] Add unit tests with synthetic financial data
