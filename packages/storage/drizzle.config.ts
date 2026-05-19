import { ensureDatabaseDirectory, resolveDatabaseUrl } from "@keenai/shared/paths";
import { defineConfig } from "drizzle-kit";

const databaseUrl = resolveDatabaseUrl(process.env.DATABASE_URL, import.meta.url);
ensureDatabaseDirectory(databaseUrl);

export default defineConfig({
  schema: "./src/schema/sqlite/*.ts",
  out: "./migrations/libsql",
  dialect: "sqlite",
  casing: "snake_case",
  dbCredentials: {
    url: databaseUrl,
  },
});
