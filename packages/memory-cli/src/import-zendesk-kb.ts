import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { KeenaiDb } from "@keenai/storage";
import { brands, kbDocuments, kbSources, organizations } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";

export type ZendeskKbArticle = {
  id: string | number;
  title: string;
  body: string;
  locale?: string;
  url?: string;
  updated_at?: string;
};

export type ZendeskKbExport = {
  articles?: ZendeskKbArticle[];
};

function contentHash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function normalizeArticles(raw: unknown): ZendeskKbArticle[] {
  if (Array.isArray(raw)) return raw as ZendeskKbArticle[];
  if (raw && typeof raw === "object" && Array.isArray((raw as ZendeskKbExport).articles)) {
    return (raw as ZendeskKbExport).articles ?? [];
  }
  throw new Error("zendesk kb json must be an array or { articles: [...] }");
}

export type ImportZendeskKbInput = {
  db: KeenaiDb;
  orgSlug: string;
  brandSlug?: string;
  kbFilePath: string;
  dryRun: boolean;
};

export type ImportZendeskKbResult = {
  orgId: string;
  brandId: string;
  sourceId: string;
  imported: number;
  skipped: number;
};

/** I105: Zendesk Help Center JSON → kb_sources + kb_documents. */
export async function importZendeskKbArticles(
  input: ImportZendeskKbInput,
): Promise<ImportZendeskKbResult> {
  const resolved = path.resolve(input.kbFilePath);
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
        eq(kbSources.name, "Zendesk Import"),
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
        name: "Zendesk Import",
        config: { provider: "zendesk", import: true },
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
    const body = article.body?.trim();
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
        contentType: "text/markdown",
        canonicalLocale: article.locale ?? "en",
        contentHash: hash,
        sourceUpdatedAt: updatedAt,
        indexedAt: null,
        updatedAt: now,
        metadata: { importProvider: "zendesk" },
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
