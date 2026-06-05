import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { KeenaiDb } from "@keenai/storage";
import { brands, kbDocuments, kbSources, organizations } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";

export type IntercomKbArticle = {
  id: string | number;
  title?: string;
  body?: string;
  description?: string;
  locale?: string;
  url?: string;
  updated_at?: string;
};

export type IntercomKbExport = {
  type?: string;
  data?: IntercomKbArticle[];
  articles?: IntercomKbArticle[];
};

function contentHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function articleBody(article: IntercomKbArticle): string {
  return (article.body ?? article.description ?? "").trim();
}

function normalizeArticles(raw: unknown): IntercomKbArticle[] {
  if (Array.isArray(raw)) return raw as IntercomKbArticle[];
  if (raw && typeof raw === "object") {
    const obj = raw as IntercomKbExport;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.articles)) return obj.articles;
  }
  throw new Error(
    "intercom articles json must be an array or { data: [...] } / { articles: [...] }",
  );
}

export type ImportIntercomKbInput = {
  db: KeenaiDb;
  orgSlug: string;
  brandSlug?: string;
  articlesFilePath: string;
  dryRun: boolean;
};

export type ImportIntercomKbResult = {
  orgId: string;
  brandId: string;
  sourceId: string;
  imported: number;
  skipped: number;
};

/** I113: Intercom Help Center JSON → kb_sources + kb_documents. */
export async function importIntercomKbArticles(
  input: ImportIntercomKbInput,
): Promise<ImportIntercomKbResult> {
  const resolved = path.resolve(input.articlesFilePath);
  const text = await readFile(resolved, "utf8");
  const articles = normalizeArticles(JSON.parse(text) as unknown);

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

  let sourceId: string;
  const [existingSource] = await input.db
    .select({ id: kbSources.id })
    .from(kbSources)
    .where(
      and(
        eq(kbSources.orgId, org.id),
        eq(kbSources.brandId, brand.id),
        eq(kbSources.type, "help_center"),
        eq(kbSources.name, "Intercom Import"),
      ),
    )
    .limit(1);

  if (existingSource) {
    sourceId = existingSource.id;
  } else if (input.dryRun) {
    sourceId = "dry-run-source";
  } else {
    const [created] = await input.db
      .insert(kbSources)
      .values({
        orgId: org.id,
        brandId: brand.id,
        type: "help_center",
        name: "Intercom Import",
        config: { provider: "intercom", import: true },
      })
      .returning({ id: kbSources.id });
    if (!created) throw new Error("kb_source_create_failed");
    sourceId = created.id;
  }

  let imported = 0;
  let skipped = 0;
  const now = new Date();

  for (const article of articles) {
    const title = article.title?.trim();
    const body = articleBody(article);
    if (!title || !body) {
      skipped += 1;
      continue;
    }
    const externalId = String(article.id);
    const hash = contentHash(body);
    const updatedAt = article.updated_at ? new Date(article.updated_at) : now;

    if (input.dryRun) {
      imported += 1;
      continue;
    }

    await input.db
      .insert(kbDocuments)
      .values({
        orgId: org.id,
        brandId: brand.id,
        sourceId,
        externalId,
        title,
        url: article.url ?? null,
        rawContent: body,
        contentType: "text/html",
        canonicalLocale: article.locale ?? "en",
        contentHash: hash,
        sourceUpdatedAt: updatedAt,
        indexedAt: null,
        updatedAt: now,
        metadata: { importProvider: "intercom" },
      })
      .onConflictDoUpdate({
        target: [kbDocuments.sourceId, kbDocuments.externalId],
        set: {
          title,
          url: article.url ?? null,
          rawContent: body,
          contentHash: hash,
          sourceUpdatedAt: updatedAt,
          updatedAt: now,
        },
      });
    imported += 1;
  }

  return { orgId: org.id, brandId: brand.id, sourceId, imported, skipped };
}
