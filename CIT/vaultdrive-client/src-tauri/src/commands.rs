/// commands.rs — Tauri IPC Command Handlers
///
/// All commands exposed to the React frontend via `tauri::command`.
/// File operations use raw Volume GUID paths (\\?\Volume{GUID}\) so they
/// work even after the drive letter has been removed from Explorer.
/// All I/O is async via tokio to keep the UI responsive.

use crate::daemon::{self, UsbDrive};
use crate::state::{AppState, LockedVolume};
use crate::volume;
use scanning_engine::{DlpPatternConfig, ScanPipeline};
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::path::{Path, PathBuf};
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
    /// True when the transfer was aborted by the scanning engine.
    #[serde(default)]
    pub blocked: bool,
    /// Human-readable reasons the scan failed (empty when it passed).
    #[serde(default)]
    pub reasons: Vec<String>,
    /// Absolute path of the quarantined copy, if any.
    #[serde(default)]
    pub quarantine_path: Option<String>,
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
///
/// The file bytes are streamed through the Scanning Engine (YARA + entropy +
/// financial DLP). If the scan fails the transfer is aborted, the offending
/// file is copied into `<vault>/.vaultdrive/quarantine/` and a JSON event log
/// is written to `<vault>/.vaultdrive/logs/`.
///
/// Source and destination are full paths (GUID paths for the VaultDrive side).
#[tauri::command]
pub async fn copy_file(
    source: String,
    destination: String,
    state: State<'_, AppState>,
) -> Result<TransferResult, String> {
    let pipeline = build_pipeline(&state)?;
    tokio::task::spawn_blocking(move || {
        let src = PathBuf::from(&source);
        let dst = PathBuf::from(&destination);

        if !src.exists() {
            return Err(format!("Source file does not exist: {}", source));
        }

        if src.is_dir() {
            return Err("Directory copy is not yet supported. Select individual files.".to_string());
        }

        // Identify the vault base path from whichever side is a volume GUID
        // path so we can place quarantine/log files on the vault.
        let vault_base = detect_vault_base(&src)
            .or_else(|| detect_vault_base(&dst))
            .ok_or_else(|| {
                "Could not determine VaultDrive location for scanning/quarantine.".to_string()
            })?;

        // Read source into memory (streamed via BufReader) for scanning.
        let file_bytes = read_file_bytes(&src)
            .map_err(|e| format!("Failed to read source for scanning: {}", e))?;

        let verdict = pipeline
            .scan(&file_bytes)
            .map_err(|e| format!("Scan failed: {}", e))?;

        let file_name = src
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "unknown".to_string());

        if !verdict.passed {
            // Move (copy + best-effort record) the offending file to quarantine
            // on the vault, then write a JSON event log next to it.
            let quarantine_path = quarantine_file(&vault_base, &file_name, &file_bytes)
                .map_err(|e| format!("Failed to write quarantine copy: {}", e))?;

            let log_path = write_event_log(
                &vault_base,
                &file_name,
                &src,
                &dst,
                &verdict,
                &quarantine_path,
            )
            .map_err(|e| format!("Failed to write scan event log: {}", e))?;

            eprintln!(
                "[VaultDrive] BLOCKED {} — reasons: {:?} — quarantine: {} — log: {}",
                file_name,
                verdict.reasons,
                quarantine_path.display(),
                log_path.display()
            );

            return Ok(TransferResult {
                success: false,
                bytes_copied: 0,
                message: format!(
                    "Transfer blocked by scanning engine: {}",
                    verdict.reasons.join("; ")
                ),
                blocked: true,
                reasons: verdict.reasons,
                quarantine_path: Some(quarantine_path.to_string_lossy().into_owned()),
            });
        }

        // Scan passed — perform the actual copy.
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
            message: format!("Copied {} ({} bytes)", file_name, bytes_copied),
            blocked: false,
            reasons: Vec::new(),
            quarantine_path: None,
        })
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

/// Extract the `\\?\Volume{GUID}\` prefix from a path if present.
fn detect_vault_base(path: &Path) -> Option<PathBuf> {
    let s = path.to_string_lossy();
    let prefix = "\\\\?\\Volume{";
    if let Some(start) = s.find(prefix) {
        if let Some(end_rel) = s[start + prefix.len()..].find('}') {
            let end = start + prefix.len() + end_rel + 1; // include '}'
            let base = format!("{}\\", &s[start..end]);
            return Some(PathBuf::from(base));
        }
    }
    None
}

fn read_file_bytes(path: &Path) -> std::io::Result<Vec<u8>> {
    let file = std::fs::File::open(path)?;
    let mut reader = std::io::BufReader::new(file);
    let mut buf = Vec::new();
    reader.read_to_end(&mut buf)?;
    Ok(buf)
}

fn quarantine_file(
    vault_base: &Path,
    file_name: &str,
    bytes: &[u8],
) -> std::io::Result<PathBuf> {
    let quarantine_dir = vault_base.join(".vaultdrive").join("quarantine");
    std::fs::create_dir_all(&quarantine_dir)?;

    let stamped = format!(
        "{}_{}",
        chrono::Utc::now().format("%Y%m%dT%H%M%S%3fZ"),
        sanitize_name(file_name)
    );
    let out_path = quarantine_dir.join(stamped);
    std::fs::write(&out_path, bytes)?;
    Ok(out_path)
}

fn write_event_log(
    vault_base: &Path,
    file_name: &str,
    source: &Path,
    destination: &Path,
    verdict: &scanning_engine::ScanVerdict,
    quarantine_path: &Path,
) -> std::io::Result<PathBuf> {
    let logs_dir = vault_base.join(".vaultdrive").join("logs");
    std::fs::create_dir_all(&logs_dir)?;

    let timestamp = chrono::Utc::now();
    let log_name = format!(
        "{}_{}.json",
        timestamp.format("%Y%m%dT%H%M%S%3fZ"),
        sanitize_name(file_name)
    );
    let log_path = logs_dir.join(log_name);

    let dlp_findings: Vec<serde_json::Value> = verdict
        .dlp_findings
        .iter()
        .map(|f| {
            serde_json::json!({
                "pattern": f.pattern_name,
                "value": f.matched_value,
                "offset": f.offset,
            })
        })
        .collect();

    let payload = serde_json::json!({
        "event": "transfer_blocked",
        "timestamp": timestamp.to_rfc3339(),
        "file_name": file_name,
        "source": source.to_string_lossy(),
        "destination": destination.to_string_lossy(),
        "quarantine_path": quarantine_path.to_string_lossy(),
        "reasons": verdict.reasons,
        "entropy": verdict.entropy,
        "yara_matches": verdict.yara_matches,
        "dlp_findings": dlp_findings,
    });

    std::fs::write(&log_path, serde_json::to_vec_pretty(&payload).unwrap())?;
    Ok(log_path)
}

fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

// ─── Intelligence Update Ingestion (Step 10) ───────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatePackage {
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "yaraRules")]
    pub yara_rules: String,
    #[serde(rename = "dlpPatterns")]
    pub dlp_patterns: Vec<DlpPatternConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanningConfig {
    pub applied_at: String,
    pub source_package: String,
    pub yara_rules: String,
    pub dlp_patterns: Vec<DlpPatternConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateResult {
    pub found: bool,
    pub applied: usize,
    pub deleted: usize,
    pub messages: Vec<String>,
}

fn scanning_config_path(state: &AppState) -> Result<PathBuf, String> {
    let key_path = state.local_key_path.lock().map_err(|e| e.to_string())?;
    let data_dir = PathBuf::from(key_path.as_str())
        .parent()
        .ok_or_else(|| "Cannot determine data directory from key path".to_string())?
        .to_path_buf();
    Ok(data_dir.join("scanning_config.json"))
}

fn build_pipeline(state: &AppState) -> Result<ScanPipeline, String> {
    let config_path = scanning_config_path(state)?;
    if config_path.exists() {
        let raw = std::fs::read_to_string(&config_path)
            .map_err(|e| format!("Failed to read scanning config: {}", e))?;
        let config: ScanningConfig = serde_json::from_str(&raw)
            .map_err(|e| format!("Failed to parse scanning config: {}", e))?;
        ScanPipeline::with_config(&config.yara_rules, &config.dlp_patterns)
            .map_err(|e| format!("Failed to initialize pipeline with custom config: {}", e))
    } else {
        ScanPipeline::new().map_err(|e| format!("Scanning engine initialization failed: {}", e))
    }
}

/// Check for intelligence update packages on the locked USB, apply them
/// to the local scanning engine config, and delete them from the USB.
#[tauri::command]
pub async fn check_and_apply_updates(
    volume_guid: String,
    state: State<'_, AppState>,
) -> Result<UpdateResult, String> {
    let config_path = scanning_config_path(&state)?;

    tokio::task::spawn_blocking(move || {
        let base = if volume_guid.ends_with('\\') {
            volume_guid.clone()
        } else {
            format!("{}\\", volume_guid)
        };
        let updates_dir = PathBuf::from(&base).join(".vaultdrive").join("updates");

        if !updates_dir.exists() || !updates_dir.is_dir() {
            return Ok(UpdateResult {
                found: false,
                applied: 0,
                deleted: 0,
                messages: vec!["No .vaultdrive/updates directory found.".to_string()],
            });
        }

        let mut update_files: Vec<PathBuf> = std::fs::read_dir(&updates_dir)
            .map_err(|e| format!("Failed to read updates directory: {}", e))?
            .filter_map(|entry| entry.ok())
            .map(|entry| entry.path())
            .filter(|p| {
                p.extension()
                    .map(|ext| ext == "json")
                    .unwrap_or(false)
            })
            .collect();

        if update_files.is_empty() {
            return Ok(UpdateResult {
                found: false,
                applied: 0,
                deleted: 0,
                messages: vec!["No update packages found.".to_string()],
            });
        }

        update_files.sort();

        let mut applied = 0;
        let mut deleted = 0;
        let mut messages = Vec::new();

        for file_path in &update_files {
            let file_name = file_path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| "unknown".to_string());

            let raw = match std::fs::read_to_string(file_path) {
                Ok(r) => r,
                Err(e) => {
                    messages.push(format!("Failed to read {}: {}", file_name, e));
                    continue;
                }
            };

            let package: UpdatePackage = match serde_json::from_str(&raw) {
                Ok(p) => p,
                Err(e) => {
                    messages.push(format!("Invalid package {}: {}", file_name, e));
                    continue;
                }
            };

            if package.yara_rules.trim().is_empty() {
                messages.push(format!("Skipping {} — empty YARA rules.", file_name));
                continue;
            }

            if package.dlp_patterns.is_empty() {
                messages.push(format!("Skipping {} — no DLP patterns.", file_name));
                continue;
            }

            // Validate by attempting to build a pipeline with the new config
            if let Err(e) = ScanPipeline::with_config(&package.yara_rules, &package.dlp_patterns) {
                messages.push(format!(
                    "Skipping {} — validation failed: {}",
                    file_name, e
                ));
                continue;
            }

            let config = ScanningConfig {
                applied_at: chrono::Utc::now().to_rfc3339(),
                source_package: file_name.clone(),
                yara_rules: package.yara_rules,
                dlp_patterns: package.dlp_patterns,
            };

            let config_json = serde_json::to_vec_pretty(&config)
                .map_err(|e| format!("Failed to serialize config: {}", e))?;

            std::fs::write(&config_path, config_json)
                .map_err(|e| format!("Failed to write scanning config: {}", e))?;

            applied += 1;
            messages.push(format!("Applied {} (created {}).", file_name, package.created_at));

            match std::fs::remove_file(file_path) {
                Ok(()) => {
                    deleted += 1;
                }
                Err(e) => {
                    messages.push(format!(
                        "Warning: applied {} but failed to delete from USB: {}",
                        file_name, e
                    ));
                }
            }
        }

        Ok(UpdateResult {
            found: true,
            applied,
            deleted,
            messages,
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
