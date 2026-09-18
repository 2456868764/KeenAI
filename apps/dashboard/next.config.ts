import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const monorepoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const legacyDashboardRoutes = [
  { source: "agent-runs", destination: "dashboard/agent/agent-runs" },
  { source: "custom-actions", destination: "dashboard/agent/custom-actions" },
  { source: "knowledge-base", destination: "dashboard/agent/knowledge-base" },
  { source: "memory", destination: "dashboard/agent/memory" },
  { source: "workflows", destination: "dashboard/agent/workflows" },
  { source: "settings/personality", destination: "dashboard/agent/personality" },
  { source: "settings/agent-other", destination: "dashboard/agent/agent-other" },
  { source: "settings/deploy", destination: "dashboard/agent/deploy" },
  { source: "analytics", destination: "dashboard/analytics" },
  { source: "changelog", destination: "dashboard/changelog" },
  { source: "directory", destination: "dashboard/directory" },
  { source: "feedback", destination: "dashboard/feedback" },
  { source: "help-center", destination: "dashboard/help-center" },
  { source: "inbox", destination: "dashboard/inbox" },
  { source: "roadmap", destination: "dashboard/roadmap" },
  { source: "settings", destination: "dashboard/settings" },
  { source: "tickets", destination: "dashboard/tickets" },
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@keenai/ui", "@keenai/shared"],
  experimental: {
    externalDir: true,
  },
  async redirects() {
    return legacyDashboardRoutes.map((route) => ({
      source: `/${route.source}/:path*`,
      destination: `/${route.destination}/:path*`,
      permanent: false,
    }));
  },
};

export default nextConfig;
