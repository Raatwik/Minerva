import { useState } from "react";
import {
  Folder,
  File,
  ChevronLeft,
  Loader2,
  AlertCircle,
  FolderOpen,
  ArrowUpFromLine,
} from "lucide-react";

export interface FileEntry {
  name: string;
  size: number;
  is_dir: boolean;
}

interface FileBrowserProps {
  /** Label shown in the panel header */
  label: string;
  /** Accent colour class — "local" or "vault" */
  variant: "local" | "vault";
  /** Currently displayed entries */
  entries: FileEntry[];
  /** Whether we're loading directory contents */
  loading: boolean;
  /** Error message if directory read failed */
  error: string | null;
  /** Current breadcrumb path segments */
  pathSegments: string[];
  /** Called when user clicks a directory to navigate into it */
  onNavigate: (dirName: string) => void;
  /** Called when user clicks the back button */
  onBack: () => void;
  /** Called when user selects a file for transfer */
  onSelect: (entry: FileEntry) => void;
  /** Currently selected file name */
  selectedFile: string | null;
  /** Whether the panel is disabled (e.g. no vault connected) */
  disabled?: boolean;
}

/** Format bytes into human-readable string */
function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0);
  return `${size} ${units[i]}`;
}

export function FileBrowser({
  label,
  variant,
  entries,
  loading,
  error,
  pathSegments,
  onNavigate,
  onBack,
  onSelect,
  selectedFile,
  disabled = false,
}: FileBrowserProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const breadcrumb = pathSegments.length > 0 ? pathSegments.join(" / ") : "Root";

  return (
    <div className={`file-browser ${variant} ${disabled ? "disabled" : ""}`}>
      {/* Panel Header */}
      <div className="fb-header">
        <div className="fb-header-left">
          <div className={`fb-indicator ${variant}`} />
          <h2 className="fb-title">{label}</h2>
        </div>
        <span className="fb-entry-count">
          {loading ? "…" : `${entries.length} items`}
        </span>
      </div>

      {/* Breadcrumb / Navigation */}
      <div className="fb-breadcrumb">
        <button
          className="fb-back-btn"
          onClick={onBack}
          disabled={pathSegments.length === 0 || disabled}
          title="Go back"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="fb-path">
          <FolderOpen size={14} className="fb-path-icon" />
          <span>{breadcrumb}</span>
        </div>
      </div>

      {/* File List */}
      <div className="fb-list-container">
        {loading ? (
          <div className="fb-empty-state">
            <Loader2 size={28} className="spin" />
            <p>Loading…</p>
          </div>
        ) : error ? (
          <div className="fb-empty-state error">
            <AlertCircle size={28} />
            <p>{error}</p>
          </div>
        ) : disabled ? (
          <div className="fb-empty-state">
            <ArrowUpFromLine size={28} />
            <p>Connect a VaultDrive to browse</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="fb-empty-state">
            <Folder size={28} />
            <p>Empty directory</p>
          </div>
        ) : (
          <ul className="fb-list">
            {entries.map((entry, idx) => (
              <li
                key={entry.name}
                className={`fb-entry ${
                  selectedFile === entry.name ? "selected" : ""
                } ${hoveredIndex === idx ? "hovered" : ""}`}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => {
                  if (entry.is_dir) {
                    onNavigate(entry.name);
                  } else {
                    onSelect(entry);
                  }
                }}
              >
                <div className="fb-entry-icon">
                  {entry.is_dir ? (
                    <Folder size={18} className="icon-folder" />
                  ) : (
                    <File size={18} className="icon-file" />
                  )}
                </div>
                <span className="fb-entry-name">{entry.name}</span>
                <span className="fb-entry-size">
                  {entry.is_dir ? "Folder" : formatSize(entry.size)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
