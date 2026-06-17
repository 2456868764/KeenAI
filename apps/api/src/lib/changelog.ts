import type { createLibsqlStore } from "@keenai/storage";
import {
  type ChangelogAudienceFilter,
  type ChangelogCategoryTag,
  type ChangelogEntryRow,
  type ChangelogEntryStatus,
  changelogEntries,
} from "@keenai/storage/schema";
import { and, desc, eq } from "drizzle-orm";

type Db = ReturnType<typeof createLibsqlStore>["db"];

export type SerializedChangelogEntry = {
  id: string;
  orgId: string;
  brandId: string;
  slug: string;
  title: string;
  summary: string | null;
  content: Record<string, unknown>;
  plainText: string;
  categoryTags: ChangelogCategoryTag[];
  status: ChangelogEntryStatus;
  publishedAt: string | null;
  scheduledAt: string | null;
  audienceFilter: ChangelogAudienceFilter;
  authorMemberId: string | null;
  viewCount: number;
  locale: string;
  createdAt: string;
  updatedAt: string;
};

function serializeEntry(row: ChangelogEntryRow): SerializedChangelogEntry {
  return {
    id: row.id,
    orgId: row.orgId,
    brandId: row.brandId,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? null,
    content: row.content ?? {},
    plainText: row.plainText,
    categoryTags: row.categoryTags ?? [],
    status: row.status,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    audienceFilter: row.audienceFilter ?? { segments: [] },
    authorMemberId: row.authorMemberId ?? null,
    viewCount: row.viewCount,
    locale: row.locale,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listChangelogEntries(
  db: Db,
  orgId: string,
  brandId: string,
  input?: { status?: ChangelogEntryStatus; limit?: number },
): Promise<SerializedChangelogEntry[]> {
  const filters = [eq(changelogEntries.orgId, orgId), eq(changelogEntries.brandId, brandId)];
  if (input?.status) filters.push(eq(changelogEntries.status, input.status));

  const rows = await db
    .select()
    .from(changelogEntries)
    .where(and(...filters))
    .orderBy(desc(changelogEntries.publishedAt), desc(changelogEntries.updatedAt))
    .limit(input?.limit ?? 100);

  return rows.map(serializeEntry);
}

export async function getChangelogEntryById(
  db: Db,
  orgId: string,
  id: string,
): Promise<SerializedChangelogEntry | null> {
  const [row] = await db
    .select()
    .from(changelogEntries)
    .where(and(eq(changelogEntries.id, id), eq(changelogEntries.orgId, orgId)))
    .limit(1);
  return row ? serializeEntry(row) : null;
}

export async function getChangelogEntryBySlug(
  db: Db,
  orgId: string,
  brandId: string,
  slug: string,
): Promise<SerializedChangelogEntry | null> {
  const [row] = await db
    .select()
    .from(changelogEntries)
    .where(
      and(
        eq(changelogEntries.orgId, orgId),
        eq(changelogEntries.brandId, brandId),
        eq(changelogEntries.slug, slug),
      ),
    )
    .limit(1);
  return row ? serializeEntry(row) : null;
}

export async function createChangelogEntry(
  db: Db,
  input: {
    orgId: string;
    brandId: string;
    slug: string;
    title: string;
    summary?: string;
    content?: Record<string, unknown>;
    plainText?: string;
    categoryTags?: ChangelogCategoryTag[];
    audienceFilter?: ChangelogAudienceFilter;
    scheduledAt?: Date;
    authorMemberId?: string;
  },
): Promise<SerializedChangelogEntry> {
  const status: ChangelogEntryStatus = input.scheduledAt ? "scheduled" : "draft";
  const [row] = await db
    .insert(changelogEntries)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      slug: input.slug,
      title: input.title,
      summary: input.summary,
      content: input.content ?? {},
      plainText: input.plainText ?? "",
      categoryTags: input.categoryTags ?? [],
      audienceFilter: input.audienceFilter ?? { segments: [] },
      status,
      scheduledAt: input.scheduledAt,
      authorMemberId: input.authorMemberId,
    })
    .returning();

  if (!row) throw new Error("changelog_entry_create_failed");
  return serializeEntry(row);
}

export async function updateChangelogEntry(
  db: Db,
  input: {
    orgId: string;
    id: string;
    patch: Partial<{
      slug: string;
      title: string;
      summary: string | null;
      content: Record<string, unknown>;
      plainText: string;
      categoryTags: ChangelogCategoryTag[];
      audienceFilter: ChangelogAudienceFilter;
      status: ChangelogEntryStatus;
      scheduledAt: Date | null;
    }>;
  },
): Promise<SerializedChangelogEntry | null> {
  const existing = await getChangelogEntryById(db, input.orgId, input.id);
  if (!existing) return null;

  const now = new Date();
  let publishedAt: Date | null | undefined;
  if (input.patch.status === "published") {
    publishedAt = now;
  } else if (input.patch.status === "draft") {
    publishedAt = null;
  }

  let status = input.patch.status;
  if (input.patch.scheduledAt && !status) {
    status = "scheduled";
  }

  const [row] = await db
    .update(changelogEntries)
    .set({
      ...input.patch,
      ...(status ? { status } : {}),
      ...(publishedAt !== undefined ? { publishedAt } : {}),
      updatedAt: now,
    })
    .where(and(eq(changelogEntries.id, input.id), eq(changelogEntries.orgId, input.orgId)))
    .returning();

  return row ? serializeEntry(row) : null;
}

export async function deleteChangelogEntry(db: Db, orgId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(changelogEntries)
    .where(and(eq(changelogEntries.id, id), eq(changelogEntries.orgId, orgId)))
    .returning({ id: changelogEntries.id });
  return deleted.length > 0;
}

export async function listPublicChangelogEntries(
  db: Db,
  orgId: string,
  brandId: string,
  limit = 50,
): Promise<SerializedChangelogEntry[]> {
  const rows = await db
    .select()
    .from(changelogEntries)
    .where(
      and(
        eq(changelogEntries.orgId, orgId),
        eq(changelogEntries.brandId, brandId),
        eq(changelogEntries.status, "published"),
      ),
    )
    .orderBy(desc(changelogEntries.publishedAt), desc(changelogEntries.updatedAt))
    .limit(limit);

  return rows.map(serializeEntry);
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("unique") || message.includes("constraint");
}
