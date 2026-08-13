import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

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

interface IngestResponse {
  success: boolean;
  drivePath?: string;
  logsPath?: string;
  entries?: LogEntry[];
  metrics?: {
    total: number;
    blocked: number;
    passed: number;
  };
  error?: string;
}

function isBlocked(entry: LogEntry): boolean {
  if (entry.event && /block|quarantine/i.test(entry.event)) return true;
  if (entry.quarantine_path) return true;
  if (entry.reasons && entry.reasons.length > 0) return true;
  return false;
}

export async function POST(req: NextRequest): Promise<NextResponse<IngestResponse>> {
  let drivePath: string | undefined;
  try {
    const body = await req.json();
    drivePath = body?.drivePath;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  if (!drivePath || typeof drivePath !== "string") {
    return NextResponse.json(
      { success: false, error: "drivePath is required." },
      { status: 400 }
    );
  }

  const logsPath = path.join(drivePath, ".vaultdrive", "logs");

  let files: string[];
  try {
    const stat = await fs.stat(logsPath);
    if (!stat.isDirectory()) {
      return NextResponse.json(
        { success: false, error: `Not a directory: ${logsPath}` },
        { status: 404 }
      );
    }
    files = (await fs.readdir(logsPath)).filter((f) =>
      f.toLowerCase().endsWith(".json")
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        drivePath,
        logsPath,
        error: `No .vaultdrive/logs directory found on ${drivePath}.`,
      },
      { status: 404 }
    );
  }

  const entries: LogEntry[] = [];
  for (const name of files) {
    const full = path.join(logsPath, name);
    try {
      const raw = await fs.readFile(full, "utf-8");
      const parsed = JSON.parse(raw);
      const entry: LogEntry = {
        file: name,
        event: parsed.event,
        timestamp: parsed.timestamp,
        file_name: parsed.file_name,
        source: parsed.source,
        destination: parsed.destination,
        quarantine_path: parsed.quarantine_path ?? null,
        reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
        entropy: typeof parsed.entropy === "number" ? parsed.entropy : undefined,
        yara_matches: Array.isArray(parsed.yara_matches) ? parsed.yara_matches : [],
        dlp_findings: Array.isArray(parsed.dlp_findings) ? parsed.dlp_findings : [],
        blocked: false,
      };
      entry.blocked = isBlocked(entry);
      entries.push(entry);
    } catch (e) {
      entries.push({
        file: name,
        blocked: false,
        parseError: e instanceof Error ? e.message : String(e),
      });
    }
  }

  entries.sort((a, b) => {
    const ta = a.timestamp ?? "";
    const tb = b.timestamp ?? "";
    return tb.localeCompare(ta);
  });

  const blocked = entries.filter((e) => e.blocked).length;
  return NextResponse.json({
    success: true,
    drivePath,
    logsPath,
    entries,
    metrics: {
      total: entries.length,
      blocked,
      passed: entries.length - blocked,
    },
  });
}
