import type { createLibsqlStore } from "@keenai/storage";
import { helpArticles, helpCollections, kbDocuments, kbSources } from "@keenai/storage/schema";
import { and, desc, eq, sql } from "drizzle-orm";

type Db = ReturnType<typeof createLibsqlStore>["db"];

export type SerializedHelpCollection = {
  id: string;
  orgId: string;
  brandId: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  public: boolean;
  locale: string;
  articleCount?: number;
  createdAt: string;
  updatedAt: string;
};

export type SerializedHelpArticle = {
  id: string;
  orgId: string;
  brandId: string;
  collectionId: string | null;
  collectionSlug: string | null;
  slug: string;
  title: string;
  content: Record<string, unknown>;
  plainText: string;
  excerpt: string | null;
  status: "draft" | "published" | "archived";
  tags: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  kbDocumentId: string | null;
  locale: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function serializeCollection(
  row: typeof helpCollections.$inferSelect,
  articleCount?: number,
): SerializedHelpCollection {
  return {
    id: row.id,
    orgId: row.orgId,
    brandId: row.brandId,
    slug: row.slug,
    name: row.name,
    description: row.description,
    icon: row.icon,
    sortOrder: row.sortOrder,
    public: row.public,
    locale: row.locale,
    articleCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeArticle(
  row: typeof helpArticles.$inferSelect,
  collectionSlug: string | null,
): SerializedHelpArticle {
  return {
    id: row.id,
    orgId: row.orgId,
    brandId: row.brandId,
    collectionId: row.collectionId,
    collectionSlug,
    slug: row.slug,
    title: row.title,
    content: row.content ?? {},
    plainText: row.plainText,
    excerpt: row.excerpt,
    status: row.status,
    tags: row.tags ?? [],
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    kbDocumentId: row.kbDocumentId,
    locale: row.locale,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function ensureDefaultHelpCollection(db: Db, orgId: string, brandId: string) {
  const [existing] = await db
    .select()
    .from(helpCollections)
    .where(
      and(
        eq(helpCollections.orgId, orgId),
        eq(helpCollections.brandId, brandId),
        eq(helpCollections.slug, "general"),
      ),
    )
    .limit(1);

  if (existing) return serializeCollection(existing);

  const [row] = await db
    .insert(helpCollections)
    .values({
      orgId,
      brandId,
      slug: "general",
      name: "General",
      description: "Default help collection",
      sortOrder: 0,
      public: true,
    })
    .returning();

  if (!row) throw new Error("help_collection_create_failed");
  return serializeCollection(row);
}

export async function listHelpCollections(db: Db, orgId: string, brandId: string) {
  const rows = await db
    .select()
    .from(helpCollections)
    .where(and(eq(helpCollections.orgId, orgId), eq(helpCollections.brandId, brandId)))
    .orderBy(helpCollections.sortOrder, helpCollections.name);

  const countRows = await db
    .select({
      collectionId: helpArticles.collectionId,
      articleCount: sql<number>`count(*)`,
    })
    .from(helpArticles)
    .where(and(eq(helpArticles.orgId, orgId), eq(helpArticles.brandId, brandId)))
    .groupBy(helpArticles.collectionId);

  const counts = new Map(
    countRows
      .filter((row) => row.collectionId)
      .map((row) => [row.collectionId as string, Number(row.articleCount)]),
  );

  return rows.map((row) => serializeCollection(row, counts.get(row.id) ?? 0));
}

export async function createHelpCollection(
  db: Db,
  input: {
    orgId: string;
    brandId: string;
    slug: string;
    name: string;
    description?: string;
    icon?: string;
    public?: boolean;
    sortOrder?: number;
  },
) {
  const [row] = await db
    .insert(helpCollections)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      icon: input.icon,
      public: input.public ?? true,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();

  if (!row) throw new Error("help_collection_create_failed");
  return serializeCollection(row);
}

export async function getHelpCollectionById(db: Db, orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(helpCollections)
    .where(and(eq(helpCollections.id, id), eq(helpCollections.orgId, orgId)))
    .limit(1);
  return row ? serializeCollection(row) : null;
}

export async function listHelpArticles(
  db: Db,
  input: {
    orgId: string;
    brandId: string;
    collectionId?: string;
    status?: "draft" | "published" | "archived";
    limit?: number;
  },
) {
  const conditions = [eq(helpArticles.orgId, input.orgId), eq(helpArticles.brandId, input.brandId)];
  if (input.collectionId) conditions.push(eq(helpArticles.collectionId, input.collectionId));
  if (input.status) conditions.push(eq(helpArticles.status, input.status));

  const rows = await db
    .select({ article: helpArticles, collectionSlug: helpCollections.slug })
    .from(helpArticles)
    .leftJoin(helpCollections, eq(helpArticles.collectionId, helpCollections.id))
    .where(and(...conditions))
    .orderBy(desc(helpArticles.updatedAt))
    .limit(input.limit ?? 100);

  return rows.map((row) => serializeArticle(row.article, row.collectionSlug));
}

export async function getHelpArticleById(db: Db, orgId: string, id: string) {
  const [row] = await db
    .select({ article: helpArticles, collectionSlug: helpCollections.slug })
    .from(helpArticles)
    .leftJoin(helpCollections, eq(helpArticles.collectionId, helpCollections.id))
    .where(and(eq(helpArticles.id, id), eq(helpArticles.orgId, orgId)))
    .limit(1);

  return row ? serializeArticle(row.article, row.collectionSlug) : null;
}

export async function createHelpArticle(
  db: Db,
  input: {
    orgId: string;
    brandId: string;
    collectionId?: string | null;
    slug: string;
    title: string;
    content?: Record<string, unknown>;
    plainText?: string;
    excerpt?: string;
    tags?: string[];
    seoTitle?: string;
    seoDescription?: string;
    authorMemberId?: string;
  },
) {
  let collectionId = input.collectionId ?? null;
  if (!collectionId) {
    const defaultCollection = await ensureDefaultHelpCollection(db, input.orgId, input.brandId);
    collectionId = defaultCollection.id;
  }

  const [row] = await db
    .insert(helpArticles)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      collectionId,
      slug: input.slug,
      title: input.title,
      content: input.content ?? {},
      plainText: input.plainText ?? "",
      excerpt: input.excerpt,
      tags: input.tags ?? [],
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      authorMemberId: input.authorMemberId,
      status: "draft",
    })
    .returning();

  if (!row) throw new Error("help_article_create_failed");
  const collection = collectionId
    ? await getHelpCollectionById(db, input.orgId, collectionId)
    : null;
  return serializeArticle(row, collection?.slug ?? null);
}

export async function updateHelpArticle(
  db: Db,
  input: {
    orgId: string;
    id: string;
    patch: Partial<{
      collectionId: string | null;
      slug: string;
      title: string;
      content: Record<string, unknown>;
      plainText: string;
      excerpt: string | null;
      tags: string[];
      seoTitle: string | null;
      seoDescription: string | null;
      status: "draft" | "published" | "archived";
    }>;
  },
) {
  const existing = await getHelpArticleById(db, input.orgId, input.id);
  if (!existing) return null;

  const now = new Date();
  const publishedAt =
    input.patch.status === "published" ? now : input.patch.status === "draft" ? null : undefined;

  const [row] = await db
    .update(helpArticles)
    .set({
      ...input.patch,
      ...(publishedAt !== undefined ? { publishedAt } : {}),
      updatedAt: now,
    })
    .where(and(eq(helpArticles.id, input.id), eq(helpArticles.orgId, input.orgId)))
    .returning();

  if (!row) return null;

  const collection = row.collectionId
    ? await getHelpCollectionById(db, input.orgId, row.collectionId)
    : null;
  return serializeArticle(row, collection?.slug ?? null);
}

async function ensureHelpCenterKbSource(db: Db, orgId: string, brandId: string) {
  const [existing] = await db
    .select()
    .from(kbSources)
    .where(
      and(
        eq(kbSources.orgId, orgId),
        eq(kbSources.brandId, brandId),
        eq(kbSources.type, "help_center"),
      ),
    )
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(kbSources)
    .values({ orgId, brandId, type: "help_center", name: "Help Center" })
    .returning();

  if (!created) throw new Error("kb_source_create_failed");
  return created;
}

/** Sync a published help article into kb_documents for hybrid search. */
export async function syncHelpArticleToKb(db: Db, orgId: string, articleId: string) {
  const article = await getHelpArticleById(db, orgId, articleId);
  if (!article) return null;

  const collection = article.collectionId
    ? await getHelpCollectionById(db, orgId, article.collectionId)
    : null;
  const source = await ensureHelpCenterKbSource(db, orgId, article.brandId);
  const isPublic = article.status === "published" && (collection?.public ?? true);
  const collectionSlug = collection?.slug ?? article.collectionSlug ?? "general";
  const rawContent = article.plainText.trim() || article.title;

  const metadata = {
    collection: collectionSlug,
    slug: article.slug,
    public: isPublic,
    excerpt: article.excerpt,
    helpArticleId: article.id,
  };

  if (article.kbDocumentId) {
    const [updated] = await db
      .update(kbDocuments)
      .set({
        title: article.title,
        rawContent,
        metadata,
        status: article.status === "archived" ? "archived" : "active",
        updatedAt: new Date(),
      })
      .where(and(eq(kbDocuments.id, article.kbDocumentId), eq(kbDocuments.orgId, orgId)))
      .returning();
    return updated?.id ?? article.kbDocumentId;
  }

  const [created] = await db
    .insert(kbDocuments)
    .values({
      orgId,
      brandId: article.brandId,
      sourceId: source.id,
      externalId: article.id,
      title: article.title,
      rawContent,
      contentType: "text/plain",
      metadata,
      status: article.status === "archived" ? "archived" : "active",
    })
    .returning();

  if (!created) throw new Error("kb_document_create_failed");

  await db
    .update(helpArticles)
    .set({ kbDocumentId: created.id, updatedAt: new Date() })
    .where(and(eq(helpArticles.id, articleId), eq(helpArticles.orgId, orgId)));

  return created.id;
}
