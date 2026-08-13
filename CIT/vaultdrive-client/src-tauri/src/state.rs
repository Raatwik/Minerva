/// state.rs — Application state management for VaultDrive client.
///
/// Holds the set of locked volumes (Volume GUIDs) that our app
/// has taken ownership of. This lets the frontend browse them
/// and lets us restore drive letters on exit.

use serde::{Deserialize, Serialize};
use std::sync::Mutex;

/// Represents a single locked USB volume.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockedVolume {
    /// Raw Volume GUID path, e.g. "\\?\Volume{xxxx-xxxx}\\"
    pub guid: String,
    /// The original drive letter, e.g. "E:\\"
    pub original_letter: String,
    /// ISO timestamp when the lockdown was performed
    pub locked_at: String,
    /// Whether the master key was verified on this volume
    pub key_verified: bool,
}

/// Application-wide shared state, managed by Tauri.
pub struct AppState {
    /// All volumes we have locked during this session.
    pub locked_volumes: Mutex<Vec<LockedVolume>>,
    /// Path to the locally installed master key file for verification.
    pub local_key_path: Mutex<String>,
}

impl AppState {
    /// Construct with an absolute, pre-resolved key path.
    /// Prefer this over `new()` so the path never depends on CWD.
    pub fn with_key_path(path: String) -> Self {
        Self {
            locked_volumes: Mutex::new(Vec::new()),
            local_key_path: Mutex::new(path),
        }
    }

    /// Fallback constructor — key path resolved relative to CWD.
    /// Only use this in tests or if setup() fails to provide an absolute path.
    pub fn new() -> Self {
        Self::with_key_path(String::from("./data/master.key"))
    }
}
