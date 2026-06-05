#!/usr/bin/env node
/**
 * P1-ACC-05: measure local bootstrap (install → migrate → seed).
 */
import { execSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const start = performance.now();

function run(cmd) {
  console.log(`→ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: process.cwd() });
}

run("pnpm db:migrate");
run("pnpm seed");

const elapsedSec = ((performance.now() - start) / 1000).toFixed(1);
console.log(`bootstrap-local ok in ${elapsedSec}s (target < 120s for P1-ACC-05)`);

if (Number(elapsedSec) > 120) {
  console.error("bootstrap exceeded 120s");
  process.exit(1);
}
