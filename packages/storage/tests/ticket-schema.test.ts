import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLibsqlStore } from "@keenai/storage";
import { organizations, ticketTypes, tickets } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";

describe("ticket schema migration", () => {
  it("applies migration 0008 and accepts ticket rows", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../migrations/libsql",
    );
    await migrate(store.db, { migrationsFolder });

    const [orgRow] = await store.db
      .insert(organizations)
      .values({ slug: "t", name: "Test Org" })
      .returning();
    if (!orgRow) throw new Error("missing org");

    const [typeRow] = await store.db
      .insert(ticketTypes)
      .values({ orgId: orgRow.id, name: "Customer", kind: "customer" })
      .returning();
    if (!typeRow) throw new Error("missing ticket type");

    const [ticket] = await store.db
      .insert(tickets)
      .values({
        orgId: orgRow.id,
        typeId: typeRow.id,
        title: "Login issue",
      })
      .returning();

    expect(ticket?.title).toBe("Login issue");
    await store.close();
  });
});
