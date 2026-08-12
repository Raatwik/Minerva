import { NextResponse } from "next/server";
import { exec } from "child_process";
import util from "util";
import fs from "fs";
import path from "path";

const execPromise = util.promisify(exec);

interface DetectedDrive {
  letter: string;
  label: string;
  sizeGB: string;
  type: "removable" | "mock";
}

/**
 * Detects removable USB drives on Windows using PowerShell + CIM.
 * Uses -EncodedCommand to avoid all shell escaping issues with $_ variables.
 * Falls back to a mock drive directory for development/testing.
 */
async function detectRemovableDrives(): Promise<DetectedDrive[]> {
  const drives: DetectedDrive[] = [];

  if (process.platform === "win32") {
    try {
      // Raw PowerShell script — no escaping needed since we'll Base64-encode it
      const psScript = `
Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -eq 2 } | ForEach-Object {
  [PSCustomObject]@{
    Letter = $_.DeviceID
    Label  = if ($_.VolumeName) { $_.VolumeName } else { 'USB Drive' }
    SizeGB = [math]::Round($_.Size / 1GB, 2)
  }
} | ConvertTo-Json -Compress
`;

      // Encode as UTF-16LE Base64 for -EncodedCommand
      const encoded = Buffer.from(psScript, "utf16le").toString("base64");

      const { stdout } = await execPromise(
        `powershell -NoProfile -EncodedCommand ${encoded}`,
        { timeout: 10000 }
      );

      const trimmed = stdout.trim();
      if (trimmed && trimmed !== "") {
        const parsed = JSON.parse(trimmed);
        const items = Array.isArray(parsed) ? parsed : [parsed];

        for (const item of items) {
          // Ensure the letter always has a trailing backslash (E: → E:\)
          let driveLetter: string = item.Letter || "";
          if (driveLetter.endsWith(":")) {
            driveLetter += "\\";
          }

          drives.push({
            letter: driveLetter,
            label: item.Label || "USB Drive",
            sizeGB: String(item.SizeGB ?? "?"),
            type: "removable",
          });
        }
      }
    } catch (error) {
      console.error("PowerShell USB detection failed:", error);
    }
  }

  // Always include a mock drive option for development/testing
  const mockPath = path.join(process.cwd(), "mock-usb-drive");
  if (!fs.existsSync(mockPath)) {
    fs.mkdirSync(mockPath, { recursive: true });
  }
  drives.push({
    letter: mockPath,
    label: "Mock USB (Development)",
    sizeGB: "—",
    type: "mock",
  });

  return drives;
}

export async function GET() {
  try {
    const drives = await detectRemovableDrives();
    return NextResponse.json({ success: true, drives });
  } catch (error) {
    console.error("Drive detection failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to detect drives." },
      { status: 500 }
    );
  }
}
