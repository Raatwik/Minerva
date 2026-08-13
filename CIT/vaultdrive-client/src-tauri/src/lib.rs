/// lib.rs — VaultDrive Client entry point.
///
/// Registers all Tauri commands and manages app state.
/// On exit, attempts to restore all locked drive letters.
///
/// The local master key is stored at:
///   Windows: %APPDATA%\com.vaultdrive.client\data\master.key
///
/// This path is resolved at runtime via Tauri's app_data_dir(), so it is
/// always correct regardless of the process CWD (which changes between
/// `cargo tauri dev` and a packaged install).

mod commands;
mod daemon;
mod state;
mod volume;

use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Resolve a stable, absolute path for the local master key using
            // Tauri's canonical app data directory — never depends on CWD.
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("[VaultDrive] Failed to resolve app data directory");

            let key_dir = app_data_dir.join("data");
            std::fs::create_dir_all(&key_dir)
                .expect("[VaultDrive] Failed to create key data directory");

            let key_path = key_dir
                .join("master.key")
                .to_string_lossy()
                .into_owned();

            eprintln!("[VaultDrive] Local key path: {}", key_path);

            app.manage(AppState::with_key_path(key_path));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::detect_usb_drives,
            commands::scan_and_lock_usb,
            commands::get_locked_volumes,
            commands::read_vault_directory,
            commands::read_local_directory,
            commands::copy_file,
            commands::check_and_apply_updates,
            commands::unlock_drive,
            commands::unlock_all_drives,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
