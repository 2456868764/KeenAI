import { defineConfig } from "drizzle-kit";

const databaseUrl =
  process.env.PG_DSN ??
  process.env.DATABASE_URL ??
  "postgresql://keenai:keenai@localhost:5432/keenai";

export default defineConfig({
  schema: "./src/schema/postgres/*.ts",
  out: "./migrations/postgres",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    url: databaseUrl,
  },
});
