use std::collections::HashMap;

const HIGH_ENTROPY_THRESHOLD: f64 = 7.0;

pub fn shannon_entropy(data: &[u8]) -> f64 {
    if data.is_empty() {
        return 0.0;
    }

    let mut freq: HashMap<u8, usize> = HashMap::new();
    for &byte in data {
        *freq.entry(byte).or_insert(0) += 1;
    }

    let len = data.len() as f64;
    freq.values().fold(0.0, |acc, &count| {
        let p = count as f64 / len;
        acc - p * p.log2()
    })
}

pub fn is_suspicious(data: &[u8]) -> bool {
    shannon_entropy(data) >= HIGH_ENTROPY_THRESHOLD
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zero_entropy_for_uniform_data() {
        let data = vec![0xAA; 1024];
        let e = shannon_entropy(&data);
        assert!((e - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn low_entropy_for_repetitive_text() {
        let data = b"aaaaaabbbbbb";
        let e = shannon_entropy(data);
        assert!(e < 2.0, "expected low entropy, got {e}");
    }

    #[test]
    fn high_entropy_for_random_data() {
        let data: Vec<u8> = (0..=255).cycle().take(4096).collect();
        let e = shannon_entropy(&data);
        assert!(e > 7.9, "expected near-max entropy, got {e}");
    }

    #[test]
    fn empty_data_returns_zero() {
        assert!((shannon_entropy(&[]) - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn suspicious_flags_high_entropy() {
        let random: Vec<u8> = (0..=255).cycle().take(4096).collect();
        assert!(is_suspicious(&random));

        let plain = b"Hello world, this is a normal text file with low entropy content.";
        assert!(!is_suspicious(plain));
    }
}
