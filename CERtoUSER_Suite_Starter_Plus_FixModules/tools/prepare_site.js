#!/usr/bin/env node
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SITE_DIR = path.join(ROOT, "site");

async function exists(fp) {
  try {
    await fs.access(fp);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function cleanExtraneous(dest, validNames, preserve = []) {
  const entries = await fs.readdir(dest, { withFileTypes: true }).catch(() => []);
  const validSet = new Set(validNames);
  const preserveSet = new Set(preserve);
  for (const entry of entries) {
    if (preserveSet.has(entry.name)) continue;
    if (!validSet.has(entry.name)) {
      await fs.rm(path.join(dest, entry.name), { recursive: true, force: true });
    }
  }
}

async function syncDir(src, dest, options = {}) {
  const preserve = Array.isArray(options.preserve) ? options.preserve : [];
  if (!(await exists(src))) {
    console.warn(`[prepare-site] sorgente mancante: ${src}`);
    return;
  }
  await ensureDir(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });
  await cleanExtraneous(dest, entries.map((e) => e.name), preserve);

  for (const entry of entries) {
    if (preserve.includes(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await syncDir(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.rm(destPath, { recursive: true, force: true }).catch(() => {});
      await ensureDir(path.dirname(destPath));
      await fs.copyFile(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      const target = await fs.readlink(srcPath);
      await fs.rm(destPath, { recursive: true, force: true }).catch(() => {});
      await fs.symlink(target, destPath);
    }
  }
}

async function copyFile(src, dest) {
  if (!(await exists(src))) {
    console.warn(`[prepare-site] file mancante, salto: ${src}`);
    return;
  }
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

async function main() {
  console.log("[prepare-site] sincronizzazione directory 'site'...");
  await ensureDir(SITE_DIR);

  await copyFile(path.join(ROOT, "index.html"), path.join(SITE_DIR, "index.html"));
  await copyFile(path.join(ROOT, "_redirects"), path.join(SITE_DIR, "_redirects"));

  await syncDir(path.join(ROOT, "assets"), path.join(SITE_DIR, "assets"), { preserve: ["models"] });
  await syncDir(path.join(ROOT, "modules"), path.join(SITE_DIR, "modules"));
  await syncDir(path.join(ROOT, "config"), path.join(SITE_DIR, "config"));

  console.log("[prepare-site] completato.");
}

main().catch((error) => {
  console.error("[prepare-site] errore", error);
  process.exitCode = 1;
});
