import { NextResponse } from "next/server";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const KEY_FILE = path.join(DATA_DIR, "master.key");
const META_FILE = path.join(DATA_DIR, "master.meta.json");

// Tauri's canonical app data dir — mirrors AppState::with_key_path() in lib.rs.
// Writing here means key generation automatically propagates to the client app
// without any manual copy step.
const APPDATA = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
const TAURI_KEY_DIR = path.join(APPDATA, "com.vaultdrive.client", "data");
const TAURI_KEY_FILE = path.join(TAURI_KEY_DIR, "master.key");
const TAURI_META_FILE = path.join(TAURI_KEY_DIR, "master.meta.json");

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

    // Auto-sync to the Tauri client's AppData directory so the receiver app
    // is always in lockstep — no manual copy needed after key regeneration.
    try {
      fs.mkdirSync(TAURI_KEY_DIR, { recursive: true });
      fs.writeFileSync(TAURI_KEY_FILE, masterKeyHex, { encoding: "utf-8" });
      fs.writeFileSync(TAURI_META_FILE, JSON.stringify(meta, null, 2), { encoding: "utf-8" });
    } catch (syncErr) {
      // Non-fatal: Tauri app may not be installed yet. Log and continue.
      console.warn("[VaultDrive] Could not sync key to Tauri AppData dir:", syncErr);
    }

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
