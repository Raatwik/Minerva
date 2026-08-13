use std::{env, fs, process};

use scanning_engine::ScanPipeline;

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: {} <file> [file...]", args[0]);
        process::exit(1);
    }

    let pipeline = match ScanPipeline::new() {
        Ok(p) => p,
        Err(e) => {
            eprintln!("Failed to initialize scanning engine: {e}");
            process::exit(1);
        }
    };

    let mut any_failed = false;

    for path in &args[1..] {
        let data = match fs::read(path) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[ERROR] {path}: {e}");
                any_failed = true;
                continue;
            }
        };

        match pipeline.scan(&data) {
            Ok(verdict) => {
                if verdict.passed {
                    println!("[PASS] {path}");
                } else {
                    println!("[FAIL] {path}");
                    for reason in &verdict.reasons {
                        println!("       - {reason}");
                    }
                    for finding in &verdict.dlp_findings {
                        println!(
                            "       DLP {}: {} at offset {}",
                            finding.pattern_name, finding.matched_value, finding.offset
                        );
                    }
                    any_failed = true;
                }
                println!("       Entropy: {:.2} bits/byte", verdict.entropy);
            }
            Err(e) => {
                eprintln!("[ERROR] {path}: scan failed: {e}");
                any_failed = true;
            }
        }
    }

    if any_failed {
        process::exit(1);
    }
}
