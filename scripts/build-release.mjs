#!/usr/bin/env node
// Build Chrome Web Store submittable zip.
// The manifest references dist/*.html and dist/*.js, so the zip must
// include: manifest.json, dist/, icons/, styles.css at the archive root.

import { readFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const RELEASE_DIR = resolve(ROOT, "release");

const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
const manifest = JSON.parse(
  readFileSync(resolve(ROOT, "manifest.json"), "utf8"),
);

if (pkg.version !== manifest.version) {
  console.error(
    `✗ version mismatch: package.json=${pkg.version} manifest.json=${manifest.version}`,
  );
  process.exit(1);
}

const version = manifest.version;
const zipName = `namu_arca_linker-v${version}.zip`;
const zipPath = resolve(RELEASE_DIR, zipName);

if (!existsSync(RELEASE_DIR)) mkdirSync(RELEASE_DIR, { recursive: true });
if (existsSync(zipPath)) rmSync(zipPath);

// Required files/dirs for the store submission
const includes = [
  "manifest.json",
  "styles.css",
  "dist",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

for (const rel of includes) {
  if (!existsSync(resolve(ROOT, rel))) {
    console.error(`✗ missing required file: ${rel}`);
    process.exit(1);
  }
}

console.log(`📦 Building ${zipName}`);
execFileSync(
  "zip",
  ["-r", zipPath, ...includes, "-x", "*.DS_Store", "__MACOSX/*"],
  { cwd: ROOT, stdio: "inherit" },
);

const { statSync } = await import("node:fs");
const sizeMB = (statSync(zipPath).size / (1024 * 1024)).toFixed(2);
console.log(`✅ ${zipPath} (${sizeMB} MB)`);
if (statSync(zipPath).size > 10 * 1024 * 1024) {
  console.error("✗ zip exceeds Chrome Web Store 10MB limit");
  process.exit(1);
}
