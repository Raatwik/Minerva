use regex::Regex;
use serde::{Deserialize, Serialize};

pub struct DlpScanner {
    patterns: Vec<DlpPattern>,
}

struct DlpPattern {
    name: String,
    regex: Regex,
    validator: Option<fn(&str) -> bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DlpPatternConfig {
    pub name: String,
    pub regex: String,
}

impl DlpScanner {
    pub fn new() -> Self {
        Self {
            patterns: vec![
                DlpPattern {
                    name: "credit_card".to_string(),
                    regex: Regex::new(r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b").unwrap(),
                    validator: Some(luhn_check),
                },
                DlpPattern {
                    name: "iban".to_string(),
                    regex: Regex::new(r"\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}(?:[A-Z0-9]{0,18})\b").unwrap(),
                    validator: None,
                },
                DlpPattern {
                    name: "swift_code".to_string(),
                    regex: Regex::new(r"\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b").unwrap(),
                    validator: None,
                },
            ],
        }
    }

    pub fn with_patterns(configs: &[DlpPatternConfig]) -> Result<Self, String> {
        let mut patterns = Vec::new();
        for cfg in configs {
            let regex = Regex::new(&cfg.regex)
                .map_err(|e| format!("Invalid regex for pattern '{}': {}", cfg.name, e))?;
            patterns.push(DlpPattern {
                name: cfg.name.clone(),
                regex,
                validator: if cfg.name == "credit_card" {
                    Some(luhn_check)
                } else {
                    None
                },
            });
        }
        Ok(Self { patterns })
    }

    pub fn scan(&self, data: &[u8]) -> DlpScanResult {
        let text = String::from_utf8_lossy(data);
        let mut findings: Vec<DlpFinding> = Vec::new();

        for pattern in &self.patterns {
            for mat in pattern.regex.find_iter(&text) {
                let matched = mat.as_str();
                if let Some(validator) = pattern.validator {
                    if !validator(matched) {
                        continue;
                    }
                }
                findings.push(DlpFinding {
                    pattern_name: pattern.name.to_string(),
                    matched_value: redact(matched),
                    offset: mat.start(),
                });
            }
        }

        DlpScanResult {
            is_clean: findings.is_empty(),
            findings,
        }
    }
}

fn redact(value: &str) -> String {
    if value.len() <= 4 {
        return "*".repeat(value.len());
    }
    let visible = &value[value.len() - 4..];
    format!("{}...{}", "*".repeat(value.len() - 4), visible)
}

fn luhn_check(number: &str) -> bool {
    let digits: Vec<u32> = number
        .chars()
        .filter(|c| c.is_ascii_digit())
        .filter_map(|c| c.to_digit(10))
        .collect();

    if digits.len() < 13 {
        return false;
    }

    let checksum: u32 = digits
        .iter()
        .rev()
        .enumerate()
        .map(|(i, &d)| {
            if i % 2 == 1 {
                let doubled = d * 2;
                if doubled > 9 { doubled - 9 } else { doubled }
            } else {
                d
            }
        })
        .sum();

    checksum % 10 == 0
}

#[derive(Debug, Clone)]
pub struct DlpScanResult {
    pub is_clean: bool,
    pub findings: Vec<DlpFinding>,
}

#[derive(Debug, Clone)]
pub struct DlpFinding {
    pub pattern_name: String,
    pub matched_value: String,
    pub offset: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_visa_card() {
        let scanner = DlpScanner::new();
        let data = b"Payment to card 4539578763621486 confirmed.";
        let result = scanner.scan(data);
        assert!(!result.is_clean);
        assert_eq!(result.findings.len(), 1);
        assert_eq!(result.findings[0].pattern_name, "credit_card");
    }

    #[test]
    fn detects_mastercard() {
        let scanner = DlpScanner::new();
        let data = b"Card number: 5425233430109903";
        let result = scanner.scan(data);
        assert!(!result.is_clean);
        assert_eq!(result.findings[0].pattern_name, "credit_card");
    }

    #[test]
    fn rejects_invalid_luhn() {
        let scanner = DlpScanner::new();
        let data = b"Not a real card: 4539578763621487";
        let result = scanner.scan(data);
        assert!(result.is_clean);
    }

    #[test]
    fn detects_iban() {
        let scanner = DlpScanner::new();
        let data = b"Transfer to DE89370400440532013000 completed.";
        let result = scanner.scan(data);
        assert!(!result.is_clean);
        assert_eq!(result.findings[0].pattern_name, "iban");
    }

    #[test]
    fn detects_swift_code() {
        let scanner = DlpScanner::new();
        let data = b"Route via DEUTDEFF500 for settlement.";
        let result = scanner.scan(data);
        assert!(!result.is_clean);
        assert_eq!(result.findings[0].pattern_name, "swift_code");
    }

    #[test]
    fn clean_file_passes() {
        let scanner = DlpScanner::new();
        let data = b"This is a normal batch file with no sensitive data.";
        let result = scanner.scan(data);
        assert!(result.is_clean);
        assert!(result.findings.is_empty());
    }

    #[test]
    fn redacted_values_hide_sensitive_data() {
        let scanner = DlpScanner::new();
        let data = b"Card: 4539578763621486";
        let result = scanner.scan(data);
        assert!(result.findings[0].matched_value.contains("..."));
        assert!(result.findings[0].matched_value.ends_with("1486"));
    }

    #[test]
    fn multiple_findings_in_one_stream() {
        let scanner = DlpScanner::new();
        let data = b"Card 4539578763621486 routed via DEUTDEFF to DE89370400440532013000";
        let result = scanner.scan(data);
        assert!(!result.is_clean);
        assert!(result.findings.len() >= 3);
    }

    #[test]
    fn luhn_validates_correctly() {
        assert!(luhn_check("4539578763621486"));
        assert!(luhn_check("5425233430109903"));
        assert!(!luhn_check("4539578763621487"));
        assert!(!luhn_check("1234"));
    }
}
