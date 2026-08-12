## labels: ["ready-for-agent"]                                                                                                                                    
                                                                                                                                                                
VaultDrive Specification (Banking Systems Edition)                                                                                                               
                                                                                                                                                                
## Problem Statement                                                                                                                                              
                                                                                                                                                                
Core banking environments (such as SWIFT endpoints, mainframe backends, and highly secure teller networks) rely on air-gapped or strictly segregated networks to  
remain secure from internet-borne threats and ransomware. However, operational data still needs to move in and out of these environments—this includes daily      
transaction batch files, audit logs, and critical software updates. Standard USB drives are commonly used for this transport, but they represent a massive        
security risk. They can carry zero-day malware into the core banking network or be used by malicious insiders to exfiltrate highly sensitive financial data (PII, 
PCI-DSS data, IBANs, account numbers). Existing solutions are often generic, bloated, or require complex infrastructure that doesn't align with stringent banking 
compliance requirements.                                                                                                                                          
                                                                                                                                                                
## Solution                                                                                                                                                       
                                                                                                                                                                
VaultDrive transforms a standard, off-the-shelf USB thumb drive into an intelligent "airlock" edge-agent purpose-built for banking systems. By deploying a        
lightweight background agent and client app on the air-gapped banking machines (Receivers) and a local Dashboard on the Bank IT Admin machine, VaultDrive secures 
the entire data transfer lifecycle. The system enforces a strict three-way cryptographic key match (Admin, USB, Receiver) to ensure that only bank-authorized     
hardware can be used. When batch files or logs are transferred using the VaultDrive Client App, they are scanned in real-time (offline) using YARA, Entropy       
analysis, and highly targeted financial Data Loss Prevention (DLP) rules. Malicious files are immediately quarantined, and event logs are securely stored on the  
USB drive. When the USB is returned to the Admin machine, these logs are ingested into the Dashboard for compliance auditing, and new threat intelligence updates 
are pushed to the USB to be ferried back to the secure network.                                                                                                   
                                                                                                                                                                
## User Stories                                                                                                                                                   
                                                                                                                                                                
1. As a Bank IT Admin, I want to generate a Master Cryptographic Key on the Admin Dashboard, so that I can establish a root of trust for my bank's VaultDrive     
ecosystem.                                                                                                                                                        
2. As a Bank IT Admin, I want to provision standard USB drives with the Master Key via the Dashboard, so that they are recognized as authorized VaultDrive        
transports for our core network.                                                                                                                                  
3. As an IT deployer, I want to install the VaultDrive Agent on an air-gapped Core Banking machine with the Master Key, so that it can securely interact with     
provisioned USBs.                                                                                                                                                 
4. As a Core Banking Operator, I want to plug a provisioned USB drive into the machine, so that I can begin transferring End-of-Day (EOD) transaction batch files.
5. As a Core Banking Operator, I want the operating system to prevent direct access to the USB drive, so that I don't accidentally execute malicious payloads or  
bypass the bank's security scans.                                                                                                                                 
6. As a Core Banking Operator, I want to use the VaultDrive Client App to authenticate the USB drive, so that I know the drive is authorized for this specific    
branch or data center.                                                                                                                                            
7. As a Core Banking Operator, I want to use the VaultDrive Client App to browse files on the USB and the local host, so that I can select which batch files to   
transfer.                                                                                                                                                         
8. As a security system, I want to run YARA signature scans on incoming files during transfer, so that known financial malware (like SWIFT-targeting trojans) is  
detected before touching the host filesystem.                                                                                                                     
9. As a security system, I want to perform Shannon Entropy analysis on incoming files, so that highly obfuscated payloads (like packed ransomware) are flagged.   
10. As a security system, I want to run financial-specific DLP regex scans on outbound files during transfer, so that sensitive data (like Credit Card numbers,   
IBANs, SWIFT codes, and SSNs) is prevented from leaving the air-gapped machine unless explicitly authorized.                                                      
11. As a security system, I want to immediately abort the transfer and quarantine any file that fails a security check, so that the threat is neutralized and     
compliance is maintained.                                                                                                                                         
12. As a security system, I want to log every transfer attempt, block, and quarantine event to a hidden .vaultdrive folder on the USB, so that the Bank IT Admin  
has a full audit trail for compliance (e.g., PCI-DSS, SOX).                                                                                                       
13. As a Core Banking Operator, I want to be notified by the Client App when a file is blocked, so that I understand why my batch transfer failed and can report  
the incident.                                                                                                                                                     
14. As a Bank IT Admin, I want to plug the VaultDrive USB into my Admin machine, so that the Dashboard automatically detects it and reads the compliance event    
logs.                                                                                                                                                             
15. As a Bank IT Admin, I want to view a dashboard of threat metrics, DLP violations, and blocked files, so that I can monitor the security posture of the air-   
gapped banking environments.                                                                                                                                      
16. As a Bank IT Admin, I want to add new banking-specific YARA rules and updated DLP regex configurations to the Admin Dashboard, so that I can proactively      
respond to emerging financial threats.                                                                                                                            
17. As a Bank IT Admin, I want the Dashboard to automatically push these new rules to the USB's .vaultdrive/updates folder, so that they can be securely ferried  
to the Receiver machines.                                                                                                                                         
18. As a security system, I want the Receiver's Agent to automatically ingest updates from the USB upon insertion, so that its offline scanning engine remains up-
to-date with the latest financial threat intelligence.                                                                                                            
                                                                                                                                                                
## Implementation Decisions                                                                                                                                       
                                                                                                                                                                
• Architecture: A localized ecosystem with no central cloud server, ensuring zero financial data touches the public internet. Everything runs on the Admin Machine,
the Receiver Machine, and the physical USB drive.                                                                                                                 
• Key System: A three-way symmetrical cryptographic key system (Master Key) stored in the Dashboard, the Receiver Agent, and the USB's hidden .vaultdrive folder  
to enforce strict hardware authorization.                                                                                                                         
• USB Protection: The Receiver OS will be configured (via the Agent) to lock or unmount direct access to the USB volume, forcing all I/O through the VaultDrive   
Client App.                                                                                                                                                       
• Client App GUI: Built to provide a dual-pane file explorer experience (Local vs. USB) to facilitate seamless, scan-integrated transfers for banking operators.  
• Scanning Engine: Offline, highly performant engine integrating yara-rust for signatures, an entropy calculation module, and a banking-specific DLP module       
optimized to detect PCI-DSS and PII data patterns.                                                                                                                
• Data Transport: All logs, quarantined files, and updates are transported via a hidden .vaultdrive folder on the standard USB, utilizing the physical drive as   
the air-gap bridge.
• Dashboard Tech: React/Next.js for a premium, responsive local web interface, suitable for a Bank IT Operations Center.
• Agent/Client Tech: Rust or Go for memory safety and cross-platform capabilities, paired with Tauri or Wails for the Client App frontend.

## Testing Decisions

Since the physical USB interaction is the Unique Selling Proposition (USP) of this project, we cannot abstract it away completely.

• Good Tests: Tests should verify external behavior: Does the system correctly lock the USB on a Windows Server typically used in banking? Does it block the exact
byte-stream of a mock SWIFT-targeting trojan? Does it accurately flag a file containing a list of synthetic credit card numbers (DLP)? Does it properly sync logs 
when a physical (or virtually emulated) USB is inserted?
• USB Hardware Seam (Highest Seam): We will utilize OS-level virtual USB device frameworks (like USB/IP on Linux, or dummy block devices) to simulate physical USB
insertion events in our CI pipeline. This ensures our OS-level USB detection, locking mechanisms, and hardware key verifications are tested against real OS       
behavior, not just mocked application logic.
• Scanning Engine Seam: We will also have lower-level unit tests for the scanning engine (YARA, Entropy, DLP) by feeding it in-memory byte streams of synthetic   
financial data to ensure the detection logic is robust and performant.
• Modules Tested: OS-level USB event listeners, File Transfer Interceptor, Financial Scanning Engine, Key Verification Module, Compliance Log Sync Module.        

## Out of Scope

• Centralized cloud aggregation of logs across multiple bank branches (focus is on local site administration).
• Generic, non-financial DLP rules (e.g., source code detection, which adds unnecessary processing load).
• On-the-fly encryption/decryption of the entire USB drive (only the .vaultdrive folder requires strict protection; the rest relies on the Client App lock).      

## Further Notes

• The security of the system relies heavily on the VaultDrive Agent's ability to lock down direct OS access to the USB drive. This OS-specific implementation     
(Windows Registry/Policies, Linux udev rules) will be the most critical technical hurdle, particularly within locked-down banking IT environments. Ensure         
compatibility with standard banking OS baselines.

