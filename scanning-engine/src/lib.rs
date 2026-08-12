pub mod dlp;
pub mod entropy;
pub mod yara_scan;

use dlp::{DlpFinding, DlpScanner};
use yara_scan::YaraScanner;

#[derive(Debug, thiserror::Error)]
pub enum ScanError {
    #[error("YARA scan error: {0}")]
    YaraScan(#[from] yara_x::ScanError),
    #[error("YARA rule compilation failed: {0}")]
    YaraCompile(String),
}

pub struct ScanPipeline {
    yara: YaraScanner,
    dlp: DlpScanner,
}

impl ScanPipeline {
    pub fn new() -> Result<Self, ScanError> {
        Ok(Self {
            yara: YaraScanner::new()?,
            dlp: DlpScanner::new(),
        })
    }

    pub fn with_yara_rules(rules: &str) -> Result<Self, ScanError> {
        Ok(Self {
            yara: YaraScanner::with_rules(rules)?,
            dlp: DlpScanner::new(),
        })
    }

    pub fn scan(&self, data: &[u8]) -> Result<ScanVerdict, ScanError> {
        let yara_result = self.yara.scan(data)?;
        let entropy_suspicious = entropy::is_suspicious(data);
        let entropy_value = entropy::shannon_entropy(data);
        let dlp_result = self.dlp.scan(data);

        let passed = yara_result.is_clean && !entropy_suspicious && dlp_result.is_clean;

        let mut reasons = Vec::new();
        if !yara_result.is_clean {
            reasons.push(format!(
                "YARA match: {}",
                yara_result.matched_rules.join(", ")
            ));
        }
        if entropy_suspicious {
            reasons.push(format!("High entropy: {entropy_value:.2}"));
        }
        if !dlp_result.is_clean {
            reasons.push(format!(
                "DLP: {} finding(s)",
                dlp_result.findings.len()
            ));
        }

        Ok(ScanVerdict {
            passed,
            reasons,
            entropy: entropy_value,
            yara_matches: yara_result.matched_rules,
            dlp_findings: dlp_result.findings,
        })
    }
}

#[derive(Debug)]
pub struct ScanVerdict {
    pub passed: bool,
    pub reasons: Vec<String>,
    pub entropy: f64,
    pub yara_matches: Vec<String>,
    pub dlp_findings: Vec<DlpFinding>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clean_file_passes_pipeline() {
        let pipeline = ScanPipeline::new().unwrap();
        let data = b"Normal quarterly report. Revenue is up 15%.";
        let verdict = pipeline.scan(data).unwrap();
        assert!(verdict.passed);
        assert!(verdict.reasons.is_empty());
    }

    #[test]
    fn malware_signature_fails_pipeline() {
        let pipeline = ScanPipeline::new().unwrap();
        let eicar = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
        let verdict = pipeline.scan(eicar).unwrap();
        assert!(!verdict.passed);
        assert!(verdict.reasons.iter().any(|r| r.contains("YARA")));
    }

    #[test]
    fn high_entropy_fails_pipeline() {
        let pipeline = ScanPipeline::new().unwrap();
        let random: Vec<u8> = (0..=255).cycle().take(4096).collect();
        let verdict = pipeline.scan(&random).unwrap();
        assert!(!verdict.passed);
        assert!(verdict.reasons.iter().any(|r| r.contains("entropy")));
    }

    #[test]
    fn financial_data_fails_pipeline() {
        let pipeline = ScanPipeline::new().unwrap();
        let data = b"Wire transfer to IBAN DE89370400440532013000 for settlement.";
        let verdict = pipeline.scan(data).unwrap();
        assert!(!verdict.passed);
        assert!(verdict.reasons.iter().any(|r| r.contains("DLP")));
    }

    #[test]
    fn multiple_failures_reported() {
        let pipeline = ScanPipeline::new().unwrap();
        let data = b"powershell -ExecutionPolicy Bypass card 4539578763621486";
        let verdict = pipeline.scan(data).unwrap();
        assert!(!verdict.passed);
        assert!(verdict.reasons.len() >= 2);
    }
}
