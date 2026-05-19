import { describe, expect, it } from "vitest";
import { canAccess } from "./enforcer.js";

describe("rbac", () => {
  it("owner has wildcard", async () => {
    expect(await canAccess("owner", "billing", "admin")).toBe(true);
  });

  it("lite is read-only on conversation", async () => {
    expect(await canAccess("lite", "conversation", "read")).toBe(true);
    expect(await canAccess("lite", "conversation", "write")).toBe(false);
  });

  it("agent cannot access billing", async () => {
    expect(await canAccess("agent", "billing", "read")).toBe(false);
  });
});
