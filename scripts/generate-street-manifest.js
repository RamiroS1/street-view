#!/usr/bin/env node
/**
 * Scans the project's data/ folder (organized by acquisition days)
 * and writes a manifest JSON used by the Street View data provider.
 * Reads GPS from EXIF when available so the map shows the real route (like Mapillary).
 *
 * Run from project root: node scripts/generate-street-manifest.js
 * Output: examples/custom-data/street-manifest.json
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const OUT_FILE = path.join(__dirname, "..", "examples", "custom-data", "street-manifest.json");

const JPG_EXT = [".jpg", ".JPG"];

function isJpg(name) {
  return JPG_EXT.some((ext) => name.endsWith(ext));
}

function* walkDir(dir, relative = "") {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = relative ? `${relative}/${e.name}` : e.name;
    if (e.isDirectory()) {
      yield* walkDir(path.join(dir, e.name), rel);
    } else if (e.isFile() && isJpg(e.name)) {
      yield rel;
    }
  }
}

async function readGps(filePath) {
  try {
    const exifr = await import("exifr");
    const gps = await exifr.default.gps(filePath);
    if (gps && typeof gps.latitude === "number" && typeof gps.longitude === "number") {
      return { lat: gps.latitude, lng: gps.longitude };
    }
  } catch (_) {}
  return null;
}

async function run() {
  if (!fs.existsSync(DATA_DIR)) {
    console.error("Data directory not found:", DATA_DIR);
    process.exit(1);
  }

  const cameraDirs = fs.readdirSync(DATA_DIR, { withFileTypes: true }).filter((e) => e.isDirectory());
  const days = [];
  let withGps = 0;
  let withoutGps = 0;

  for (const camera of cameraDirs) {
    const cameraPath = path.join(DATA_DIR, camera.name);
    const dayDirs = fs.readdirSync(cameraPath, { withFileTypes: true }).filter((e) => e.isDirectory());
    for (const dayDir of dayDirs) {
      const dayPath = path.join(cameraPath, dayDir.name);
      const prefix = `${camera.name}/${dayDir.name}`;
      const entries = [];
      for (const rel of walkDir(dayPath, prefix)) {
        const base = path.basename(rel, path.extname(rel));
        const imageId = `day_${dayDir.name.replace(/\s+/g, "_").replace(/[()]/g, "")}/${base}`;
        const fullPath = path.join(DATA_DIR, rel);
        const gps = await readGps(fullPath);
        if (gps) {
          withGps++;
          entries.push({ id: imageId, file: rel, lat: gps.lat, lng: gps.lng });
        } else {
          withoutGps++;
          entries.push({ id: imageId, file: rel });
        }
      }
      entries.sort((a, b) => a.file.localeCompare(b.file));
      days.push({
        id: dayDir.name.replace(/\s+/g, "_").replace(/[()]/g, ""),
        name: dayDir.name,
        images: entries,
      });
    }
  }

  const manifest = { basePath: "/data", days };
  const outDir = path.dirname(OUT_FILE);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(manifest, null, 2), "utf8");
  console.log(
    "Wrote",
    OUT_FILE,
    "—",
    days.length,
    "days,",
    days.reduce((s, d) => s + d.images.length, 0),
    "images",
    withGps ? `(${withGps} with GPS)` : "",
    withoutGps && !withGps ? "(no GPS in EXIF, map will use synthetic route)" : ""
  );
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
