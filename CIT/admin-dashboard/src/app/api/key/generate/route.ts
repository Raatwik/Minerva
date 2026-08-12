import { NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const KEY_FILE = path.join(DATA_DIR, "master.key");
const META_FILE = path.join(DATA_DIR, "master.meta.json");

export async function POST() {
  try {
    // Guard: warn if key already exists (the UI should confirm before calling)
    const alreadyExists = fs.existsSync(KEY_FILE);

    // Ensure data directory exists
    fs.mkdirSync(DATA_DIR, { recursive: true });

    // Generate a 256-bit (32 byte) cryptographically secure random key
    const masterKeyBuffer = crypto.randomBytes(32);
    const masterKeyHex = masterKeyBuffer.toString("hex");

    // Derive a fingerprint (SHA-256 of the key, truncated) for display
    const fingerprint = crypto
      .createHash("sha256")
      .update(masterKeyBuffer)
      .digest("hex")
      .substring(0, 16)
      .toUpperCase();

    // Persist the raw key
    fs.writeFileSync(KEY_FILE, masterKeyHex, { encoding: "utf-8" });

    // Persist metadata alongside it
    const meta = {
      fingerprint,
      generatedAt: new Date().toISOString(),
      algorithm: "random-256-bit-symmetric",
    };
    fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), {
      encoding: "utf-8",
    });

    return NextResponse.json({
      success: true,
      replaced: alreadyExists,
      fingerprint,
      generatedAt: meta.generatedAt,
      message: alreadyExists
        ? "Master Key regenerated. All previously provisioned USBs are now invalid."
        : "Master Key generated successfully. Root of trust established.",
    });
  } catch (error) {
    console.error("Key generation failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate Master Key." },
      { status: 500 }
    );
  }
}
