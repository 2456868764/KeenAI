import postgres from "postgres";
import type { Dialect } from "../core/store.js";

export type PostgresStoreOptions = {
  url: string;
  max?: number;
};

/** Minimal Postgres backend — full Drizzle schema wiring tracked separately. */
export type PostgresStore = {
  readonly dialect: Dialect;
  ping(): Promise<void>;
  close(): Promise<void>;
};

export function createPostgresStore(opts: PostgresStoreOptions): PostgresStore {
  const sql = postgres(opts.url, { max: opts.max ?? 5 });

  return {
    dialect: "postgres",
    async ping() {
      await sql`SELECT 1`;
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
