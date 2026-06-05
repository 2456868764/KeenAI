import { type TicketField, parseTicketFields, validateTicketCustomFields } from "@keenai/shared";
import type { createLibsqlStore } from "@keenai/storage";
import {
  conversations,
  ticketConversations,
  ticketEvents,
  ticketLinks,
  ticketStatuses,
  ticketTypes,
  tickets,
} from "@keenai/storage/schema";
import { and, desc, eq, inArray, lt, or } from "drizzle-orm";

type Db = ReturnType<typeof createLibsqlStore>["db"];

const DEFAULT_STATUSES = [
  { name: "Open", category: "active", isDefault: true, sortOrder: 0 },
  { name: "In progress", category: "active", isDefault: false, sortOrder: 1 },
  { name: "Waiting on customer", category: "waiting", isDefault: false, sortOrder: 2 },
  { name: "Done", category: "done", isDefault: false, sortOrder: 3 },
] as const;

const DEFAULT_TYPE_DEFS = [
  { name: "Customer request", kind: "customer" as const },
  { name: "Internal task", kind: "back_office" as const },
  { name: "Tracker", kind: "tracker" as const },
];

export type SerializedTicketType = {
  id: string;
  name: string;
  kind: string;
  fields: TicketField[];
  statusIds: string[];
};

export type SerializedTicketStatus = {
  id: string;
  name: string;
  category: string;
  color: string | null;
  isDefault: boolean;
  sortOrder: number | null;
};

export type SerializedTicketEvent = {
  id: string;
  ticketId: string;
  eventType: string;
  actorId: string | null;
  payload: unknown;
  createdAt: string;
};

export type SerializedTicket = {
  id: string;
  orgId: string;
  typeId: string;
  typeName: string | null;
  title: string;
  description: unknown;
  statusId: string | null;
  statusName: string | null;
  priority: string | null;
  assigneeId: string | null;
  reporterId: string | null;
  customerId: string | null;
  customFields: Record<string, unknown>;
  dueDate: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  conversationIds: string[];
};

export function serializeTicket(
  row: typeof tickets.$inferSelect,
  meta?: {
    typeName?: string | null;
    statusName?: string | null;
    conversationIds?: string[];
  },
): SerializedTicket {
  return {
    id: row.id,
    orgId: row.orgId,
    typeId: row.typeId,
    typeName: meta?.typeName ?? null,
    title: row.title,
    description: row.description ?? null,
    statusId: row.statusId ?? null,
    statusName: meta?.statusName ?? null,
    priority: row.priority ?? null,
    assigneeId: row.assigneeId ?? null,
    reporterId: row.reporterId ?? null,
    customerId: row.customerId ?? null,
    customFields: (row.customFields as Record<string, unknown> | null) ?? {},
    dueDate: row.dueDate?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    conversationIds: meta?.conversationIds ?? [],
  };
}

function serializeTicketType(row: typeof ticketTypes.$inferSelect): SerializedTicketType {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    fields: parseTicketFields(row.fields),
    statusIds: row.statusIds ?? [],
  };
}

async function ensureTicketStatuses(db: Db, orgId: string, typeIds: string[]) {
  const existing = await db.select().from(ticketStatuses).where(eq(ticketStatuses.orgId, orgId));

  if (existing.length > 0) return existing;

  const statusRows = await db
    .insert(ticketStatuses)
    .values(
      DEFAULT_STATUSES.map((s) => ({
        orgId,
        name: s.name,
        category: s.category,
        isDefault: s.isDefault,
        ticketTypeIds: typeIds,
        sortOrder: s.sortOrder,
      })),
    )
    .returning();

  return statusRows;
}

async function ensureAllTicketTypes(db: Db, orgId: string) {
  const existing = await db.select().from(ticketTypes).where(eq(ticketTypes.orgId, orgId));
  const byKind = new Map(existing.map((row) => [row.kind, row]));

  const created: (typeof ticketTypes.$inferSelect)[] = [...existing];

  for (const def of DEFAULT_TYPE_DEFS) {
    if (byKind.has(def.kind)) continue;
    const [row] = await db
      .insert(ticketTypes)
      .values({ orgId, name: def.name, kind: def.kind, fields: [], statusIds: [] })
      .returning();
    if (row) {
      created.push(row);
      byKind.set(def.kind, row);
    }
  }

  const typeIds = created.map((t) => t.id);
  const statuses = await ensureTicketStatuses(db, orgId, typeIds);
  const statusIdList = statuses.map((s) => s.id);

  for (const type of created) {
    if ((type.statusIds ?? []).length === 0) {
      await db
        .update(ticketTypes)
        .set({ statusIds: statusIdList, updatedAt: new Date() })
        .where(eq(ticketTypes.id, type.id));
    }
  }

  return created;
}

export async function ensureOrgTicketDefaults(
  db: Db,
  orgId: string,
): Promise<{ typeId: string; statusId: string }> {
  const types = await ensureAllTicketTypes(db, orgId);
  const customerType = types.find((t) => t.kind === "customer") ?? types[0];
  if (!customerType) throw new Error("ticket type insert failed");

  const [defaultStatus] = await db
    .select()
    .from(ticketStatuses)
    .where(and(eq(ticketStatuses.orgId, orgId), eq(ticketStatuses.isDefault, true)))
    .limit(1);

  const [anyStatus] = defaultStatus
    ? [defaultStatus]
    : await db.select().from(ticketStatuses).where(eq(ticketStatuses.orgId, orgId)).limit(1);

  if (!anyStatus) throw new Error("ticket status insert failed");
  return { typeId: customerType.id, statusId: anyStatus.id };
}

export async function listTicketTypesForOrg(db: Db, orgId: string) {
  await ensureAllTicketTypes(db, orgId);
  const rows = await db
    .select()
    .from(ticketTypes)
    .where(eq(ticketTypes.orgId, orgId))
    .orderBy(ticketTypes.name);
  return rows.map(serializeTicketType);
}

export async function getTicketTypeForOrg(db: Db, typeId: string, orgId: string) {
  const [row] = await db
    .select()
    .from(ticketTypes)
    .where(and(eq(ticketTypes.id, typeId), eq(ticketTypes.orgId, orgId)))
    .limit(1);
  return row ? serializeTicketType(row) : null;
}

export async function validateCustomFieldsForTicket(
  db: Db,
  typeId: string,
  orgId: string,
  values: Record<string, unknown>,
) {
  const type = await getTicketTypeForOrg(db, typeId, orgId);
  if (!type) return { ok: false as const, error: "type_not_found" };
  const result = validateTicketCustomFields(type.fields, values);
  if (!result.ok)
    return { ok: false as const, error: "invalid_custom_fields", details: result.errors };
  return { ok: true as const };
}

async function fanOutTrackerStatus(
  db: Db,
  trackerId: string,
  orgId: string,
  statusId: string,
  nextStatus: typeof ticketStatuses.$inferSelect,
  actorId?: string,
) {
  const links = await db
    .select({ childId: ticketLinks.childId })
    .from(ticketLinks)
    .where(and(eq(ticketLinks.parentId, trackerId), eq(ticketLinks.linkType, "tracks")));

  if (links.length === 0) return;

  const childIds = links.map((l) => l.childId);
  const closedAt = nextStatus.category === "done" ? new Date() : null;

  await db
    .update(tickets)
    .set({ statusId, closedAt, updatedAt: new Date() })
    .where(and(eq(tickets.orgId, orgId), inArray(tickets.id, childIds)));

  for (const childId of childIds) {
    await db.insert(ticketEvents).values({
      ticketId: childId,
      eventType: "tracker_status_sync",
      actorId: actorId ?? null,
      payload: { trackerId, statusId, category: nextStatus.category },
    });
  }
}

export async function linkTickets(
  db: Db,
  input: {
    orgId: string;
    parentId: string;
    childId: string;
    linkType: string;
    actorId?: string;
  },
): Promise<SerializedTicket | null> {
  if (input.parentId === input.childId) throw new Error("self_link");

  const parent = await getTicketForOrg(db, input.parentId, input.orgId);
  const child = await getTicketForOrg(db, input.childId, input.orgId);
  if (!parent || !child) return null;

  await db
    .insert(ticketLinks)
    .values({
      parentId: input.parentId,
      childId: input.childId,
      linkType: input.linkType,
    })
    .onConflictDoNothing();

  await db.insert(ticketEvents).values({
    ticketId: input.parentId,
    eventType: "ticket_linked",
    actorId: input.actorId ?? null,
    payload: { childId: input.childId, linkType: input.linkType },
  });

  return loadTicketMeta(db, parent);
}

export function ticketCursorWhere(cursor: string | undefined) {
  if (!cursor) return undefined;
  const sep = cursor.indexOf("|");
  if (sep <= 0) return undefined;
  const updatedAt = new Date(cursor.slice(0, sep));
  const id = cursor.slice(sep + 1);
  if (Number.isNaN(updatedAt.getTime()) || !id) return undefined;
  return or(
    lt(tickets.updatedAt, updatedAt),
    and(eq(tickets.updatedAt, updatedAt), lt(tickets.id, id)),
  );
}

export function encodeTicketCursor(updatedAt: Date, id: string): string {
  return `${updatedAt.toISOString()}|${id}`;
}

export async function getTicketForOrg(db: Db, ticketId: string, orgId: string) {
  const [row] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function loadTicketMeta(
  db: Db,
  row: typeof tickets.$inferSelect,
): Promise<SerializedTicket> {
  const [typeRow] = await db
    .select({ name: ticketTypes.name })
    .from(ticketTypes)
    .where(eq(ticketTypes.id, row.typeId))
    .limit(1);

  let statusName: string | null = null;
  if (row.statusId) {
    const [statusRow] = await db
      .select({ name: ticketStatuses.name })
      .from(ticketStatuses)
      .where(eq(ticketStatuses.id, row.statusId))
      .limit(1);
    statusName = statusRow?.name ?? null;
  }

  const links = await db
    .select({ conversationId: ticketConversations.conversationId })
    .from(ticketConversations)
    .where(eq(ticketConversations.ticketId, row.id));

  return serializeTicket(row, {
    typeName: typeRow?.name ?? null,
    statusName,
    conversationIds: links.map((l) => l.conversationId),
  });
}

export async function createTicketFromConversation(
  db: Db,
  input: {
    orgId: string;
    conversationId: string;
    reporterId?: string;
    title?: string;
  },
): Promise<SerializedTicket> {
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, input.conversationId), eq(conversations.orgId, input.orgId)))
    .limit(1);

  if (!conversation) throw new Error("conversation_not_found");

  const [existingLink] = await db
    .select({ ticketId: ticketConversations.ticketId })
    .from(ticketConversations)
    .where(eq(ticketConversations.conversationId, input.conversationId))
    .limit(1);

  if (existingLink) {
    const existing = await getTicketForOrg(db, existingLink.ticketId, input.orgId);
    if (existing) return loadTicketMeta(db, existing);
  }

  const defaults = await ensureOrgTicketDefaults(db, input.orgId);
  const title = input.title?.trim() || conversation.subject?.trim() || "Conversation ticket";

  const [row] = await db
    .insert(tickets)
    .values({
      orgId: input.orgId,
      typeId: defaults.typeId,
      statusId: defaults.statusId,
      title,
      assigneeId: conversation.assigneeId ?? null,
      reporterId: input.reporterId ?? null,
      customerId: conversation.userId ?? null,
      priority: conversation.priority ?? "normal",
    })
    .returning();

  if (!row) throw new Error("ticket insert failed");

  await db.insert(ticketConversations).values({
    ticketId: row.id,
    conversationId: input.conversationId,
    relationship: "primary",
  });

  await db.insert(ticketEvents).values({
    ticketId: row.id,
    eventType: "created_from_conversation",
    actorId: input.reporterId ?? null,
    payload: { conversationId: input.conversationId },
  });

  return loadTicketMeta(db, row);
}

export async function listTicketsForOrg(
  db: Db,
  orgId: string,
  opts: { statusId?: string; assigneeId?: string; limit: number; cursor?: string },
) {
  const filters = [eq(tickets.orgId, orgId)];
  if (opts.statusId) filters.push(eq(tickets.statusId, opts.statusId));
  if (opts.assigneeId) filters.push(eq(tickets.assigneeId, opts.assigneeId));
  const cursorFilter = ticketCursorWhere(opts.cursor);
  if (cursorFilter) filters.push(cursorFilter);

  const rows = await db
    .select()
    .from(tickets)
    .where(and(...filters))
    .orderBy(desc(tickets.updatedAt), desc(tickets.id))
    .limit(opts.limit + 1);

  const hasMore = rows.length > opts.limit;
  const page = hasMore ? rows.slice(0, opts.limit) : rows;
  const items = await Promise.all(page.map((row) => loadTicketMeta(db, row)));

  const last = page.at(-1);
  const nextCursor = hasMore && last ? encodeTicketCursor(last.updatedAt, last.id) : null;

  return { items, nextCursor };
}

export function serializeTicketStatus(
  row: typeof ticketStatuses.$inferSelect,
): SerializedTicketStatus {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    color: row.color ?? null,
    isDefault: row.isDefault ?? false,
    sortOrder: row.sortOrder ?? null,
  };
}

export async function listTicketStatusesForOrg(db: Db, orgId: string) {
  const rows = await db
    .select()
    .from(ticketStatuses)
    .where(eq(ticketStatuses.orgId, orgId))
    .orderBy(ticketStatuses.sortOrder, ticketStatuses.name);
  return rows.map(serializeTicketStatus);
}

export function serializeTicketEvent(row: typeof ticketEvents.$inferSelect): SerializedTicketEvent {
  return {
    id: row.id,
    ticketId: row.ticketId,
    eventType: row.eventType,
    actorId: row.actorId ?? null,
    payload: row.payload ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listTicketEventsForTicket(
  db: Db,
  ticketId: string,
  orgId: string,
  limit: number,
) {
  const ticket = await getTicketForOrg(db, ticketId, orgId);
  if (!ticket) return null;

  const rows = await db
    .select()
    .from(ticketEvents)
    .where(eq(ticketEvents.ticketId, ticketId))
    .orderBy(desc(ticketEvents.createdAt))
    .limit(limit);

  return rows.map(serializeTicketEvent);
}

export async function getTicketStatusForOrg(db: Db, statusId: string, orgId: string) {
  const [row] = await db
    .select()
    .from(ticketStatuses)
    .where(and(eq(ticketStatuses.id, statusId), eq(ticketStatuses.orgId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function listTicketsForCustomer(
  db: Db,
  orgId: string,
  customerId: string,
  limit = 50,
) {
  const rows = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.orgId, orgId), eq(tickets.customerId, customerId)))
    .orderBy(desc(tickets.updatedAt))
    .limit(limit);

  return Promise.all(rows.map((row) => loadTicketMeta(db, row)));
}

export function serializePortalTicket(ticket: SerializedTicket) {
  return {
    id: ticket.id,
    title: ticket.title,
    statusName: ticket.statusName,
    priority: ticket.priority,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    closedAt: ticket.closedAt,
  };
}

export async function transitionTicketStatus(
  db: Db,
  input: { ticketId: string; orgId: string; statusId: string; actorId?: string },
): Promise<SerializedTicket | null> {
  const existing = await getTicketForOrg(db, input.ticketId, input.orgId);
  if (!existing) return null;

  const nextStatus = await getTicketStatusForOrg(db, input.statusId, input.orgId);
  if (!nextStatus) throw new Error("status_not_found");

  if (existing.statusId === input.statusId) {
    return loadTicketMeta(db, existing);
  }

  const closedAt = nextStatus.category === "done" ? new Date() : null;

  const [row] = await db
    .update(tickets)
    .set({
      statusId: input.statusId,
      closedAt,
      updatedAt: new Date(),
    })
    .where(eq(tickets.id, existing.id))
    .returning();

  if (!row) throw new Error("update_failed");

  await db.insert(ticketEvents).values({
    ticketId: row.id,
    eventType: "status_changed",
    actorId: input.actorId ?? null,
    payload: {
      fromStatusId: existing.statusId,
      toStatusId: input.statusId,
      toCategory: nextStatus.category,
    },
  });

  const [typeRow] = await db
    .select({ kind: ticketTypes.kind })
    .from(ticketTypes)
    .where(eq(ticketTypes.id, row.typeId))
    .limit(1);

  if (typeRow?.kind === "tracker") {
    await fanOutTrackerStatus(db, row.id, input.orgId, input.statusId, nextStatus, input.actorId);
  }

  return loadTicketMeta(db, row);
}
