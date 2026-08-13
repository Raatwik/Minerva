import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const KEY_FILE = path.join(DATA_DIR, "master.key");
const META_FILE = path.join(DATA_DIR, "master.meta.json");

export async function GET() {
  try {
    const keyExists = fs.existsSync(KEY_FILE);

    if (!keyExists) {
      return NextResponse.json({ success: true, keyExists: false });
    }

    // Read metadata for display
    let fingerprint = "UNKNOWN";
    let generatedAt = "UNKNOWN";

    if (fs.existsSync(META_FILE)) {
      const meta = JSON.parse(fs.readFileSync(META_FILE, "utf-8"));
      fingerprint = meta.fingerprint || fingerprint;
      generatedAt = meta.generatedAt || generatedAt;
    }

    return NextResponse.json({
      success: true,
      keyExists: true,
      fingerprint,
      generatedAt,
    });
  } catch (error) {
    console.error("Key status check failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to check key status." },
      { status: 500 }
    );
  }
}
