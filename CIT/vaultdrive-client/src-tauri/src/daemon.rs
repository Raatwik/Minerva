/// daemon.rs — USB Detection, Key Verification, and Drive Lockdown
///
/// Implements the Step 3 logic: detect removable USBs, verify the
/// .vaultdrive/master.key against the receiver's locally installed copy,
/// and orchestrate the lockdown (GUID retrieval + drive letter removal).

use crate::state::LockedVolume;
use crate::volume;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

/// Info about a detected removable USB drive (before lockdown).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UsbDrive {
    /// Drive letter with backslash, e.g. "E:\\"
    pub letter: String,
    /// Volume label
    pub label: String,
    /// Size in GB
    pub size_gb: String,
}

/// Detect removable USB drives using PowerShell WMI query.
/// This mirrors the admin-dashboard's detect route approach.
pub fn detect_usb_drives() -> Result<Vec<UsbDrive>, String> {
    #[cfg(not(target_os = "windows"))]
    {
        return Err("USB detection only supported on Windows".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::process::Command;

        let ps_script = r#"
Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 } | ForEach-Object {
    [PSCustomObject]@{
        Letter = $_.DeviceID
        Label  = if ($_.VolumeName) { $_.VolumeName } else { 'USB Drive' }
        SizeGB = [math]::Round($_.Size / 1GB, 2)
    }
} | ConvertTo-Json -Compress
"#;

        // Encode as UTF-16LE Base64 for -EncodedCommand (avoids escaping issues)
        let wide: Vec<u8> = ps_script
            .encode_utf16()
            .flat_map(|c| c.to_le_bytes())
            .collect();
        let encoded = base64_encode(&wide);

        let output = Command::new("powershell")
            .args(["-NoProfile", "-EncodedCommand", &encoded])
            .output()
            .map_err(|e| format!("Failed to run PowerShell: {}", e))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if stdout.is_empty() {
            return Ok(Vec::new());
        }

        // PowerShell returns a single object (not array) if only one drive
        let parsed: serde_json::Value =
            serde_json::from_str(&stdout).map_err(|e| format!("JSON parse error: {}", e))?;

        let items = if parsed.is_array() {
            parsed.as_array().unwrap().clone()
        } else {
            vec![parsed]
        };

        let mut drives = Vec::new();
        for item in items {
            let mut letter = item["Letter"].as_str().unwrap_or("").to_string();
            if letter.ends_with(':') && !letter.ends_with('\\') {
                letter.push('\\');
            }
            drives.push(UsbDrive {
                letter,
                label: item["Label"].as_str().unwrap_or("USB Drive").to_string(),
                size_gb: match &item["SizeGB"] {
                    serde_json::Value::Number(n) => n.to_string(),
                    _ => "?".to_string(),
                },
            });
        }

        Ok(drives)
    }
}

/// Simple Base64 encoder (avoids pulling in the `base64` crate for one use).
fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

/// Verify the master key on a USB drive against the locally installed copy.
///
/// Reads `.vaultdrive/master.key` from the USB and compares it byte-for-byte
/// against the receiver machine's locally installed key.
///
/// # Arguments
/// * `drive_letter` — e.g. `"E:\\"`
/// * `local_key_path` — path to the receiver's local master.key file
pub fn verify_master_key(drive_letter: &str, local_key_path: &str) -> Result<bool, String> {
    let drive = if drive_letter.ends_with('\\') {
        drive_letter.to_string()
    } else {
        format!("{}\\", drive_letter)
    };

    let usb_key_path = Path::new(&drive).join(".vaultdrive").join("master.key");

    if !usb_key_path.exists() {
        return Err(format!(
            "No .vaultdrive/master.key found on {}",
            drive
        ));
    }

    if !Path::new(local_key_path).exists() {
        return Err(format!(
            "Local master key not found at '{}'",
            local_key_path
        ));
    }

    let usb_key = fs::read_to_string(&usb_key_path)
        .map_err(|e| format!("Failed to read USB key: {}", e))?
        .trim()
        .to_string();

    let local_key = fs::read_to_string(local_key_path)
        .map_err(|e| format!("Failed to read local key: {}", e))?
        .trim()
        .to_string();

    Ok(usb_key == local_key)
}

/// Full lockdown orchestration:
/// 1. Verify the master key
/// 2. Retrieve the Volume GUID
/// 3. Remove the drive letter
///
/// Returns a `LockedVolume` on success.
pub fn lockdown_drive(
    drive_letter: &str,
    local_key_path: &str,
) -> Result<LockedVolume, String> {
    let drive = if drive_letter.ends_with('\\') {
        drive_letter.to_string()
    } else {
        format!("{}\\", drive_letter)
    };

    // Step 1: Verify the key
    let key_ok = verify_master_key(&drive, local_key_path)?;
    if !key_ok {
        return Err(format!(
            "Master key mismatch on {}. This USB is not authorised.",
            drive
        ));
    }

    // Step 2: Get the Volume GUID before removing the drive letter
    let guid = volume::get_volume_guid(&drive)?;

    // Step 3: Remove the drive letter (with retry for Defender locks)
    volume::remove_drive_letter(&drive, 3)?;

    let locked = LockedVolume {
        guid,
        original_letter: drive,
        locked_at: chrono::Utc::now().to_rfc3339(),
        key_verified: true,
    };

    eprintln!(
        "[VaultDrive] Drive locked: {} -> GUID {}",
        locked.original_letter, locked.guid
    );

    Ok(locked)
}
