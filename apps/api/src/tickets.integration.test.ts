import path from "node:path";
import { fileURLToPath } from "node:url";
import { type AuthConfig, hashPassword } from "@keenai/auth";
import { parseApiEnv } from "@keenai/shared";
import { createLibsqlStore } from "@keenai/storage";
import { accounts, brands, members, organizations } from "@keenai/storage/schema";
import { migrate } from "drizzle-orm/libsql/migrator";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createLogger } from "./logger.js";
import { requireRow } from "./test-helpers.js";

const authConfig: AuthConfig = {
  jwtSecret: "test-secret-at-least-32-characters-long!!",
  accessTtlSec: 900,
  refreshTtlSec: 604_800,
  appUrl: "http://localhost:3000",
};

async function loginToken(app: ReturnType<typeof createApp>) {
  const login = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "agent@acme.test",
      password: "password12345",
      orgSlug: "acme",
    }),
  });
  const tokens = (await login.json()) as { accessToken: string };
  return tokens.accessToken;
}

describe("tickets integration", () => {
  it("creates, lists, updates tickets and converts from conversation", async () => {
    const store = createLibsqlStore({ url: ":memory:" });
    const db = store.db;
    const migrationsFolder = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/storage/migrations/libsql",
    );
    await migrate(db, { migrationsFolder });

    const [orgRow] = await db
      .insert(organizations)
      .values({ slug: "acme", name: "Acme" })
      .returning();
    const org = requireRow(orgRow, "org");
    const [brandRow] = await db
      .insert(brands)
      .values({ orgId: org.id, slug: "default", name: "Default" })
      .returning();
    const brand = requireRow(brandRow, "brand");
    const [accountRow] = await db
      .insert(accounts)
      .values({
        email: "agent@acme.test",
        name: "Agent",
        passwordHash: await hashPassword("password12345"),
      })
      .returning();
    const account = requireRow(accountRow, "account");
    const [memberRow] = await db
      .insert(members)
      .values({
        orgId: org.id,
        accountId: account.id,
        role: "admin",
        status: "active",
      })
      .returning();
    const member = requireRow(memberRow, "member");

    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const app = createApp({
      store,
      fts: null,
      authConfig,
      env,
      log: createLogger(env),
      startedAt: new Date(),
    });

    const token = await loginToken(app);
    const auth = { Authorization: `Bearer ${token}` };

    const created = await app.request("/api/v1/tickets", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Billing question" }),
    });
    expect(created.status).toBe(201);
    const { ticket: createdTicket } = (await created.json()) as {
      ticket: { id: string; title: string; statusName: string | null };
    };
    expect(createdTicket.title).toBe("Billing question");
    expect(createdTicket.statusName).toBe("Open");

    const list = await app.request("/api/v1/tickets", { headers: auth });
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { items: { id: string }[] };
    expect(listBody.items.some((t) => t.id === createdTicket.id)).toBe(true);

    const patched = await app.request(`/api/v1/tickets/${createdTicket.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Billing — resolved", priority: "high" }),
    });
    expect(patched.status).toBe(200);
    const { ticket: updated } = (await patched.json()) as {
      ticket: { title: string; priority: string | null };
    };
    expect(updated.title).toBe("Billing — resolved");
    expect(updated.priority).toBe("high");

    const conv = await app.request("/api/v1/conversations", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        brandId: brand.id,
        channelType: "messenger",
        channelId: "t1",
        subject: "Need help with invoice",
        initialMessage: { plainText: "Hello" },
      }),
    });
    expect(conv.status).toBe(201);
    const { conversation } = (await conv.json()) as { conversation: { id: string } };

    const fromConv = await app.request("/api/v1/tickets/from-conversation", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.id }),
    });
    expect(fromConv.status).toBe(201);
    const { ticket: linked } = (await fromConv.json()) as {
      ticket: {
        id: string;
        title: string;
        conversationIds: string[];
        reporterId: string | null;
      };
    };
    expect(linked.title).toBe("Need help with invoice");
    expect(linked.conversationIds).toContain(conversation.id);
    expect(linked.reporterId).toBe(member.id);

    const duplicate = await app.request("/api/v1/tickets/from-conversation", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: conversation.id }),
    });
    expect(duplicate.status).toBe(201);
    const { ticket: sameTicket } = (await duplicate.json()) as { ticket: { id: string } };
    expect(sameTicket.id).toBe(linked.id);

    const statuses = await app.request("/api/v1/tickets/meta/statuses", { headers: auth });
    expect(statuses.status).toBe(200);
    const statusBody = (await statuses.json()) as {
      items: { id: string; name: string; category: string }[];
    };
    expect(statusBody.items.length).toBeGreaterThanOrEqual(4);
    const doneStatus = statusBody.items.find((s) => s.name === "Done");
    expect(doneStatus).toBeTruthy();

    const transitioned = await app.request(`/api/v1/tickets/${createdTicket.id}/status`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ statusId: doneStatus?.id }),
    });
    expect(transitioned.status).toBe(200);
    const { ticket: doneTicket } = (await transitioned.json()) as {
      ticket: { statusName: string | null; closedAt: string | null };
    };
    expect(doneTicket.statusName).toBe("Done");
    expect(doneTicket.closedAt).toBeTruthy();

    const events = await app.request(`/api/v1/tickets/${createdTicket.id}/events`, {
      headers: auth,
    });
    expect(events.status).toBe(200);
    const eventsBody = (await events.json()) as { items: { eventType: string }[] };
    expect(eventsBody.items.some((e) => e.eventType === "status_changed")).toBe(true);

    const types = await app.request("/api/v1/tickets/meta/types", { headers: auth });
    expect(types.status).toBe(200);
    const typesBody = (await types.json()) as {
      items: { id: string; name: string; kind: string }[];
    };
    expect(typesBody.items).toHaveLength(3);
    expect(typesBody.items.map((t) => t.kind).sort()).toEqual([
      "back_office",
      "customer",
      "tracker",
    ]);

    const trackerType = typesBody.items.find((t) => t.kind === "tracker");
    const customerType = typesBody.items.find((t) => t.kind === "customer");
    expect(trackerType).toBeTruthy();
    expect(customerType).toBeTruthy();

    const trackerRes = await app.request("/api/v1/tickets", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Release tracker", typeId: trackerType?.id }),
    });
    expect(trackerRes.status).toBe(201);
    const { ticket: tracker } = (await trackerRes.json()) as { ticket: { id: string } };

    const childRes = await app.request("/api/v1/tickets", {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Child task", typeId: customerType?.id }),
    });
    expect(childRes.status).toBe(201);
    const { ticket: child } = (await childRes.json()) as { ticket: { id: string } };

    const linkRes = await app.request(`/api/v1/tickets/${tracker.id}/link`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ childId: child.id, linkType: "tracks" }),
    });
    expect(linkRes.status).toBe(200);

    const trackerDone = await app.request(`/api/v1/tickets/${tracker.id}/status`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ statusId: doneStatus?.id }),
    });
    expect(trackerDone.status).toBe(200);

    const childAfter = await app.request(`/api/v1/tickets/${child.id}`, { headers: auth });
    const { ticket: syncedChild } = (await childAfter.json()) as {
      ticket: { statusName: string | null; closedAt: string | null };
    };
    expect(syncedChild.statusName).toBe("Done");
    expect(syncedChild.closedAt).toBeTruthy();

    await store.close();
  });
});
