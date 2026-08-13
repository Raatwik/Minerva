/// volume.rs — Windows Volume Management via direct Win32 API
///
/// Uses `windows-sys` to call GetVolumeNameForVolumeMountPointW,
/// DeleteVolumeMountPointW, and SetVolumeMountPointW directly.
/// No shelling out to `mountvol` — we get precise error codes for
/// robust retry logic when Windows Defender holds the volume.

#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{GetLastError, ERROR_ACCESS_DENIED};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Storage::FileSystem::{
    DeleteVolumeMountPointW, GetVolumeNameForVolumeMountPointW, SetVolumeMountPointW,
};

use std::thread;
use std::time::Duration;

/// Windows error code for "device is in use" (0x2A4 = 676)
#[cfg(target_os = "windows")]
const ERROR_DEVICE_IN_USE: u32 = 676;

/// Encode a Rust string as a null-terminated wide (UTF-16LE) buffer for Win32 calls.
#[cfg(target_os = "windows")]
fn to_wide_null(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0u16)).collect()
}

/// Decode a null-terminated UTF-16LE buffer back to a Rust String.
#[cfg(target_os = "windows")]
fn from_wide_null(buf: &[u16]) -> String {
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..end])
}

/// Retrieve the Volume GUID path for a mounted drive letter.
///
/// Input:  `"E:\\"` (must have trailing backslash)
/// Output: `"\\\\?\\Volume{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}\\"`
///
/// # Errors
/// Returns an error string if the Win32 call fails.
#[cfg(target_os = "windows")]
pub fn get_volume_guid(drive_letter: &str) -> Result<String, String> {
    // Ensure drive_letter ends with backslash, e.g. "E:\"
    let mount_point = if drive_letter.ends_with('\\') {
        drive_letter.to_string()
    } else {
        format!("{}\\", drive_letter)
    };

    let wide_mount = to_wide_null(&mount_point);
    let mut guid_buf: Vec<u16> = vec![0u16; 100]; // MAX_PATH is 260, 100 is plenty for a GUID path

    let result = unsafe {
        GetVolumeNameForVolumeMountPointW(
            wide_mount.as_ptr(),
            guid_buf.as_mut_ptr(),
            guid_buf.len() as u32,
        )
    };

    if result == 0 {
        let err = unsafe { GetLastError() };
        return Err(format!(
            "GetVolumeNameForVolumeMountPointW failed for '{}': Win32 error {}",
            mount_point, err
        ));
    }

    Ok(from_wide_null(&guid_buf))
}

/// Remove the drive letter mount point, hiding the volume from Explorer.
///
/// Retries up to `max_retries` times with exponential backoff if the volume
/// is locked by Windows Defender or another process (ERROR_DEVICE_IN_USE
/// or ERROR_ACCESS_DENIED).
///
/// Input: `"E:\\"` (must have trailing backslash)
///
/// # Errors
/// Returns an error string if all retry attempts are exhausted.
#[cfg(target_os = "windows")]
pub fn remove_drive_letter(drive_letter: &str, max_retries: u32) -> Result<(), String> {
    let mount_point = if drive_letter.ends_with('\\') {
        drive_letter.to_string()
    } else {
        format!("{}\\", drive_letter)
    };

    let wide_mount = to_wide_null(&mount_point);

    for attempt in 0..=max_retries {
        let result = unsafe { DeleteVolumeMountPointW(wide_mount.as_ptr()) };

        if result != 0 {
            // Success
            return Ok(());
        }

        let err = unsafe { GetLastError() };

        // If the error is a transient lock (Defender scanning, etc.), retry
        if (err == ERROR_DEVICE_IN_USE || err == ERROR_ACCESS_DENIED) && attempt < max_retries {
            let backoff = Duration::from_secs(2u64.pow(attempt));
            eprintln!(
                "[VaultDrive] Drive '{}' is in use (Win32 error {}). Retry {}/{} in {:?}...",
                mount_point,
                err,
                attempt + 1,
                max_retries,
                backoff
            );
            thread::sleep(backoff);
            continue;
        }

        return Err(format!(
            "DeleteVolumeMountPointW failed for '{}': Win32 error {} (attempt {}/{})",
            mount_point,
            err,
            attempt + 1,
            max_retries + 1
        ));
    }

    Err(format!(
        "Failed to remove drive letter '{}' after {} retries",
        mount_point,
        max_retries + 1
    ))
}

/// Restore a drive letter mount point for a given Volume GUID.
///
/// Input: `drive_letter = "E:\\"`, `volume_guid = "\\\\?\\Volume{...}\\"`
///
/// # Errors
/// Returns an error string if the Win32 call fails.
#[cfg(target_os = "windows")]
pub fn restore_drive_letter(drive_letter: &str, volume_guid: &str) -> Result<(), String> {
    let mount_point = if drive_letter.ends_with('\\') {
        drive_letter.to_string()
    } else {
        format!("{}\\", drive_letter)
    };

    let wide_mount = to_wide_null(&mount_point);
    let wide_guid = to_wide_null(volume_guid);

    let result = unsafe { SetVolumeMountPointW(wide_mount.as_ptr(), wide_guid.as_ptr()) };

    if result == 0 {
        let err = unsafe { GetLastError() };
        return Err(format!(
            "SetVolumeMountPointW failed for '{}' -> '{}': Win32 error {}",
            mount_point, volume_guid, err
        ));
    }

    Ok(())
}

// Stub implementations for non-Windows platforms (compile-only, not functional)
#[cfg(not(target_os = "windows"))]
pub fn get_volume_guid(_drive_letter: &str) -> Result<String, String> {
    Err("Volume GUID retrieval is only supported on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn remove_drive_letter(_drive_letter: &str, _max_retries: u32) -> Result<(), String> {
    Err("Drive letter removal is only supported on Windows".to_string())
}

#[cfg(not(target_os = "windows"))]
pub fn restore_drive_letter(_drive_letter: &str, _volume_guid: &str) -> Result<(), String> {
    Err("Drive letter restoration is only supported on Windows".to_string())
}
