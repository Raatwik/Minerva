import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { StatusBar } from "./components/StatusBar";
import { FileBrowser, FileEntry } from "./components/FileBrowser";
import {
  ArrowRightLeft,
  Usb,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
} from "lucide-react";
import "./App.css";

/* ──────────────────────────── Types ──────────────────────────── */

interface LockedVolume {
  guid: string;
  original_letter: string;
  locked_at: string;
  key_verified: boolean;
}

interface UsbDrive {
  letter: string;
  label: string;
  size_gb: string;
}

interface TransferResult {
  success: boolean;
  bytes_copied: number;
  message: string;
  blocked?: boolean;
  reasons?: string[];
  quarantine_path?: string | null;
}

interface UpdateResult {
  found: boolean;
  applied: number;
  deleted: number;
  messages: string[];
}

interface Toast {
  id: number;
  type: "success" | "error" | "info";
  text: string;
}

/* ─────────────────────────── Toast ─────────────────────────── */

function ToastBar({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const icons = {
    success: <CheckCircle2 size={16} />,
    error: <AlertCircle size={16} />,
    info: <Usb size={16} />,
  };

  return (
    <div className={`toast toast-${toast.type}`}>
      {icons[toast.type]}
      <span>{toast.text}</span>
    </div>
  );
}

/* ─────────────────────────── App ──────────────────────────── */

export default function App() {
  // ── Connection state ──
  const [lockedVolume, setLockedVolume] = useState<LockedVolume | null>(null);
  const [detectedDrives, setDetectedDrives] = useState<UsbDrive[]>([]);
  const [selectedDriveLetter, setSelectedDriveLetter] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isLocking, setIsLocking] = useState(false);

  // ── Local browser state ──
  const [localPath, setLocalPath] = useState<string[]>([]);
  const [localEntries, setLocalEntries] = useState<FileEntry[]>([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [localSelected, setLocalSelected] = useState<string | null>(null);
  const [localBasePath, setLocalBasePath] = useState("");

  // ── Vault browser state ──
  const [vaultPath, setVaultPath] = useState<string[]>([]);
  const [vaultEntries, setVaultEntries] = useState<FileEntry[]>([]);
  const [vaultLoading, setVaultLoading] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultSelected, setVaultSelected] = useState<string | null>(null);

  // ── Transfer state ──
  const [transferring, setTransferring] = useState(false);

  // ── Toasts ──
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: Toast["type"], text: string) => {
    setToasts((prev) => [...prev, { id: Date.now(), type, text }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /* ── Determine default local base path (user's home) ── */
  useEffect(() => {
    // Use USERPROFILE on Windows, HOME on others
    const home =
      typeof window !== "undefined"
        ? "C:\\Users"
        : "/home";
    setLocalBasePath(home);
  }, []);

  /* ── Load local directory ── */
  const loadLocalDir = useCallback(
    async (segments: string[]) => {
      if (!localBasePath) return;
      setLocalLoading(true);
      setLocalError(null);
      try {
        const fullPath =
          segments.length > 0
            ? `${localBasePath}\\${segments.join("\\")}`
            : localBasePath;
        const entries: FileEntry[] = await invoke("read_local_directory", {
          path: fullPath,
        });
        setLocalEntries(entries);
        setLocalPath(segments);
        setLocalSelected(null);
      } catch (e) {
        setLocalError(String(e));
        setLocalEntries([]);
      } finally {
        setLocalLoading(false);
      }
    },
    [localBasePath]
  );

  /* ── Load vault directory ── */
  const loadVaultDir = useCallback(
    async (segments: string[]) => {
      if (!lockedVolume) return;
      setVaultLoading(true);
      setVaultError(null);
      try {
        const entries: FileEntry[] = await invoke("read_vault_directory", {
          volumeGuid: lockedVolume.guid,
          relativePath: segments.join("\\"),
        });
        setVaultEntries(entries);
        setVaultPath(segments);
        setVaultSelected(null);
      } catch (e) {
        setVaultError(String(e));
        setVaultEntries([]);
      } finally {
        setVaultLoading(false);
      }
    },
    [lockedVolume]
  );

  /* ── Initial local directory load ── */
  useEffect(() => {
    if (localBasePath) {
      loadLocalDir([]);
    }
  }, [localBasePath, loadLocalDir]);

  /* ── Load vault root when volume is locked ── */
  useEffect(() => {
    if (lockedVolume) {
      loadVaultDir([]);
    }
  }, [lockedVolume, loadVaultDir]);

  /* ── Detect USB drives ── */
  const scanForDrives = async () => {
    setIsScanning(true);
    try {
      const drives: UsbDrive[] = await invoke("detect_usb_drives");
      setDetectedDrives(drives);
      if (drives.length > 0 && !selectedDriveLetter) {
        setSelectedDriveLetter(drives[0].letter);
      }
      if (drives.length === 0) {
        addToast("info", "No removable USB drives detected.");
      }
    } catch (e) {
      addToast("error", `Drive detection failed: ${e}`);
    } finally {
      setIsScanning(false);
    }
  };

  /* ── Lock a USB drive ── */
  const lockDrive = async () => {
    if (!selectedDriveLetter) {
      addToast("error", "Select a USB drive first.");
      return;
    }
    setIsLocking(true);
    try {
      const vol: LockedVolume = await invoke("scan_and_lock_usb", {
        driveLetter: selectedDriveLetter,
      });
      setLockedVolume(vol);
      addToast("success", `Drive locked: ${vol.original_letter} → ${vol.guid.slice(0, 30)}…`);

      // Check for intelligence updates on the USB
      try {
        const updateResult: UpdateResult = await invoke("check_and_apply_updates", {
          volumeGuid: vol.guid,
        });
        if (updateResult.found && updateResult.applied > 0) {
          addToast(
            "success",
            `Applied ${updateResult.applied} intelligence update(s). Scanning rules refreshed.`
          );
        } else if (updateResult.found && updateResult.applied === 0) {
          addToast("info", "Update packages found but none were valid.");
        }
      } catch (e) {
        addToast("error", `Intelligence update check failed: ${e}`);
      }
    } catch (e) {
      addToast("error", `Lockdown failed: ${e}`);
    } finally {
      setIsLocking(false);
    }
  };

  /* ── Unlock ── */
  const unlockDrive = async () => {
    if (!lockedVolume) return;
    try {
      await invoke("unlock_drive", { volumeGuid: lockedVolume.guid });
      addToast("success", `Drive ${lockedVolume.original_letter} unlocked and restored.`);
      setLockedVolume(null);
      setVaultEntries([]);
      setVaultPath([]);
      setVaultSelected(null);
    } catch (e) {
      addToast("error", `Unlock failed: ${e}`);
    }
  };

  /* ── File Transfer ── */
  const handleTransfer = async (direction: "toVault" | "toLocal") => {
    if (!lockedVolume) {
      addToast("error", "No VaultDrive connected.");
      return;
    }

    if (direction === "toVault" && !localSelected) {
      addToast("error", "Select a file from the local panel first.");
      return;
    }
    if (direction === "toLocal" && !vaultSelected) {
      addToast("error", "Select a file from the VaultDrive panel first.");
      return;
    }

    setTransferring(true);
    try {
      let source: string;
      let destination: string;

      if (direction === "toVault") {
        // Local → Vault
        const localFullPath =
          localPath.length > 0
            ? `${localBasePath}\\${localPath.join("\\")}\\${localSelected}`
            : `${localBasePath}\\${localSelected}`;
        const vaultBase = lockedVolume.guid.endsWith("\\")
          ? lockedVolume.guid
          : `${lockedVolume.guid}\\`;
        const vaultDest =
          vaultPath.length > 0
            ? `${vaultBase}${vaultPath.join("\\")}\\${localSelected}`
            : `${vaultBase}${localSelected}`;
        source = localFullPath;
        destination = vaultDest;
      } else {
        // Vault → Local
        const vaultBase = lockedVolume.guid.endsWith("\\")
          ? lockedVolume.guid
          : `${lockedVolume.guid}\\`;
        const vaultFullPath =
          vaultPath.length > 0
            ? `${vaultBase}${vaultPath.join("\\")}\\${vaultSelected}`
            : `${vaultBase}${vaultSelected}`;
        const localDest =
          localPath.length > 0
            ? `${localBasePath}\\${localPath.join("\\")}\\${vaultSelected}`
            : `${localBasePath}\\${vaultSelected}`;
        source = vaultFullPath;
        destination = localDest;
      }

      const result: TransferResult = await invoke("copy_file", {
        source,
        destination,
      });

      if (result.success) {
        addToast("success", result.message);
        // Refresh the destination panel
        if (direction === "toVault") {
          loadVaultDir(vaultPath);
        } else {
          loadLocalDir(localPath);
        }
      } else if (result.blocked) {
        const reasonList =
          result.reasons && result.reasons.length > 0
            ? result.reasons.join(" • ")
            : "Policy violation";
        addToast(
          "error",
          `Transfer BLOCKED by scanning engine — ${reasonList}. File quarantined.`
        );
      } else {
        addToast("error", result.message || "Transfer failed.");
      }
    } catch (e) {
      addToast("error", `Transfer failed: ${e}`);
    } finally {
      setTransferring(false);
    }
  };

  /* ──────────────────── Render ──────────────────── */

  return (
    <div className="app-container">
      {/* Toast Layer */}
      <div className="toast-container">
        {toasts.map((t) => (
          <ToastBar key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </div>

      {/* Status Bar */}
      <StatusBar
        lockedVolume={lockedVolume}
        isScanning={isScanning}
        onUnlock={unlockDrive}
      />

      {/* Connection Panel (shown when no drive is locked) */}
      {!lockedVolume && (
        <div className="connect-panel">
          <div className="connect-card">
            <Usb size={32} className="connect-icon" />
            <h2>Connect VaultDrive</h2>
            <p>Insert a provisioned USB drive and scan to begin secure file transfer.</p>

            <div className="connect-controls">
              <div className="drive-select-wrapper">
                <select
                  className="drive-select"
                  value={selectedDriveLetter}
                  onChange={(e) => setSelectedDriveLetter(e.target.value)}
                  disabled={detectedDrives.length === 0}
                >
                  {detectedDrives.length === 0 && (
                    <option value="">No drives detected</option>
                  )}
                  {detectedDrives.map((d) => (
                    <option key={d.letter} value={d.letter}>
                      {d.letter.replace("\\", "")} — {d.label} ({d.size_gb} GB)
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="select-chevron" />
              </div>

              <button
                className="btn btn-secondary"
                onClick={scanForDrives}
                disabled={isScanning}
              >
                {isScanning ? <Loader2 size={16} className="spin" /> : <Usb size={16} />}
                {isScanning ? "Scanning…" : "Scan for Drives"}
              </button>

              <button
                className="btn btn-primary"
                onClick={lockDrive}
                disabled={!selectedDriveLetter || isLocking}
              >
                {isLocking ? <Loader2 size={16} className="spin" /> : null}
                {isLocking ? "Locking…" : "Lock & Connect"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dual-Pane File Browser (shown when drive is locked) */}
      {lockedVolume && (
        <div className="browser-layout">
          {/* Local Panel */}
          <FileBrowser
            label="Local Host"
            variant="local"
            entries={localEntries}
            loading={localLoading}
            error={localError}
            pathSegments={localPath}
            onNavigate={(dir) => loadLocalDir([...localPath, dir])}
            onBack={() => {
              if (localPath.length > 0) {
                loadLocalDir(localPath.slice(0, -1));
              }
            }}
            onSelect={(entry) => setLocalSelected(entry.name)}
            selectedFile={localSelected}
          />

          {/* Transfer Controls */}
          <div className="transfer-column">
            <button
              className="transfer-btn"
              onClick={() => handleTransfer("toVault")}
              disabled={!localSelected || transferring}
              title="Copy selected local file to VaultDrive"
            >
              <ArrowRightLeft size={18} />
              <span>→ Vault</span>
            </button>
            <button
              className="transfer-btn"
              onClick={() => handleTransfer("toLocal")}
              disabled={!vaultSelected || transferring}
              title="Copy selected VaultDrive file to local"
            >
              <ArrowRightLeft size={18} />
              <span>← Local</span>
            </button>
            {transferring && (
              <div className="transfer-indicator">
                <Loader2 size={16} className="spin" />
                <span>Transferring…</span>
              </div>
            )}
          </div>

          {/* Vault Panel */}
          <FileBrowser
            label="VaultDrive"
            variant="vault"
            entries={vaultEntries}
            loading={vaultLoading}
            error={vaultError}
            pathSegments={vaultPath}
            onNavigate={(dir) => loadVaultDir([...vaultPath, dir])}
            onBack={() => {
              if (vaultPath.length > 0) {
                loadVaultDir(vaultPath.slice(0, -1));
              }
            }}
            onSelect={(entry) => setVaultSelected(entry.name)}
            selectedFile={vaultSelected}
          />
        </div>
      )}
    </div>
  );
}
