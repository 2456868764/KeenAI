import type { createLibsqlStore } from "@keenai/storage";
import {
  conversations,
  ticketConversations,
  ticketEvents,
  ticketStatuses,
  ticketTypes,
  tickets,
} from "@keenai/storage/schema";
import { and, desc, eq, lt, or } from "drizzle-orm";

type Db = ReturnType<typeof createLibsqlStore>["db"];

const DEFAULT_STATUSES = [
  { name: "Open", category: "active", isDefault: true, sortOrder: 0 },
  { name: "In progress", category: "active", isDefault: false, sortOrder: 1 },
  { name: "Waiting on customer", category: "waiting", isDefault: false, sortOrder: 2 },
  { name: "Done", category: "done", isDefault: false, sortOrder: 3 },
] as const;

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

export async function ensureOrgTicketDefaults(
  db: Db,
  orgId: string,
): Promise<{ typeId: string; statusId: string }> {
  const [existingType] = await db
    .select()
    .from(ticketTypes)
    .where(eq(ticketTypes.orgId, orgId))
    .limit(1);

  if (existingType) {
    const [defaultStatus] = await db
      .select()
      .from(ticketStatuses)
      .where(and(eq(ticketStatuses.orgId, orgId), eq(ticketStatuses.isDefault, true)))
      .limit(1);

    if (defaultStatus) {
      return { typeId: existingType.id, statusId: defaultStatus.id };
    }

    const [anyStatus] = await db
      .select()
      .from(ticketStatuses)
      .where(eq(ticketStatuses.orgId, orgId))
      .limit(1);

    if (anyStatus) return { typeId: existingType.id, statusId: anyStatus.id };

    const [createdStatus] = await db
      .insert(ticketStatuses)
      .values({
        orgId,
        name: "Open",
        category: "active",
        isDefault: true,
        ticketTypeIds: [existingType.id],
        sortOrder: 0,
      })
      .returning();

    if (!createdStatus) throw new Error("ticket status insert failed");
    return { typeId: existingType.id, statusId: createdStatus.id };
  }

  const [typeRow] = await db
    .insert(ticketTypes)
    .values({
      orgId,
      name: "Customer request",
      kind: "customer",
      fields: [],
      statusIds: [],
    })
    .returning();

  if (!typeRow) throw new Error("ticket type insert failed");

  const statusRows = await db
    .insert(ticketStatuses)
    .values(
      DEFAULT_STATUSES.map((s) => ({
        orgId,
        name: s.name,
        category: s.category,
        isDefault: s.isDefault,
        ticketTypeIds: [typeRow.id],
        sortOrder: s.sortOrder,
      })),
    )
    .returning();

  const defaultStatus = statusRows.find((s) => s.isDefault) ?? statusRows[0];
  if (!defaultStatus) throw new Error("ticket status insert failed");

  await db
    .update(ticketTypes)
    .set({ statusIds: statusRows.map((s) => s.id), updatedAt: new Date() })
    .where(eq(ticketTypes.id, typeRow.id));

  return { typeId: typeRow.id, statusId: defaultStatus.id };
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

  return loadTicketMeta(db, row);
}
