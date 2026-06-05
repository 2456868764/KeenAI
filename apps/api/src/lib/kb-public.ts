import type { createLibsqlStore } from "@keenai/storage";
import { helpArticles, helpCollections, kbDocuments } from "@keenai/storage/schema";
import { and, desc, eq } from "drizzle-orm";

type Db = ReturnType<typeof createLibsqlStore>["db"];

type DocMetadata = {
  collection?: string;
  slug?: string;
  public?: boolean;
  excerpt?: string;
};

function readMetadata(raw: Record<string, unknown> | null | undefined): DocMetadata {
  if (!raw || typeof raw !== "object") return {};
  return {
    collection: typeof raw.collection === "string" ? raw.collection : undefined,
    slug: typeof raw.slug === "string" ? raw.slug : undefined,
    public: typeof raw.public === "boolean" ? raw.public : undefined,
    excerpt: typeof raw.excerpt === "string" ? raw.excerpt : undefined,
  };
}

function isPublicDoc(metadata: DocMetadata): boolean {
  return metadata.public !== false;
}

export type PublicKbArticle = {
  id: string;
  title: string;
  slug: string;
  collection: string;
  excerpt: string | null;
  updatedAt: string;
};

export type PublicKbArticleDetail = PublicKbArticle & {
  body: string;
  content: Record<string, unknown>;
  url: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
};

async function usesHelpCenterTables(db: Db, orgId: string, brandId: string) {
  const [row] = await db
    .select({ id: helpArticles.id })
    .from(helpArticles)
    .where(and(eq(helpArticles.orgId, orgId), eq(helpArticles.brandId, brandId)))
    .limit(1);
  return Boolean(row);
}

async function listPublicCollectionsFromHelp(
  db: Db,
  orgId: string,
  brandId: string,
): Promise<{ slug: string; name: string; articleCount: number }[]> {
  const collections = await db
    .select()
    .from(helpCollections)
    .where(
      and(
        eq(helpCollections.orgId, orgId),
        eq(helpCollections.brandId, brandId),
        eq(helpCollections.public, true),
      ),
    )
    .orderBy(helpCollections.sortOrder, helpCollections.name);

  const articles = await db
    .select({
      collectionId: helpArticles.collectionId,
      collectionSlug: helpCollections.slug,
    })
    .from(helpArticles)
    .innerJoin(helpCollections, eq(helpArticles.collectionId, helpCollections.id))
    .where(
      and(
        eq(helpArticles.orgId, orgId),
        eq(helpArticles.brandId, brandId),
        eq(helpArticles.status, "published"),
        eq(helpCollections.public, true),
      ),
    );

  const counts = new Map<string, { slug: string; name: string; articleCount: number }>();
  for (const collection of collections) {
    counts.set(collection.id, {
      slug: collection.slug,
      name: collection.name,
      articleCount: 0,
    });
  }
  for (const article of articles) {
    if (!article.collectionId) continue;
    const entry = counts.get(article.collectionId);
    if (entry) entry.articleCount += 1;
  }

  return [...counts.values()].filter((entry) => entry.articleCount > 0);
}

export async function listPublicKbCollections(db: Db, orgId: string, brandId: string) {
  if (await usesHelpCenterTables(db, orgId, brandId)) {
    return listPublicCollectionsFromHelp(db, orgId, brandId);
  }

  const rows = await db
    .select()
    .from(kbDocuments)
    .where(
      and(
        eq(kbDocuments.orgId, orgId),
        eq(kbDocuments.brandId, brandId),
        eq(kbDocuments.status, "active"),
      ),
    )
    .orderBy(desc(kbDocuments.updatedAt));

  const counts = new Map<string, number>();
  for (const row of rows) {
    const meta = readMetadata(row.metadata as Record<string, unknown>);
    if (!isPublicDoc(meta)) continue;
    const collection = meta.collection ?? "general";
    counts.set(collection, (counts.get(collection) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([slug, articleCount]) => ({ slug, name: slug, articleCount }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

async function listPublicArticlesFromHelp(
  db: Db,
  input: { orgId: string; brandId: string; collection?: string; limit?: number },
) {
  const rows = await db
    .select({
      article: helpArticles,
      collectionSlug: helpCollections.slug,
    })
    .from(helpArticles)
    .innerJoin(helpCollections, eq(helpArticles.collectionId, helpCollections.id))
    .where(
      and(
        eq(helpArticles.orgId, input.orgId),
        eq(helpArticles.brandId, input.brandId),
        eq(helpArticles.status, "published"),
        eq(helpCollections.public, true),
      ),
    )
    .orderBy(desc(helpArticles.updatedAt))
    .limit(input.limit ?? 100);

  const items: PublicKbArticle[] = [];
  for (const row of rows) {
    const collection = row.collectionSlug ?? "general";
    if (input.collection && collection !== input.collection) continue;
    items.push({
      id: row.article.id,
      title: row.article.title,
      slug: row.article.slug,
      collection,
      excerpt: row.article.excerpt ?? row.article.plainText.slice(0, 240) ?? null,
      updatedAt: row.article.updatedAt.toISOString(),
    });
  }
  return items;
}

export async function listPublicKbArticles(
  db: Db,
  input: { orgId: string; brandId: string; collection?: string; limit?: number },
) {
  if (await usesHelpCenterTables(db, input.orgId, input.brandId)) {
    return listPublicArticlesFromHelp(db, input);
  }

  const rows = await db
    .select()
    .from(kbDocuments)
    .where(
      and(
        eq(kbDocuments.orgId, input.orgId),
        eq(kbDocuments.brandId, input.brandId),
        eq(kbDocuments.status, "active"),
      ),
    )
    .orderBy(desc(kbDocuments.updatedAt))
    .limit(input.limit ?? 100);

  const items: PublicKbArticle[] = [];
  for (const row of rows) {
    const meta = readMetadata(row.metadata as Record<string, unknown>);
    if (!isPublicDoc(meta)) continue;
    const collection = meta.collection ?? "general";
    if (input.collection && collection !== input.collection) continue;

    items.push({
      id: row.id,
      title: row.title,
      slug: meta.slug ?? row.id,
      collection,
      excerpt: meta.excerpt ?? row.rawContent?.slice(0, 240) ?? null,
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  return items;
}

async function getPublicArticleFromHelp(
  db: Db,
  input: { orgId: string; brandId: string; articleId: string },
) {
  const [row] = await db
    .select({
      article: helpArticles,
      collectionSlug: helpCollections.slug,
      collectionPublic: helpCollections.public,
    })
    .from(helpArticles)
    .leftJoin(helpCollections, eq(helpArticles.collectionId, helpCollections.id))
    .where(
      and(
        eq(helpArticles.id, input.articleId),
        eq(helpArticles.orgId, input.orgId),
        eq(helpArticles.brandId, input.brandId),
        eq(helpArticles.status, "published"),
      ),
    )
    .limit(1);

  if (!row) return null;
  if (row.collectionPublic === false) return null;

  return {
    id: row.article.id,
    title: row.article.title,
    slug: row.article.slug,
    collection: row.collectionSlug ?? "general",
    excerpt: row.article.excerpt,
    updatedAt: row.article.updatedAt.toISOString(),
    body: row.article.plainText,
    content: (row.article.content as Record<string, unknown>) ?? {},
    url: null,
    seoTitle: row.article.seoTitle,
    seoDescription: row.article.seoDescription,
  } satisfies PublicKbArticleDetail;
}

export async function getPublicKbArticle(
  db: Db,
  input: { orgId: string; brandId: string; articleId: string },
) {
  const fromHelp = await getPublicArticleFromHelp(db, input);
  if (fromHelp) return fromHelp;

  const [row] = await db
    .select()
    .from(kbDocuments)
    .where(
      and(
        eq(kbDocuments.id, input.articleId),
        eq(kbDocuments.orgId, input.orgId),
        eq(kbDocuments.brandId, input.brandId),
        eq(kbDocuments.status, "active"),
      ),
    )
    .limit(1);

  if (!row) return null;
  const meta = readMetadata(row.metadata as Record<string, unknown>);
  if (!isPublicDoc(meta)) return null;

  return {
    id: row.id,
    title: row.title,
    slug: meta.slug ?? row.id,
    collection: meta.collection ?? "general",
    excerpt: meta.excerpt ?? null,
    updatedAt: row.updatedAt.toISOString(),
    body: row.rawContent ?? "",
    content: {},
    url: row.url ?? null,
    seoTitle: null,
    seoDescription: null,
  } satisfies PublicKbArticleDetail;
}
