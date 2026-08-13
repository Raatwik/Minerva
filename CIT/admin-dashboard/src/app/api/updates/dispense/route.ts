import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

interface DlpPatternInput {
  name: string;
  regex: string;
}

interface DispenseRequest {
  drivePath: string;
  yaraRules: string;
  dlpPatterns: DlpPatternInput[];
}

interface DispenseResponse {
  success: boolean;
  packagePath?: string;
  createdAt?: string;
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<DispenseResponse>> {
  let body: DispenseRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const { drivePath, yaraRules, dlpPatterns } = body;

  if (!drivePath || typeof drivePath !== "string") {
    return NextResponse.json(
      { success: false, error: "drivePath is required." },
      { status: 400 }
    );
  }

  if (!yaraRules || typeof yaraRules !== "string" || yaraRules.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: "yaraRules must be a non-empty string." },
      { status: 400 }
    );
  }

  if (!Array.isArray(dlpPatterns)) {
    return NextResponse.json(
      { success: false, error: "dlpPatterns must be an array." },
      { status: 400 }
    );
  }

  for (const p of dlpPatterns) {
    if (!p.name || typeof p.name !== "string" || !p.regex || typeof p.regex !== "string") {
      return NextResponse.json(
        { success: false, error: `Each DLP pattern needs a name and regex. Invalid: ${JSON.stringify(p)}` },
        { status: 400 }
      );
    }
    try {
      new RegExp(p.regex);
    } catch {
      return NextResponse.json(
        { success: false, error: `Invalid regex for pattern "${p.name}": ${p.regex}` },
        { status: 400 }
      );
    }
  }

  const updatesDir = path.join(drivePath, ".vaultdrive", "updates");

  try {
    await fs.mkdir(updatesDir, { recursive: true });
  } catch {
    return NextResponse.json(
      { success: false, error: `Cannot create updates directory at ${updatesDir}.` },
      { status: 500 }
    );
  }

  const createdAt = new Date().toISOString();
  const timestamp = createdAt.replace(/[:.]/g, "-");
  const packageName = `${timestamp}_update.json`;
  const packagePath = path.join(updatesDir, packageName);

  const updatePackage = {
    createdAt,
    dispenser: "VaultDrive Admin Dashboard",
    yaraRules,
    dlpPatterns: dlpPatterns.map((p) => ({ name: p.name, regex: p.regex })),
  };

  try {
    await fs.writeFile(packagePath, JSON.stringify(updatePackage, null, 2), "utf-8");
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to write update package to USB." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    packagePath,
    createdAt,
  });
}
