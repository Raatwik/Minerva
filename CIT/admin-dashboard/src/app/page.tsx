"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Key,
  Usb,
  CheckCircle2,
  Loader2,
  AlertCircle,
  RefreshCw,
  HardDrive,
  Fingerprint,
  Clock,
  ChevronRight,
  AlertTriangle,
  FileText,
  ShieldAlert,
  ShieldCheck,
  Upload,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface KeyStatus {
  keyExists: boolean;
  fingerprint?: string;
  generatedAt?: string;
}

interface DetectedDrive {
  letter: string;
  label: string;
  sizeGB: string;
  type: "removable" | "mock";
}

interface Toast {
  id: number;
  type: "success" | "error" | "warning";
  text: string;
}

interface LogEntry {
  file: string;
  event?: string;
  timestamp?: string;
  file_name?: string;
  source?: string;
  destination?: string;
  quarantine_path?: string | null;
  reasons?: string[];
  entropy?: number;
  yara_matches?: string[];
  dlp_findings?: Array<{
    pattern_name?: string;
    matched_value?: string;
    offset?: number;
  }>;
  blocked: boolean;
  parseError?: string;
}

interface LogMetrics {
  total: number;
  blocked: number;
  passed: number;
}

interface DlpPatternRow {
  id: number;
  name: string;
  regex: string;
}

const DEFAULT_YARA_RULES = `rule SuspiciousExecutable {
    meta:
        description = "Detects PE executables with suspicious section names"
    strings:
        $mz = { 4D 5A }
        $upx0 = ".UPX0" ascii
        $upx1 = ".UPX1" ascii
    condition:
        $mz at 0 and ($upx0 or $upx1)
}

rule EicarTestFile {
    meta:
        description = "EICAR antivirus test file"
    strings:
        $eicar = "X5O!P%@AP[4\\\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    condition:
        $eicar
}

rule SuspiciousScript {
    meta:
        description = "Detects scripts with common malicious patterns"
    strings:
        $ps_encoded = "powershell" ascii nocase
        $ps_bypass = "-ExecutionPolicy Bypass" ascii nocase
        $cmd_hidden = "cmd.exe /c" ascii nocase
        $b64_invoke = "FromBase64String" ascii nocase
    condition:
        ($ps_encoded and $ps_bypass) or ($cmd_hidden and $b64_invoke)
}`;

const DEFAULT_DLP_PATTERNS: DlpPatternRow[] = [
  { id: 1, name: "credit_card", regex: "\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\\b" },
  { id: 2, name: "iban", regex: "\\b[A-Z]{2}\\d{2}[A-Z0-9]{4}\\d{7}(?:[A-Z0-9]{0,18})\\b" },
  { id: 3, name: "swift_code", regex: "\\b[A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\\b" },
];

/* ------------------------------------------------------------------ */
/*  Toast Component                                                    */
/* ------------------------------------------------------------------ */

function ToastBar({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  const colours = {
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    error: "border-rose-500/30 bg-rose-500/10 text-rose-400",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  };

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 shrink-0" />,
    warning: <AlertTriangle className="w-5 h-5 shrink-0" />,
  };

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm animate-float-in ${colours[toast.type]}`}
    >
      {icons[toast.type]}
      <p className="text-sm font-medium leading-snug">{toast.text}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Confirmation Modal                                                 */
/* ------------------------------------------------------------------ */

function ConfirmModal({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-black border border-slate-700 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl animate-float-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center border border-amber-500/20">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
        </div>
        <p className="text-sm text-slate-400 mb-6 leading-relaxed">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Dashboard                                                     */
/* ------------------------------------------------------------------ */

export default function AdminDashboard() {
  const [keyStatus, setKeyStatus] = useState<KeyStatus | null>(null);
  const [drives, setDrives] = useState<DetectedDrive[]>([]);
  const [selectedDrive, setSelectedDrive] = useState<string>("");
  const [loadingKey, setLoadingKey] = useState(false);
  const [loadingUsb, setLoadingUsb] = useState(false);
  const [loadingDrives, setLoadingDrives] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [logMetrics, setLogMetrics] = useState<LogMetrics | null>(null);
  const [logsSource, setLogsSource] = useState<string>("");
  const [yaraRules, setYaraRules] = useState(DEFAULT_YARA_RULES);
  const [dlpPatterns, setDlpPatterns] = useState<DlpPatternRow[]>(DEFAULT_DLP_PATTERNS);
  const [dlpNextId, setDlpNextId] = useState(4);
  const [loadingDispense, setLoadingDispense] = useState(false);

  /* ---------- Toast helper ---------- */
  const addToast = useCallback((type: Toast["type"], text: string) => {
    setToasts((prev) => [...prev, { id: Date.now(), type, text }]);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /* ---------- Fetch key status ---------- */
  const fetchKeyStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/key/status");
      const data = await res.json();
      if (data.success) {
        setKeyStatus({
          keyExists: data.keyExists,
          fingerprint: data.fingerprint,
          generatedAt: data.generatedAt,
        });
      }
    } catch {
      console.error("Failed to fetch key status");
    }
  }, []);

  /* ---------- Fetch drives ---------- */
  const fetchDrives = useCallback(async () => {
    setLoadingDrives(true);
    try {
      const res = await fetch("/api/usb/detect");
      const data = await res.json();
      if (data.success && data.drives) {
        setDrives(data.drives);
        if (data.drives.length > 0 && !selectedDrive) {
          setSelectedDrive(data.drives[0].letter);
        }
      }
    } catch {
      console.error("Failed to detect drives");
    } finally {
      setLoadingDrives(false);
    }
  }, [selectedDrive]);

  /* ---------- Init ---------- */
  useEffect(() => {
    Promise.all([fetchKeyStatus(), fetchDrives()]).finally(() =>
      setInitialLoading(false)
    );
  }, [fetchKeyStatus, fetchDrives]);

  /* ---------- Generate key ---------- */
  const generateMasterKey = async () => {
    setLoadingKey(true);
    try {
      const res = await fetch("/api/key/generate", { method: "POST" });
      const data = await res.json();

      if (res.ok && data.success) {
        setKeyStatus({
          keyExists: true,
          fingerprint: data.fingerprint,
          generatedAt: data.generatedAt,
        });
        addToast(
          data.replaced ? "warning" : "success",
          data.message
        );
      } else {
        addToast("error", data.error || "Key generation failed.");
      }
    } catch {
      addToast("error", "Network error during key generation.");
    } finally {
      setLoadingKey(false);
      setShowConfirm(false);
    }
  };

  const handleGenerateClick = () => {
    if (keyStatus?.keyExists) {
      setShowConfirm(true);
    } else {
      generateMasterKey();
    }
  };

  /* ---------- Provision USB ---------- */
  const provisionUsb = async () => {
    if (!selectedDrive) {
      addToast("error", "Please select a target drive first.");
      return;
    }
    setLoadingUsb(true);
    try {
      const res = await fetch("/api/usb/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drivePath: selectedDrive }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        addToast("success", data.message);
      } else {
        addToast("error", data.error || "USB provisioning failed.");
      }
    } catch {
      addToast("error", "Network error during USB provisioning.");
    } finally {
      setLoadingUsb(false);
    }
  };

  /* ---------- Import compliance logs ---------- */
  const importLogs = async () => {
    if (!selectedDrive) {
      addToast("error", "Select a drive to import logs from.");
      return;
    }
    setLoadingLogs(true);
    try {
      const res = await fetch("/api/logs/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drivePath: selectedDrive }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLogEntries(data.entries || []);
        setLogMetrics(data.metrics || null);
        setLogsSource(data.logsPath || selectedDrive);
        addToast(
          "success",
          `Imported ${data.metrics?.total ?? 0} log entr${
            (data.metrics?.total ?? 0) === 1 ? "y" : "ies"
          } from ${selectedDrive}.`
        );
      } else {
        setLogEntries([]);
        setLogMetrics(null);
        addToast("error", data.error || "Failed to import logs.");
      }
    } catch {
      addToast("error", "Network error during log import.");
    } finally {
      setLoadingLogs(false);
    }
  };

  /* ---------- DLP pattern helpers ---------- */
  const addDlpPattern = () => {
    setDlpPatterns((prev) => [...prev, { id: dlpNextId, name: "", regex: "" }]);
    setDlpNextId((n) => n + 1);
  };

  const removeDlpPattern = (id: number) => {
    setDlpPatterns((prev) => prev.filter((p) => p.id !== id));
  };

  const updateDlpPattern = (id: number, field: "name" | "regex", value: string) => {
    setDlpPatterns((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  /* ---------- Dispense threat intelligence ---------- */
  const dispenseUpdates = async () => {
    if (!selectedDrive) {
      addToast("error", "Select a drive to push updates to.");
      return;
    }
    if (!yaraRules.trim()) {
      addToast("error", "YARA rules cannot be empty.");
      return;
    }
    const validPatterns = dlpPatterns.filter((p) => p.name.trim() && p.regex.trim());
    if (validPatterns.length === 0) {
      addToast("error", "Add at least one DLP pattern with a name and regex.");
      return;
    }
    setLoadingDispense(true);
    try {
      const res = await fetch("/api/updates/dispense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          drivePath: selectedDrive,
          yaraRules: yaraRules.trim(),
          dlpPatterns: validPatterns.map((p) => ({ name: p.name.trim(), regex: p.regex.trim() })),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(
          "success",
          `Update package written to ${selectedDrive}. Receiver agents will apply it on next USB insertion.`
        );
      } else {
        addToast("error", data.error || "Failed to dispense updates.");
      }
    } catch {
      addToast("error", "Network error during update dispensing.");
    } finally {
      setLoadingDispense(false);
    }
  };

  /* ---------- Helpers ---------- */
  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <>
      {/* Toast Layer */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 max-w-sm">
        {toasts.map((t) => (
          <ToastBar key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </div>

      {/* Confirm Modal */}
      {showConfirm && (
        <ConfirmModal
          title="Regenerate Master Key?"
          message="This will replace the existing Master Key. All previously provisioned USB drives will become invalid and must be re-provisioned. This action cannot be undone."
          confirmLabel="Regenerate Key"
          onConfirm={generateMasterKey}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      <div className="max-w-5xl mx-auto px-6 py-12">
        {/* ---------- Header ---------- */}
        <header className="mb-10 animate-float-in">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div>
                <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
                  VaultDrive Admin
                </h1>
                <p className="text-sm text-slate-500">
                  Offline Airlock Dashboard — Banking Systems
                </p>
              </div>
            </div>

            {/* Status Badge */}
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-semibold tracking-wide uppercase ${
                keyStatus?.keyExists
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-400 animate-pulse-glow"
              }`}
            >
              {keyStatus?.keyExists ? "System Secured" : "Unsecured"}
            </div>
          </div>
        </header>

        {/* ---------- Step Cards ---------- */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* ===== STEP 1: Root of Trust ===== */}
          <section className="bg-black border border-slate-800 rounded-2xl p-6 relative overflow-hidden group animate-float-in">
            {/* Glow */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl transition-all duration-500 group-hover:bg-indigo-500/10 pointer-events-none" />

            <div className="relative z-10">
              {/* Step header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-xs font-bold text-indigo-400">
                  01
                </div>
                <h2 className="text-lg font-semibold text-slate-100">
                  Root of Trust
                </h2>
              </div>

              <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                Generate the 256-bit cryptographic Master Key that anchors the
                entire VaultDrive ecosystem. This key must match across the
                Admin, USB, and Receiver for any transfer to be authorised.
              </p>

              {/* Key info panel */}
              {keyStatus?.keyExists && keyStatus.fingerprint && (
                <div className="mb-6 p-4 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-3">
                  <div className="flex items-center gap-3">
                    <Fingerprint className="w-4 h-4 text-indigo-400 shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider">
                        Key Fingerprint
                      </p>
                      <p className="text-sm font-mono text-indigo-300 tracking-widest">
                        {keyStatus.fingerprint}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                    <div>
                      <p className="text-xs text-slate-500 uppercase tracking-wider">
                        Generated
                      </p>
                      <p className="text-sm text-slate-300">
                        {formatDate(keyStatus.generatedAt!)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action */}
              <button
                onClick={handleGenerateClick}
                disabled={loadingKey}
                className={`w-full py-3 px-4 rounded-xl font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                  keyStatus?.keyExists
                    ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20"
                }`}
              >
                {loadingKey ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Key className="w-5 h-5" />
                )}
                {keyStatus?.keyExists
                  ? "Regenerate Master Key"
                  : "Generate Master Key"}
              </button>
            </div>
          </section>

          {/* ===== STEP 2: USB Provisioning ===== */}
          <section
            className={`bg-black border border-slate-800 rounded-2xl p-6 relative overflow-hidden group animate-float-in-delay transition-opacity duration-300 ${
              !keyStatus?.keyExists ? "opacity-40 pointer-events-none" : ""
            }`}
          >
            {/* Glow */}
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl transition-all duration-500 group-hover:bg-cyan-500/10 pointer-events-none" />

            <div className="relative z-10">
              {/* Step header */}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center text-xs font-bold text-cyan-400">
                  02
                </div>
                <h2 className="text-lg font-semibold text-slate-100">
                  Provision USB Drive
                </h2>
              </div>

              <p className="text-sm text-slate-400 mb-6 leading-relaxed">
                Select a connected USB drive to inject the Master Key and create
                the hidden <code className="text-cyan-400/80 font-mono text-xs">.vaultdrive</code> directory
                structure. This provisions the drive as an authorised transport.
              </p>

              {/* Drive selector */}
              <div className="mb-4">
                <label className="text-xs text-slate-500 uppercase tracking-wider mb-2 block">
                  Target Drive
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <HardDrive className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <select
                      value={selectedDrive}
                      onChange={(e) => setSelectedDrive(e.target.value)}
                      disabled={loadingDrives || drives.length === 0}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 appearance-none cursor-pointer disabled:opacity-50"
                    >
                      {drives.length === 0 && (
                        <option value="">No drives detected</option>
                      )}
                      {drives.map((d) => (
                        <option key={d.letter} value={d.letter}>
                          {d.letter} — {d.label}{" "}
                          {d.sizeGB !== "—" ? `(${d.sizeGB} GB)` : ""}
                          {d.type === "mock" ? " [DEV]" : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 rotate-90 pointer-events-none" />
                  </div>
                  <button
                    onClick={fetchDrives}
                    disabled={loadingDrives}
                    title="Refresh drives"
                    className="px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-all disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-4 h-4 ${loadingDrives ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>
              </div>

              {/* Provision button */}
              <button
                onClick={provisionUsb}
                disabled={!keyStatus?.keyExists || loadingUsb || !selectedDrive}
                className="w-full py-3 px-4 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl font-medium transition-all shadow-lg shadow-cyan-600/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {loadingUsb ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Usb className="w-5 h-5" />
                )}
                Provision Selected Drive
              </button>
            </div>
          </section>
        </div>

        {/* ===== STEP 3: Compliance Logs ===== */}
        <section className="mt-6 bg-black border border-slate-800 rounded-2xl p-6 relative overflow-hidden group animate-float-in-delay">
          <div className="absolute -top-20 -left-20 w-64 h-64 bg-fuchsia-500/5 rounded-full blur-3xl transition-all duration-500 group-hover:bg-fuchsia-500/10 pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-fuchsia-500/15 border border-fuchsia-500/25 flex items-center justify-center text-xs font-bold text-fuchsia-400">
                  03
                </div>
                <h2 className="text-lg font-semibold text-slate-100">
                  Compliance Logs
                </h2>
              </div>
              <button
                onClick={importLogs}
                disabled={loadingLogs || !selectedDrive}
                className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-500 text-white rounded-lg font-medium text-sm transition-all shadow-lg shadow-fuchsia-600/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {loadingLogs ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                Import Logs from USB
              </button>
            </div>

            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              Reads <code className="text-fuchsia-400/80 font-mono text-xs">.vaultdrive/logs/*.json</code> from the
              selected drive and displays every transfer attempt recorded by the
              Client App.
            </p>

            {/* Metrics */}
            {logMetrics && (
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/50">
                  <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider mb-1">
                    <FileText className="w-3.5 h-3.5" /> Total
                  </div>
                  <p className="text-2xl font-bold text-slate-100">
                    {logMetrics.total}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20">
                  <div className="flex items-center gap-2 text-rose-400 text-xs uppercase tracking-wider mb-1">
                    <ShieldAlert className="w-3.5 h-3.5" /> Blocked
                  </div>
                  <p className="text-2xl font-bold text-rose-300">
                    {logMetrics.blocked}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                  <div className="flex items-center gap-2 text-emerald-400 text-xs uppercase tracking-wider mb-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Passed
                  </div>
                  <p className="text-2xl font-bold text-emerald-300">
                    {logMetrics.passed}
                  </p>
                </div>
              </div>
            )}

            {logsSource && (
              <p className="text-xs text-slate-500 mb-3 font-mono truncate">
                Source: {logsSource}
              </p>
            )}

            {/* Table */}
            {logEntries.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-sm">
                  <thead className="bg-slate-900/60 text-slate-400 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Status</th>
                      <th className="px-3 py-2 text-left font-medium">Timestamp</th>
                      <th className="px-3 py-2 text-left font-medium">File</th>
                      <th className="px-3 py-2 text-left font-medium">Reasons</th>
                      <th className="px-3 py-2 text-left font-medium">Entropy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {logEntries.map((e) => (
                      <tr key={e.file} className="hover:bg-slate-900/40">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {e.parseError ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs">
                              <AlertTriangle className="w-3 h-3" /> Parse error
                            </span>
                          ) : e.blocked ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs">
                              <ShieldAlert className="w-3 h-3" /> Blocked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs">
                              <ShieldCheck className="w-3 h-3" /> Passed
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-300 font-mono text-xs">
                          {e.timestamp ? formatDate(e.timestamp) : "—"}
                        </td>
                        <td className="px-3 py-2 text-slate-200 max-w-xs truncate" title={e.file_name || e.file}>
                          {e.file_name || e.file}
                        </td>
                        <td className="px-3 py-2 text-slate-400 text-xs">
                          {e.parseError
                            ? e.parseError
                            : e.reasons && e.reasons.length > 0
                            ? e.reasons.join(" • ")
                            : "—"}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-400 font-mono text-xs">
                          {typeof e.entropy === "number" ? e.entropy.toFixed(2) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 rounded-xl bg-slate-900/30 border border-dashed border-slate-800 text-center text-sm text-slate-500">
                {logMetrics
                  ? "No log entries found on this drive."
                  : "Select a drive and click Import Logs to view transfer history."}
              </div>
            )}
          </div>
        </section>

        {/* ===== STEP 4: Threat Intelligence ===== */}
        <section
          className={`mt-6 bg-black border border-slate-800 rounded-2xl p-6 relative overflow-hidden group animate-float-in-delay transition-opacity duration-300 ${
            !keyStatus?.keyExists ? "opacity-40 pointer-events-none" : ""
          }`}
        >
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl transition-all duration-500 group-hover:bg-amber-500/10 pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center justify-between gap-3 mb-6 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-xs font-bold text-amber-400">
                  04
                </div>
                <h2 className="text-lg font-semibold text-slate-100">
                  Threat Intelligence
                </h2>
              </div>
              <button
                onClick={dispenseUpdates}
                disabled={loadingDispense || !selectedDrive}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium text-sm transition-all shadow-lg shadow-amber-600/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {loadingDispense ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                Push Updates to USB
              </button>
            </div>

            <p className="text-sm text-slate-400 mb-6 leading-relaxed">
              Edit YARA detection rules and DLP regex patterns below, then push
              them to the selected USB drive as an update package at{" "}
              <code className="text-amber-400/80 font-mono text-xs">
                .vaultdrive/updates/
              </code>
              . Receiver agents will apply the package on next insertion.
            </p>

            {/* YARA Rules */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <label className="text-xs text-slate-500 uppercase tracking-wider font-medium">
                  YARA Rules
                </label>
              </div>
              <textarea
                value={yaraRules}
                onChange={(e) => setYaraRules(e.target.value)}
                rows={12}
                spellCheck={false}
                className="w-full px-4 py-3 bg-slate-900/80 border border-slate-700 rounded-xl text-sm text-slate-200 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 resize-y"
                placeholder="Paste or edit YARA rules here..."
              />
            </div>

            {/* DLP Patterns */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <label className="text-xs text-slate-500 uppercase tracking-wider font-medium">
                    DLP Regex Patterns
                  </label>
                </div>
                <button
                  onClick={addDlpPattern}
                  className="px-3 py-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/20 rounded-lg transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Pattern
                </button>
              </div>

              <div className="space-y-2">
                {dlpPatterns.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 group/row"
                  >
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) => updateDlpPattern(p.id, "name", e.target.value)}
                      placeholder="Pattern name"
                      className="w-40 shrink-0 px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                    />
                    <input
                      type="text"
                      value={p.regex}
                      onChange={(e) => updateDlpPattern(p.id, "regex", e.target.value)}
                      placeholder="Regex pattern"
                      className="flex-1 px-3 py-2 bg-slate-900/80 border border-slate-700 rounded-lg text-sm text-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
                    />
                    <button
                      onClick={() => removeDlpPattern(p.id)}
                      title="Remove pattern"
                      className="p-2 text-slate-600 hover:text-rose-400 transition-colors rounded-lg hover:bg-rose-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                {dlpPatterns.length === 0 && (
                  <div className="p-4 rounded-xl bg-slate-900/30 border border-dashed border-slate-800 text-center text-sm text-slate-500">
                    No DLP patterns defined. Click &quot;Add Pattern&quot; to create one.
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ---------- Footer ---------- */}
        <footer className="mt-12 pt-6 border-t border-slate-800/50 text-center">
          <p className="text-xs text-slate-600">
            VaultDrive v0.1.0 — Zero-Trust Offline Airlock for Banking
            Infrastructure
          </p>
        </footer>
      </div>
    </>
  );
}
