import { zValidator } from "@hono/zod-validator";
import {
  API_VERSION,
  createTicketFromConversationBodySchema,
  createTicketSchema,
  listTicketsSchema,
  updateTicketSchema,
} from "@keenai/shared";
import { ticketEvents, tickets } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  createTicketFromConversation,
  ensureOrgTicketDefaults,
  getTicketForOrg,
  listTicketsForOrg,
  loadTicketMeta,
} from "../lib/tickets.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

export function ticketRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/tickets`;

  r.get(prefix, requireAuth(), zValidator("query", listTicketsSchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const query = c.req.valid("query");
    const result = await listTicketsForOrg(c.get("store").db, auth.orgId, query);
    return c.json(result);
  });

  r.post(prefix, requireAuth(), zValidator("json", createTicketSchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    const db = c.get("store").db;

    if (body.conversationId) {
      try {
        const ticket = await createTicketFromConversation(db, {
          orgId: auth.orgId,
          conversationId: body.conversationId,
          reporterId: auth.memberId,
          title: body.title,
        });
        return c.json({ ticket }, 201);
      } catch (err) {
        if (err instanceof Error && err.message === "conversation_not_found") {
          return c.json({ error: "conversation_not_found" }, 404);
        }
        throw err;
      }
    }

    const defaults = await ensureOrgTicketDefaults(db, auth.orgId);

    const [row] = await db
      .insert(tickets)
      .values({
        orgId: auth.orgId,
        typeId: body.typeId ?? defaults.typeId,
        statusId: body.statusId ?? defaults.statusId,
        title: body.title,
        description: body.description,
        priority: body.priority ?? "normal",
        assigneeId: body.assigneeId ?? null,
        reporterId: auth.memberId,
      })
      .returning();

    if (!row) return c.json({ error: "create_failed" }, 500);

    await db.insert(ticketEvents).values({
      ticketId: row.id,
      eventType: "created",
      actorId: auth.memberId,
    });

    const ticket = await loadTicketMeta(db, row);
    return c.json({ ticket }, 201);
  });

  r.get(`${prefix}/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const row = await getTicketForOrg(c.get("store").db, c.req.param("id"), auth.orgId);
    if (!row) return c.json({ error: "not_found" }, 404);

    const ticket = await loadTicketMeta(c.get("store").db, row);
    return c.json({ ticket });
  });

  r.patch(`${prefix}/:id`, requireAuth(), zValidator("json", updateTicketSchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    const db = c.get("store").db;
    const existing = await getTicketForOrg(db, c.req.param("id"), auth.orgId);
    if (!existing) return c.json({ error: "not_found" }, 404);

    const [row] = await db
      .update(tickets)
      .set({
        title: body.title ?? existing.title,
        description: body.description === undefined ? existing.description : body.description,
        statusId: body.statusId === undefined ? existing.statusId : body.statusId,
        priority: body.priority ?? existing.priority,
        assigneeId: body.assigneeId === undefined ? existing.assigneeId : body.assigneeId,
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, existing.id))
      .returning();

    if (!row) return c.json({ error: "update_failed" }, 500);

    await db.insert(ticketEvents).values({
      ticketId: row.id,
      eventType: "updated",
      actorId: auth.memberId,
      payload: body,
    });

    const ticket = await loadTicketMeta(db, row);
    return c.json({ ticket });
  });

  r.post(
    `${prefix}/from-conversation`,
    requireAuth(),
    zValidator("json", createTicketFromConversationBodySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");

      try {
        const ticket = await createTicketFromConversation(c.get("store").db, {
          orgId: auth.orgId,
          conversationId: body.conversationId,
          reporterId: auth.memberId,
          title: body.title,
        });
        return c.json({ ticket }, 201);
      } catch (err) {
        if (err instanceof Error && err.message === "conversation_not_found") {
          return c.json({ error: "conversation_not_found" }, 404);
        }
        throw err;
      }
    },
  );

  return r;
}
