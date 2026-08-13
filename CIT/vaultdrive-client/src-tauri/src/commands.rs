/// commands.rs — Tauri IPC Command Handlers
///
/// All commands exposed to the React frontend via `tauri::command`.
/// File operations use raw Volume GUID paths (\\?\Volume{GUID}\) so they
/// work even after the drive letter has been removed from Explorer.
/// All I/O is async via tokio to keep the UI responsive.

use crate::daemon::{self, UsbDrive};
use crate::state::{AppState, LockedVolume};
use crate::volume;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

// ─── Data types returned to frontend ────────────────────────────────

/// A single file/directory entry for the file browser.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    /// Size in bytes (0 for directories)
    pub size: u64,
    pub is_dir: bool,
}

/// Result of a file transfer operation.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferResult {
    pub success: bool,
    pub bytes_copied: u64,
    pub message: String,
}

// ─── USB Detection & Lockdown (Step 3) ──────────────────────────────

/// Detect removable USB drives. Called before lockdown.
#[tauri::command]
pub async fn detect_usb_drives() -> Result<Vec<UsbDrive>, String> {
    // Run the blocking PowerShell call on a background thread
    tokio::task::spawn_blocking(|| daemon::detect_usb_drives())
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Lock down a USB drive: verify key, get GUID, remove drive letter.
/// Stores the locked volume in app state so we can browse it.
#[tauri::command]
pub async fn scan_and_lock_usb(
    drive_letter: String,
    state: State<'_, AppState>,
) -> Result<LockedVolume, String> {
    let local_key_path = {
        let path = state.local_key_path.lock().map_err(|e| e.to_string())?;
        path.clone()
    };

    // Run the blocking lockdown on a background thread
    let locked = tokio::task::spawn_blocking(move || {
        daemon::lockdown_drive(&drive_letter, &local_key_path)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))??;

    // Store in app state
    let mut volumes = state.locked_volumes.lock().map_err(|e| e.to_string())?;
    volumes.push(locked.clone());

    Ok(locked)
}

/// Get the list of currently locked volumes.
#[tauri::command]
pub async fn get_locked_volumes(state: State<'_, AppState>) -> Result<Vec<LockedVolume>, String> {
    let volumes = state.locked_volumes.lock().map_err(|e| e.to_string())?;
    Ok(volumes.clone())
}

// ─── File Browsing (Step 4) ─────────────────────────────────────────

/// Read directory contents from a Volume GUID path (the locked USB).
///
/// `volume_guid`:   e.g. "\\?\Volume{xxxx}\"
/// `relative_path`: e.g. "" (root) or "Documents/Reports"
///
/// All paths are constructed from the GUID — no drive letters used.
#[tauri::command]
pub async fn read_vault_directory(
    volume_guid: String,
    relative_path: String,
) -> Result<Vec<FileEntry>, String> {
    tokio::task::spawn_blocking(move || {
        // Build the full path: \\?\Volume{GUID}\relative\path
        let base = if volume_guid.ends_with('\\') {
            volume_guid.clone()
        } else {
            format!("{}\\", volume_guid)
        };

        let full_path = if relative_path.is_empty() {
            PathBuf::from(&base)
        } else {
            PathBuf::from(&base).join(&relative_path)
        };

        read_dir_entries(&full_path)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Read a standard local directory (e.g. C:\Users\...\Documents).
#[tauri::command]
pub async fn read_local_directory(path: String) -> Result<Vec<FileEntry>, String> {
    tokio::task::spawn_blocking(move || {
        let dir_path = PathBuf::from(&path);
        read_dir_entries(&dir_path)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Internal helper: read entries from a directory path and return FileEntry list.
fn read_dir_entries(dir_path: &PathBuf) -> Result<Vec<FileEntry>, String> {
    if !dir_path.exists() {
        return Err(format!("Path does not exist: {}", dir_path.display()));
    }

    let read_dir =
        std::fs::read_dir(dir_path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut entries: Vec<FileEntry> = Vec::new();

    for entry_result in read_dir {
        match entry_result {
            Ok(entry) => {
                let name = entry.file_name().to_string_lossy().to_string();

                // Skip hidden .vaultdrive directory from browser view
                if name == ".vaultdrive" {
                    continue;
                }

                let metadata = entry.metadata();
                let (size, is_dir) = match metadata {
                    Ok(m) => (if m.is_dir() { 0 } else { m.len() }, m.is_dir()),
                    Err(_) => (0, false),
                };

                entries.push(FileEntry { name, size, is_dir });
            }
            Err(e) => {
                eprintln!("[VaultDrive] Skipping unreadable entry: {}", e);
            }
        }
    }

    // Sort: directories first, then files, alphabetically within each group
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

// ─── File Transfer ──────────────────────────────────────────────────

/// Copy a file between the local filesystem and the VaultDrive (or vice versa).
/// Source and destination are full paths (GUID paths for VaultDrive side).
#[tauri::command]
pub async fn copy_file(source: String, destination: String) -> Result<TransferResult, String> {
    tokio::task::spawn_blocking(move || {
        let src = PathBuf::from(&source);
        let dst = PathBuf::from(&destination);

        if !src.exists() {
            return Err(format!("Source file does not exist: {}", source));
        }

        if src.is_dir() {
            return Err("Directory copy is not yet supported. Select individual files.".to_string());
        }

        // Ensure destination parent directory exists
        if let Some(parent) = dst.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create destination directory: {}", e))?;
            }
        }

        let bytes_copied = std::fs::copy(&src, &dst)
            .map_err(|e| format!("File copy failed: {}", e))?;

        Ok(TransferResult {
            success: true,
            bytes_copied,
            message: format!(
                "Copied {} ({} bytes)",
                src.file_name().unwrap_or_default().to_string_lossy(),
                bytes_copied
            ),
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

// ─── Unlock / Restore ───────────────────────────────────────────────

/// Restore the drive letter for a locked volume (e.g. on app exit).
#[tauri::command]
pub async fn unlock_drive(
    volume_guid: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let mut volumes = state.locked_volumes.lock().map_err(|e| e.to_string())?;

    let idx = volumes
        .iter()
        .position(|v| v.guid == volume_guid)
        .ok_or_else(|| format!("Volume GUID not found in locked volumes: {}", volume_guid))?;

    let vol = volumes[idx].clone();

    // Restore the drive letter
    volume::restore_drive_letter(&vol.original_letter, &vol.guid)?;

    volumes.remove(idx);

    Ok(format!(
        "Drive letter {} restored for {}",
        vol.original_letter, vol.guid
    ))
}

/// Unlock ALL locked volumes. Called during graceful shutdown.
#[tauri::command]
pub async fn unlock_all_drives(state: State<'_, AppState>) -> Result<String, String> {
    let mut volumes = state.locked_volumes.lock().map_err(|e| e.to_string())?;
    let mut errors: Vec<String> = Vec::new();

    for vol in volumes.iter() {
        if let Err(e) = volume::restore_drive_letter(&vol.original_letter, &vol.guid) {
            errors.push(format!("{}: {}", vol.original_letter, e));
        }
    }

    let count = volumes.len();
    volumes.clear();

    if errors.is_empty() {
        Ok(format!("All {} drive(s) unlocked successfully", count))
    } else {
        Err(format!(
            "Unlocked {} drive(s) with {} error(s): {}",
            count,
            errors.len(),
            errors.join("; ")
        ))
    }
}
