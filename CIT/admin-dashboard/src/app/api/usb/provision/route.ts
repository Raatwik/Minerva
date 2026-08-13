import { NextResponse } from "next/server";
import fs from "fs";
import os from "os";
import path from "path";
import { exec } from "child_process";
import util from "util";

const execPromise = util.promisify(exec);

const DATA_DIR = path.join(process.cwd(), "data");
const KEY_FILE = path.join(DATA_DIR, "master.key");
const META_FILE = path.join(DATA_DIR, "master.meta.json");

// Mirror of the path used in lib.rs — keeps the Tauri client in sync.
const APPDATA = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
const TAURI_KEY_DIR = path.join(APPDATA, "com.vaultdrive.client", "data");
const TAURI_KEY_FILE = path.join(TAURI_KEY_DIR, "master.key");
const TAURI_META_FILE = path.join(TAURI_KEY_DIR, "master.meta.json");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    let targetDrive: string | undefined = body.drivePath;

    // Normalize drive letter: "E:" → "E:\" so path.join works correctly
    if (targetDrive && /^[A-Za-z]:$/.test(targetDrive)) {
      targetDrive += "\\";
    }

    if (!targetDrive) {
      return NextResponse.json(
        { success: false, error: "No drive path provided. Select a target drive first." },
        { status: 400 }
      );
    }

    // Verify the target path exists
    if (!fs.existsSync(targetDrive)) {
      return NextResponse.json(
        { success: false, error: `Drive path "${targetDrive}" does not exist or is not mounted.` },
        { status: 400 }
      );
    }

    // Verify Master Key exists
    if (!fs.existsSync(KEY_FILE)) {
      return NextResponse.json(
        { success: false, error: "Master Key not found. Generate it first (Step 1)." },
        { status: 400 }
      );
    }

    const masterKey = fs.readFileSync(KEY_FILE, "utf-8");
    const vaultDrivePath = path.join(targetDrive, ".vaultdrive");

    // Check if already provisioned
    const alreadyProvisioned = fs.existsSync(path.join(vaultDrivePath, "master.key"));

    // Create .vaultdrive directory structure
    fs.mkdirSync(vaultDrivePath, { recursive: true });
    fs.mkdirSync(path.join(vaultDrivePath, "logs"), { recursive: true });
    fs.mkdirSync(path.join(vaultDrivePath, "quarantine"), { recursive: true });
    fs.mkdirSync(path.join(vaultDrivePath, "updates"), { recursive: true });

    // Write the Master Key to the USB
    const destKeyPath = path.join(vaultDrivePath, "master.key");
    fs.writeFileSync(destKeyPath, masterKey, { encoding: "utf-8" });

    // Copy metadata alongside it
    if (fs.existsSync(META_FILE)) {
      fs.copyFileSync(META_FILE, path.join(vaultDrivePath, "master.meta.json"));
    }

    // Also sync to the Tauri client's AppData directory so the receiver app
    // is always in lockstep with the USB — no manual copy needed.
    try {
      fs.mkdirSync(TAURI_KEY_DIR, { recursive: true });
      fs.writeFileSync(TAURI_KEY_FILE, masterKey, { encoding: "utf-8" });
      if (fs.existsSync(META_FILE)) {
        fs.copyFileSync(META_FILE, TAURI_META_FILE);
      }
    } catch (syncErr) {
      console.warn("[VaultDrive] Could not sync key to Tauri AppData dir:", syncErr);
    }

    // Write a provisioning manifest
    const manifest = {
      provisionedAt: new Date().toISOString(),
      provisionedBy: "VaultDrive Admin Dashboard",
      targetDrive,
    };
    fs.writeFileSync(
      path.join(vaultDrivePath, "provision.json"),
      JSON.stringify(manifest, null, 2),
      { encoding: "utf-8" }
    );

    // Hide the .vaultdrive folder on Windows (only +h, not +s, so it shows with "show hidden files")
    if (process.platform === "win32") {
      try {
        await execPromise(`attrib +h "${vaultDrivePath}"`);
      } catch {
        console.warn("Could not hide .vaultdrive folder (non-critical).");
      }
    }

    return NextResponse.json({
      success: true,
      alreadyProvisioned,
      provisionedAt: manifest.provisionedAt,
      targetDrive,
      message: alreadyProvisioned
        ? `USB at ${targetDrive} re-provisioned with current Master Key.`
        : `USB at ${targetDrive} successfully provisioned. Ready for air-gapped deployment.`,
    });
  } catch (error) {
    console.error("USB provisioning failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to provision USB drive." },
      { status: 500 }
    );
  }
}
