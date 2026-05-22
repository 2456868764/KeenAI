import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { createPostgresStore } from "../src/postgres/store.js";

describe("postgres storage matrix", () => {
  it("accepts PG_DSN when postgres job is wired", () => {
    const dsn = process.env.PG_DSN;
    if (!dsn) {
      expect(true).toBe(true);
      return;
    }
    expect(dsn).toMatch(/^postgres(?:ql)?:\/\//);
  });

  it("pings postgres when PG_DSN is set", async () => {
    const dsn = process.env.PG_DSN;
    if (!dsn) {
      expect(true).toBe(true);
      return;
    }

    const store = createPostgresStore({ url: dsn });
    expect(store.dialect).toBe("postgres");
    await store.ping();
    await store.close();
  });

  it("has core tables after schema push", async () => {
    const dsn = process.env.PG_DSN;
    if (!dsn) {
      expect(true).toBe(true);
      return;
    }

    const sql = postgres(dsn);
    const [row] = await sql<{ regclass: string | null }[]>`
      SELECT to_regclass('public.organizations') as regclass
    `;
    expect(row?.regclass).toBe("organizations");
    await sql.end();
  });
});
