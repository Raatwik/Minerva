use yara_x::{Compiler, Rules, Scanner};

use crate::ScanError;

const DEFAULT_RULES: &str = r#"
rule SuspiciousExecutable {
    meta:
        description = "Detects PE executables with suspicious section names"
    strings:
        $mz = { 4D 5A }
        $upx0 = ".UPX0" ascii
        $upx1 = ".UPX1" ascii
    condition:
        $mz at 0 and ($upx0 or $upx1)
}

rule EicarTestFile {
    meta:
        description = "EICAR antivirus test file"
    strings:
        $eicar = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    condition:
        $eicar
}

rule SuspiciousScript {
    meta:
        description = "Detects scripts with common malicious patterns"
    strings:
        $ps_encoded = "powershell" ascii nocase
        $ps_bypass = "-ExecutionPolicy Bypass" ascii nocase
        $cmd_hidden = "cmd.exe /c" ascii nocase
        $b64_invoke = "FromBase64String" ascii nocase
    condition:
        ($ps_encoded and $ps_bypass) or ($cmd_hidden and $b64_invoke)
}
"#;

pub struct YaraScanner {
    rules: Rules,
}

impl YaraScanner {
    pub fn new() -> Result<Self, ScanError> {
        Self::with_rules(DEFAULT_RULES)
    }

    pub fn with_rules(rule_source: &str) -> Result<Self, ScanError> {
        let mut compiler = Compiler::new();
        compiler
            .add_source(rule_source)
            .map_err(|e| ScanError::YaraCompile(e.to_string()))?;
        let rules = compiler.build();
        Ok(Self { rules })
    }

    pub fn scan(&self, data: &[u8]) -> Result<YaraScanResult, ScanError> {
        let mut scanner = Scanner::new(&self.rules);
        let scan_results = scanner.scan(data)?;
        let matched_rules: Vec<String> = scan_results
            .matching_rules()
            .map(|r| r.identifier().to_string())
            .collect();

        Ok(YaraScanResult {
            is_clean: matched_rules.is_empty(),
            matched_rules,
        })
    }
}

#[derive(Debug, Clone)]
pub struct YaraScanResult {
    pub is_clean: bool,
    pub matched_rules: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_file_passes() {
        let scanner = YaraScanner::new().unwrap();
        let result = scanner.scan(b"Just a normal text file.").unwrap();
        assert!(result.is_clean);
        assert!(result.matched_rules.is_empty());
    }

    #[test]
    fn eicar_test_file_detected() {
        let scanner = YaraScanner::new().unwrap();
        let eicar = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
        let result = scanner.scan(eicar).unwrap();
        assert!(!result.is_clean);
        assert!(result.matched_rules.contains(&"EicarTestFile".to_string()));
    }

    #[test]
    fn suspicious_script_detected() {
        let scanner = YaraScanner::new().unwrap();
        let payload = b"powershell -ExecutionPolicy Bypass -File evil.ps1";
        let result = scanner.scan(payload).unwrap();
        assert!(!result.is_clean);
        assert!(result.matched_rules.contains(&"SuspiciousScript".to_string()));
    }

    #[test]
    fn custom_rules_work() {
        let rule = r#"
            rule TestCustom {
                strings:
                    $marker = "CUSTOM_MARKER"
                condition:
                    $marker
            }
        "#;
        let scanner = YaraScanner::with_rules(rule).unwrap();

        let clean = scanner.scan(b"no marker here").unwrap();
        assert!(clean.is_clean);

        let dirty = scanner.scan(b"contains CUSTOM_MARKER in stream").unwrap();
        assert!(!dirty.is_clean);
    }
}
