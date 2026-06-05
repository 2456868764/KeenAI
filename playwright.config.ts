import { defineConfig, devices } from "@playwright/test";

const apiUrl = process.env.E2E_API_URL ?? "http://localhost:8190";
const portalUrl = process.env.E2E_PORTAL_URL ?? "http://localhost:3202";
const dashboardUrl = process.env.E2E_DASHBOARD_URL ?? "http://localhost:3200";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "api",
      testMatch: /api\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "portal",
      testMatch: /portal\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: portalUrl,
      },
    },
    {
      name: "dashboard",
      testMatch: /dashboard\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: dashboardUrl,
      },
    },
  ],
  webServer: [
    {
      command: "bash scripts/e2e-api-server.sh",
      url: `${apiUrl}/health`,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "bash scripts/e2e-portal-server.sh",
      url: portalUrl,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "bash scripts/e2e-dashboard-server.sh",
      url: `${dashboardUrl}/login`,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
