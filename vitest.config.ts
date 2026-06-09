import { defineConfig } from "vitest/config";

/** Backend packages exercised by Vitest integration + unit tests. */
const coverageInclude = [
  "apps/api/src/**/*.ts",
  "apps/widget/src/**/*.ts",
  "packages/*/src/**/*.ts",
];

const coverageExclude = [
  "**/*.test.ts",
  "**/*.integration.test.ts",
  "**/tests/**",
  "**/dist/**",
  "**/*.d.ts",
  "**/types.ts",
  "**/*-ws.ts",
  "**/stub-server.ts",
  "apps/api/src/seed.ts",
  "apps/api/src/seed/**",
  "packages/ui/**",
  "packages/mcp/**",
  "packages/memory-cli/**",
  "packages/storage/src/schema/**",
  "packages/storage/src/core/**",
  "packages/storage/src/postgres/**",
  "packages/storage/drizzle.config.ts",
  "packages/storage/drizzle.config.pg.ts",
  "packages/workflow/src/inngest/**",
  "packages/workflow/src/adapter/types.ts",
  "agentmemory/**",
  "scripts/**",
];

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    environment: "node",
    testTimeout: 15_000,
    coverage: {
      provider: "v8",
      include: coverageInclude,
      exclude: coverageExclude,
      reporter: ["text", "json-summary"],
      thresholds: {
        lines: 65,
        functions: 65,
        statements: 65,
      },
    },
  },
});
