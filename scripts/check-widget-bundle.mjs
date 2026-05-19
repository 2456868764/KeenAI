#!/usr/bin/env node
/**
 * Build widget IIFE and assert gzip size budget (Sprint 2 target tracking).
 * Roadmap aspirational target is 5KB gzip; current Preact MVP budget is 80KB.
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outFile = join(root, "apps/widget/dist/keenai-widget.js");
const MAX_GZIP_BYTES = Number(process.env.WIDGET_MAX_GZIP_KB ?? 80) * 1024;

execSync("pnpm --filter @keenai/widget build", { cwd: root, stdio: "inherit" });

const raw = readFileSync(outFile);
const gz = gzipSync(raw);
const kb = (gz.length / 1024).toFixed(1);

console.log(`keenai-widget.js: ${(raw.length / 1024).toFixed(1)} KB raw, ${kb} KB gzip`);

if (gz.length > MAX_GZIP_BYTES) {
  console.error(`Bundle exceeds budget: ${kb} KB gzip > ${MAX_GZIP_BYTES / 1024} KB`);
  process.exit(1);
}

console.log("Bundle size OK");
