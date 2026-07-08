import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { KeenaiDb } from "@keenai/storage";
import {
  accounts,
  brands,
  conversations,
  members,
  messages,
  organizations,
} from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";

type IntercomActor = {
  id?: string | number;
  type?: string;
  email?: string;
  name?: string;
};

type IntercomUser = IntercomActor & {
  user_id?: string | number;
  created_at?: string | number;
  updated_at?: string | number;
};

type IntercomConversationPart = {
  id?: string | number;
  type?: string;
  part_type?: string;
  body?: string;
  created_at?: string | number;
  updated_at?: string | number;
  author?: IntercomActor;
};

type IntercomConversation = {
  id: string | number;
  title?: string;
  subject?: string;
  state?: string;
  open?: boolean;
  created_at?: string | number;
  updated_at?: string | number;
  user?: IntercomActor;
  source?: {
    id?: string | number;
    type?: string;
    subject?: string;
    body?: string;
    author?: IntercomActor;
    created_at?: string | number;
  };
  conversation_message?: {
    id?: string | number;
    subject?: string;
    body?: string;
    author?: IntercomActor;
    created_at?: string | number;
  };
  conversation_parts?: {
    conversation_parts?: IntercomConversationPart[];
    data?: IntercomConversationPart[];
  };
};

type IntercomFullExport = {
  users?: IntercomUser[];
  contacts?: IntercomUser[];
  admins?: IntercomUser[];
  teammates?: IntercomUser[];
  conversations?: IntercomConversation[];
  data?: {
    users?: IntercomUser[];
    contacts?: IntercomUser[];
    admins?: IntercomUser[];
    conversations?: IntercomConversation[];
  };
};

export type ImportIntercomFullInput = {
  db: KeenaiDb;
  orgSlug: string;
  brandSlug?: string;
  filePath: string;
  dryRun: boolean;
};

export type ImportIntercomFullResult = {
  orgId: string;
  brandId: string;
  usersImported: number;
  usersSkipped: number;
  conversationsImported: number;
  conversationsUpdated: number;
  messagesImported: number;
};

function arrayFrom<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function timestamp(value: string | number | undefined): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return new Date(value < 10_000_000_000 ? value * 1000 : value);
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return timestamp(numeric);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function plainText(html: string | undefined): string {
  return (html ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function externalUserId(user: IntercomUser | IntercomActor | undefined): string | undefined {
  const candidate = (user as IntercomUser | undefined)?.user_id ?? user?.id;
  return candidate === undefined || candidate === null ? undefined : String(candidate);
}

function stableFallbackEmail(user: IntercomUser): string | undefined {
  const id = externalUserId(user);
  if (!id) return undefined;
  const digest = createHash("sha1").update(id).digest("hex").slice(0, 12);
  return `intercom-${digest}@import.keenai.local`;
}

function normalizeFullExport(raw: unknown): {
  users: IntercomUser[];
  conversations: IntercomConversation[];
} {
  const obj = raw as IntercomFullExport;
  return {
    users: [
      ...arrayFrom<IntercomUser>(obj.users),
      ...arrayFrom<IntercomUser>(obj.contacts),
      ...arrayFrom<IntercomUser>(obj.admins),
      ...arrayFrom<IntercomUser>(obj.teammates),
      ...arrayFrom<IntercomUser>(obj.data?.users),
      ...arrayFrom<IntercomUser>(obj.data?.contacts),
      ...arrayFrom<IntercomUser>(obj.data?.admins),
    ],
    conversations: [
      ...arrayFrom<IntercomConversation>(obj.conversations),
      ...arrayFrom<IntercomConversation>(obj.data?.conversations),
    ],
  };
}

async function readJsonFile(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

async function readIntercomExport(filePath: string): Promise<{
  users: IntercomUser[];
  conversations: IntercomConversation[];
}> {
  const resolved = path.resolve(filePath);
  if (resolved.endsWith(".zip")) {
    throw new Error(
      "intercom zip import requires an extracted export directory or normalized JSON file",
    );
  }

  const entry = await stat(resolved);
  if (entry.isFile()) return normalizeFullExport(await readJsonFile(resolved));

  const names = await readdir(resolved);
  const merged: IntercomFullExport = {};
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const raw = await readJsonFile(path.join(resolved, name));
    const normalized = normalizeFullExport(raw);
    const key = name.toLowerCase();
    if (key.includes("conversation")) merged.conversations = normalized.conversations;
    else if (key.includes("admin")) merged.admins = normalized.users;
    else merged.users = [...(merged.users ?? []), ...normalized.users];
  }
  return normalizeFullExport(merged);
}

function conversationStatus(item: IntercomConversation): string {
  if (item.open === true) return "open";
  if (item.open === false) return "closed";
  if (item.state === "closed") return "closed";
  if (item.state === "snoozed") return "snoozed";
  return "open";
}

function conversationParts(item: IntercomConversation): IntercomConversationPart[] {
  const root = item.conversation_message ?? item.source;
  const initial =
    root && plainText(root.body)
      ? [
          {
            id: root.id ?? `${item.id}:source`,
            type: "conversation_message",
            body: root.body,
            author: root.author,
            created_at: root.created_at ?? item.created_at,
          },
        ]
      : [];
  return [
    ...initial,
    ...arrayFrom<IntercomConversationPart>(item.conversation_parts?.conversation_parts),
    ...arrayFrom<IntercomConversationPart>(item.conversation_parts?.data),
  ];
}

function senderType(actor: IntercomActor | undefined): "user" | "agent" {
  return actor?.type === "admin" || actor?.type === "teammate" ? "agent" : "user";
}

async function importUser(
  db: KeenaiDb,
  orgId: string,
  user: IntercomUser,
): Promise<"imported" | "skipped"> {
  const externalId = externalUserId(user);
  const email = user.email?.trim().toLowerCase() || stableFallbackEmail(user);
  if (!externalId || !email) return "skipped";

  const name = user.name?.trim() || email.split("@")[0] || "Intercom User";
  const [account] = await db
    .insert(accounts)
    .values({
      email,
      name,
      locale: "en",
      lastLoginAt: timestamp(user.updated_at),
    })
    .onConflictDoUpdate({
      target: accounts.email,
      set: {
        name,
        lastLoginAt: timestamp(user.updated_at),
      },
    })
    .returning({ id: accounts.id });
  if (!account) return "skipped";

  const role = user.type === "admin" || user.type === "teammate" ? "agent" : "lite";
  await db
    .insert(members)
    .values({
      orgId,
      accountId: account.id,
      role,
      seatType: role === "agent" ? "full" : "lite",
      status: "active",
      joinedAt: timestamp(user.created_at),
    })
    .onConflictDoUpdate({
      target: [members.orgId, members.accountId],
      set: { role, status: "active" },
    });

  return "imported";
}

/** P3-14: Intercom users/admins + conversations/messages → KeenAI core tables. */
export async function importIntercomFullExport(
  input: ImportIntercomFullInput,
): Promise<ImportIntercomFullResult> {
  const source = await readIntercomExport(input.filePath);

  const [org] = await input.db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, input.orgSlug))
    .limit(1);
  if (!org) throw new Error(`organization_not_found:${input.orgSlug}`);

  const brandSlug = input.brandSlug ?? "default";
  const [brand] = await input.db
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.orgId, org.id), eq(brands.slug, brandSlug)))
    .limit(1);
  if (!brand) throw new Error(`brand_not_found:${brandSlug}`);

  let usersImported = 0;
  let usersSkipped = 0;
  let conversationsImported = 0;
  let conversationsUpdated = 0;
  let messagesImported = 0;
  const now = new Date();

  for (const user of source.users) {
    if (input.dryRun) {
      if (externalUserId(user)) usersImported += 1;
      else usersSkipped += 1;
      continue;
    }
    const result = await importUser(input.db, org.id, user);
    if (result === "imported") usersImported += 1;
    else usersSkipped += 1;
  }

  for (const item of source.conversations) {
    const externalId = String(item.id);
    const status = conversationStatus(item);
    const subject =
      item.subject ??
      item.title ??
      item.conversation_message?.subject ??
      item.source?.subject ??
      null;
    const parts = conversationParts(item);
    const lastMessageAt =
      timestamp(parts.at(-1)?.created_at) ??
      timestamp(item.updated_at) ??
      timestamp(item.created_at) ??
      now;

    if (input.dryRun) {
      conversationsImported += 1;
      messagesImported += parts.filter((part) => plainText(part.body)).length;
      continue;
    }

    const existing = await input.db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.orgId, org.id),
          eq(conversations.brandId, brand.id),
          eq(conversations.channelType, "intercom"),
          eq(conversations.channelId, externalId),
        ),
      )
      .limit(1);

    const conversationValues = {
      orgId: org.id,
      brandId: brand.id,
      userId: externalUserId(item.user ?? item.source?.author ?? item.conversation_message?.author),
      channelType: "intercom",
      channelId: externalId,
      status,
      subject,
      lastMessageAt,
      closedAt: status === "closed" ? (timestamp(item.updated_at) ?? now) : null,
      messageCount: parts.filter((part) => plainText(part.body)).length,
      attributes: {
        importProvider: "intercom",
        externalId,
        sourceState: item.state,
      },
      updatedAt: now,
    };

    let conversationId = existing[0]?.id;
    if (conversationId) {
      await input.db
        .update(conversations)
        .set(conversationValues)
        .where(eq(conversations.id, conversationId));
      conversationsUpdated += 1;
    } else {
      const [created] = await input.db
        .insert(conversations)
        .values({
          ...conversationValues,
          createdAt: timestamp(item.created_at) ?? now,
        })
        .returning({ id: conversations.id });
      conversationId = created?.id;
      conversationsImported += 1;
    }
    if (!conversationId || existing[0]) continue;

    for (const part of parts) {
      const text = plainText(part.body);
      if (!text) continue;
      await input.db.insert(messages).values({
        orgId: org.id,
        conversationId,
        senderType: senderType(part.author),
        senderId: externalUserId(part.author),
        content: { type: "doc", text },
        plainText: text,
        contentFormat: "html",
        sentVia: "intercom_import",
        metadata: {
          importProvider: "intercom",
          externalId: part.id === undefined ? null : String(part.id),
          partType: part.part_type ?? part.type,
        },
        createdAt: timestamp(part.created_at) ?? timestamp(item.created_at) ?? now,
      });
      messagesImported += 1;
    }
  }

  return {
    orgId: org.id,
    brandId: brand.id,
    usersImported,
    usersSkipped,
    conversationsImported,
    conversationsUpdated,
    messagesImported,
  };
}
