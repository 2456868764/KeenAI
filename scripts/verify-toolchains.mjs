#!/usr/bin/env node
/**
 * P0-02: verify Bun 1.2+ and Node 22+ (CI and local dev).
 */
import { execSync } from "node:child_process";

const MIN_BUN = [1, 2, 0];
const MIN_NODE = [22, 0, 0];

function parseVersion(raw) {
  const cleaned = raw.trim().replace(/^v/, "");
  const parts = cleaned.split(".").map((p) => Number.parseInt(p, 10));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function gte(actual, minimum) {
  for (let i = 0; i < 3; i++) {
    if (actual[i] > minimum[i]) return true;
    if (actual[i] < minimum[i]) return false;
  }
  return true;
}

function readVersion(cmd) {
  return execSync(cmd, { encoding: "utf8" });
}

const bunRaw = readVersion("bun --version");
const nodeRaw = readVersion("node --version");
const bun = parseVersion(bunRaw);
const node = parseVersion(nodeRaw);

let ok = true;

if (!gte(bun, MIN_BUN)) {
  console.error(`bun ${bunRaw.trim()} < required 1.2.0`);
  ok = false;
}

if (!gte(node, MIN_NODE)) {
  console.error(`node ${nodeRaw.trim()} < required 22.0.0`);
  ok = false;
}

if (!ok) process.exit(1);

console.log(`toolchains ok: bun ${bunRaw.trim()}, node ${nodeRaw.trim()}`);
