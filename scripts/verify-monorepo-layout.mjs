#!/usr/bin/env node
/**
 * P0-01: monorepo layout matches roadmap (apps + packages, no apps/worker).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const requiredApps = ["api", "dashboard", "portal", "widget", "docs"];
const requiredPackages = [
  "shared",
  "storage",
  "auth",
  "kb",
  "workflow",
  "memory",
  "memory-tree",
  "memory-cli",
  "llm",
  "agent",
  "mcp",
  "ui",
  "channels-core",
  "channels-email",
  "channels-im",
];

const forbidden = ["apps/worker"];

function mustExist(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.error(`missing: ${rel}`);
    return false;
  }
  return true;
}

let ok = true;

for (const app of requiredApps) {
  if (!mustExist(`apps/${app}`)) ok = false;
}

for (const pkg of requiredPackages) {
  if (!mustExist(`packages/${pkg}`)) ok = false;
}

for (const rel of forbidden) {
  if (fs.existsSync(path.join(root, rel))) {
    console.error(`forbidden path exists: ${rel}`);
    ok = false;
  }
}

if (!mustExist("pnpm-workspace.yaml")) ok = false;
if (!mustExist("pnpm-lock.yaml")) ok = false;

if (!ok) process.exit(1);

console.log(`monorepo layout ok: ${requiredApps.length} apps, ${requiredPackages.length} packages`);
