import { Shield, ShieldOff, HardDrive, Lock } from "lucide-react";

interface LockedVolume {
  guid: string;
  original_letter: string;
  locked_at: string;
  key_verified: boolean;
}

interface StatusBarProps {
  lockedVolume: LockedVolume | null;
  isScanning: boolean;
  onUnlock: () => void;
}

export function StatusBar({ lockedVolume, isScanning, onUnlock }: StatusBarProps) {
  // Truncate GUID for display: \\?\Volume{abc...xyz}\
  const truncateGuid = (guid: string) => {
    const match = guid.match(/\{([^}]+)\}/);
    if (!match) return guid;
    const full = match[1];
    if (full.length > 12) {
      return `{${full.slice(0, 6)}…${full.slice(-4)}}`;
    }
    return `{${full}}`;
  };

  return (
    <header className="status-bar">
      <div className="status-bar-left">
        <div className="status-bar-logo">
          <Shield className="status-bar-icon" />
          <div>
            <h1 className="status-bar-title">VaultDrive</h1>
            <p className="status-bar-subtitle">Secure File Transfer</p>
          </div>
        </div>
      </div>

      <div className="status-bar-center">
        {isScanning ? (
          <div className="status-badge scanning">
            <div className="pulse-dot" />
            <span>Scanning USB…</span>
          </div>
        ) : lockedVolume ? (
          <div className="status-badge connected">
            <Lock size={14} />
            <span>
              {lockedVolume.original_letter.replace("\\", "")} → {truncateGuid(lockedVolume.guid)}
            </span>
          </div>
        ) : (
          <div className="status-badge disconnected">
            <ShieldOff size={14} />
            <span>No VaultDrive Connected</span>
          </div>
        )}
      </div>

      <div className="status-bar-right">
        {lockedVolume && (
          <button className="unlock-btn" onClick={onUnlock} title="Restore drive letter and disconnect">
            <HardDrive size={14} />
            <span>Unlock</span>
          </button>
        )}
      </div>
    </header>
  );
}
