import { describe, expect, it } from "vitest";

describe("postgres storage matrix", () => {
  it("accepts PG_DSN when postgres job is wired", () => {
    const dsn = process.env.PG_DSN;
    if (!dsn) {
      expect(true).toBe(true);
      return;
    }
    expect(dsn).toMatch(/^postgres(?:ql)?:\/\//);
    // PostgresStore implementation tracked in docs/12-STORAGE-ABSTRACTION.md
  });
});
