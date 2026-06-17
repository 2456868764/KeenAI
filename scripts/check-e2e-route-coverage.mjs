#!/usr/bin/env node
/**
 * P2-ACC-03: ensure Playwright specs cover ≥65% of critical Beta routes.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const E2E_DIR = join(ROOT, "e2e");
const MIN_RATIO = 0.65;

/** Critical routes grouped by surface (must stay in sync with e2e specs). */
const CRITICAL_ROUTES = {
  api: [
    "/health",
    "/api/v1/health",
    "/api/v1/openapi.json",
    "/api/v1/public/demo/kb/collections",
    "/api/v1/public/demo/meta",
    "/api/v1/public/demo/kb/search",
    "/api/v1/public/demo/kb/answer",
    "/api/v1/auth/login",
    "/api/v1/workflows",
    "/api/v1/tickets",
    "/api/v1/analytics/dashboard",
    "/api/v1/mcp/expose/tools",
  ],
  dashboard: [
    "/login",
    "/inbox",
    "/workflows",
    "/tickets",
    "/analytics",
    "/feedback",
    "/roadmap",
    "/changelog",
    "/help-center",
    "/custom-actions",
    "/settings/sla",
    "/settings/brands",
    "/settings/personality",
  ],
  portal: ["/", "/help", "/roadmap", "/changelog", "/sitemap.xml", "/robots.txt"],
};

function collectE2eSource() {
  const files = readdirSync(E2E_DIR).filter((name) => name.endsWith(".spec.ts"));
  return files.map((name) => readFileSync(join(E2E_DIR, name), "utf8")).join("\n");
}

function routeCovered(source, route) {
  const normalized = route.replace(/^\//, "");
  const patterns = [route, `"${route}"`, `'${route}'`, `\`${route}\``, route.replace(/^\//, "")];
  if (route === "/") {
    patterns.push('goto("/")', "goto('/')");
  }
  return patterns.some((pattern) => source.includes(pattern));
}

const source = collectE2eSource();
const allRoutes = Object.values(CRITICAL_ROUTES).flat();
const covered = allRoutes.filter((route) => routeCovered(source, route));
const ratio = covered.length / allRoutes.length;

console.log(
  `E2e route coverage: ${covered.length}/${allRoutes.length} (${(ratio * 100).toFixed(1)}%)`,
);

if (ratio < MIN_RATIO) {
  const missing = allRoutes.filter((route) => !routeCovered(source, route));
  console.error(
    `Below ${MIN_RATIO * 100}% threshold. Missing routes:\n${missing.map((r) => `  - ${r}`).join("\n")}`,
  );
  process.exit(1);
}

console.log("E2e route coverage gate passed.");
