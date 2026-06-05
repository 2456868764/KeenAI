import type { createLibsqlStore } from "@keenai/storage";
import { kbDocuments } from "@keenai/storage/schema";
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
  url: string | null;
};

export async function listPublicKbCollections(db: Db, orgId: string, brandId: string) {
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

export async function listPublicKbArticles(
  db: Db,
  input: { orgId: string; brandId: string; collection?: string; limit?: number },
) {
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

export async function getPublicKbArticle(
  db: Db,
  input: { orgId: string; brandId: string; articleId: string },
) {
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
    url: row.url ?? null,
  } satisfies PublicKbArticleDetail;
}
