import { zValidator } from "@hono/zod-validator";
import {
  API_VERSION,
  createTicketFromConversationBodySchema,
  createTicketSchema,
  linkTicketsSchema,
  listTicketEventsSchema,
  listTicketsSchema,
  transitionTicketStatusSchema,
  updateTicketSchema,
} from "@keenai/shared";
import { ticketEvents, tickets } from "@keenai/storage/schema";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  createTicketFromConversation,
  ensureOrgTicketDefaults,
  getTicketForOrg,
  linkTickets,
  listTicketEventsForTicket,
  listTicketStatusesForOrg,
  listTicketTypesForOrg,
  listTicketsForOrg,
  loadTicketMeta,
  transitionTicketStatus,
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

  r.get(`${prefix}/meta/statuses`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const db = c.get("store").db;
    await ensureOrgTicketDefaults(db, auth.orgId);
    const items = await listTicketStatusesForOrg(db, auth.orgId);
    return c.json({ items });
  });

  r.get(`${prefix}/meta/types`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const items = await listTicketTypesForOrg(c.get("store").db, auth.orgId);
    return c.json({ items });
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

  r.get(`${prefix}/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const row = await getTicketForOrg(c.get("store").db, c.req.param("id"), auth.orgId);
    if (!row) return c.json({ error: "not_found" }, 404);

    const ticket = await loadTicketMeta(c.get("store").db, row);
    return c.json({ ticket });
  });

  r.get(
    `${prefix}/:id/events`,
    requireAuth(),
    zValidator("query", listTicketEventsSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const { limit } = c.req.valid("query");
      const items = await listTicketEventsForTicket(
        c.get("store").db,
        c.req.param("id"),
        auth.orgId,
        limit,
      );
      if (!items) return c.json({ error: "not_found" }, 404);
      return c.json({ items });
    },
  );

  r.post(`${prefix}/:id/link`, requireAuth(), zValidator("json", linkTicketsSchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    try {
      const ticket = await linkTickets(c.get("store").db, {
        orgId: auth.orgId,
        parentId: c.req.param("id"),
        childId: body.childId,
        linkType: body.linkType,
        actorId: auth.memberId,
      });
      if (!ticket) return c.json({ error: "not_found" }, 404);
      return c.json({ ticket });
    } catch (err) {
      if (err instanceof Error && err.message === "self_link") {
        return c.json({ error: "self_link" }, 400);
      }
      throw err;
    }
  });

  r.post(
    `${prefix}/:id/status`,
    requireAuth(),
    zValidator("json", transitionTicketStatusSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      try {
        const ticket = await transitionTicketStatus(c.get("store").db, {
          ticketId: c.req.param("id"),
          orgId: auth.orgId,
          statusId: body.statusId,
          actorId: auth.memberId,
        });
        if (!ticket) return c.json({ error: "not_found" }, 404);
        return c.json({ ticket });
      } catch (err) {
        if (err instanceof Error && err.message === "status_not_found") {
          return c.json({ error: "status_not_found" }, 404);
        }
        throw err;
      }
    },
  );

  r.patch(`${prefix}/:id`, requireAuth(), zValidator("json", updateTicketSchema), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const body = c.req.valid("json");
    const db = c.get("store").db;
    let existing = await getTicketForOrg(db, c.req.param("id"), auth.orgId);
    if (!existing) return c.json({ error: "not_found" }, 404);

    if (
      body.statusId !== undefined &&
      body.statusId !== null &&
      body.statusId !== existing.statusId
    ) {
      try {
        const transitioned = await transitionTicketStatus(db, {
          ticketId: existing.id,
          orgId: auth.orgId,
          statusId: body.statusId,
          actorId: auth.memberId,
        });
        if (!transitioned) return c.json({ error: "not_found" }, 404);
        existing = (await getTicketForOrg(db, existing.id, auth.orgId)) ?? existing;
      } catch (err) {
        if (err instanceof Error && err.message === "status_not_found") {
          return c.json({ error: "status_not_found" }, 404);
        }
        throw err;
      }
    }

    const hasOtherFields =
      body.title !== undefined ||
      body.description !== undefined ||
      body.priority !== undefined ||
      body.assigneeId !== undefined;

    if (!hasOtherFields) {
      const ticket = await loadTicketMeta(db, existing);
      return c.json({ ticket });
    }

    const [row] = await db
      .update(tickets)
      .set({
        title: body.title ?? existing.title,
        description: body.description === undefined ? existing.description : body.description,
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

  return r;
}
