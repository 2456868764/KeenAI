import type { createLibsqlStore } from "@keenai/storage";
import {
  DEFAULT_ROADMAP_COLUMNS,
  type RoadmapColumnDef,
  type RoadmapItemRow,
  type RoadmapRow,
  roadmapItems,
  roadmaps,
} from "@keenai/storage/schema";
import { and, asc, desc, eq, max } from "drizzle-orm";

type Db = ReturnType<typeof createLibsqlStore>["db"];

export type SerializedRoadmap = {
  id: string;
  orgId: string;
  brandId: string;
  slug: string;
  name: string;
  public: boolean;
  columns: RoadmapColumnDef[];
  createdAt: string;
  updatedAt: string;
};

export type SerializedRoadmapItem = {
  id: string;
  roadmapId: string;
  title: string;
  description: string | null;
  columnId: string;
  sortOrder: number;
  linkedPostId: string | null;
  eta: string | null;
  createdAt: string;
  updatedAt: string;
};

function serializeRoadmap(row: RoadmapRow): SerializedRoadmap {
  return {
    id: row.id,
    orgId: row.orgId,
    brandId: row.brandId,
    slug: row.slug,
    name: row.name,
    public: row.public,
    columns: row.columns ?? DEFAULT_ROADMAP_COLUMNS,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeRoadmapItem(row: RoadmapItemRow): SerializedRoadmapItem {
  return {
    id: row.id,
    roadmapId: row.roadmapId,
    title: row.title,
    description: row.description ?? null,
    columnId: row.columnId,
    sortOrder: row.sortOrder,
    linkedPostId: row.linkedPostId ?? null,
    eta: row.eta?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listRoadmaps(
  db: Db,
  orgId: string,
  brandId?: string,
): Promise<SerializedRoadmap[]> {
  const filters = [eq(roadmaps.orgId, orgId)];
  if (brandId) filters.push(eq(roadmaps.brandId, brandId));

  const rows = await db
    .select()
    .from(roadmaps)
    .where(and(...filters))
    .orderBy(desc(roadmaps.updatedAt));

  return rows.map(serializeRoadmap);
}

export async function getRoadmapById(
  db: Db,
  orgId: string,
  roadmapId: string,
): Promise<SerializedRoadmap | null> {
  const [row] = await db
    .select()
    .from(roadmaps)
    .where(and(eq(roadmaps.id, roadmapId), eq(roadmaps.orgId, orgId)))
    .limit(1);
  return row ? serializeRoadmap(row) : null;
}

export async function getRoadmapBySlug(
  db: Db,
  orgId: string,
  slug: string,
): Promise<SerializedRoadmap | null> {
  const [row] = await db
    .select()
    .from(roadmaps)
    .where(and(eq(roadmaps.orgId, orgId), eq(roadmaps.slug, slug)))
    .limit(1);
  return row ? serializeRoadmap(row) : null;
}

export async function createRoadmap(
  db: Db,
  input: {
    orgId: string;
    brandId: string;
    slug: string;
    name: string;
    public?: boolean;
    columns?: RoadmapColumnDef[];
  },
): Promise<SerializedRoadmap> {
  const [row] = await db
    .insert(roadmaps)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      slug: input.slug,
      name: input.name,
      public: input.public ?? true,
      columns: input.columns ?? DEFAULT_ROADMAP_COLUMNS,
    })
    .returning();
  if (!row) throw new Error("roadmap_create_failed");
  return serializeRoadmap(row);
}

export async function ensureDefaultRoadmap(
  db: Db,
  orgId: string,
  brandId: string,
): Promise<SerializedRoadmap> {
  const existing = await getRoadmapBySlug(db, orgId, "product");
  if (existing) return existing;
  return createRoadmap(db, {
    orgId,
    brandId,
    slug: "product",
    name: "Product Roadmap",
  });
}

export async function listRoadmapItems(
  db: Db,
  roadmapId: string,
  orgId: string,
): Promise<SerializedRoadmapItem[]> {
  const rows = await db
    .select()
    .from(roadmapItems)
    .where(and(eq(roadmapItems.roadmapId, roadmapId), eq(roadmapItems.orgId, orgId)))
    .orderBy(asc(roadmapItems.columnId), asc(roadmapItems.sortOrder), desc(roadmapItems.createdAt));

  return rows.map(serializeRoadmapItem);
}

export async function createRoadmapItem(
  db: Db,
  input: {
    orgId: string;
    roadmapId: string;
    title: string;
    description?: string;
    columnId?: string;
    sortOrder?: number;
    linkedPostId?: string;
    eta?: Date;
  },
): Promise<SerializedRoadmapItem> {
  let sortOrder = input.sortOrder;
  if (sortOrder === undefined) {
    const columnId = input.columnId ?? "planned";
    const [agg] = await db
      .select({ maxOrder: max(roadmapItems.sortOrder) })
      .from(roadmapItems)
      .where(and(eq(roadmapItems.roadmapId, input.roadmapId), eq(roadmapItems.columnId, columnId)));
    sortOrder = (agg?.maxOrder ?? -1) + 1;
  }

  const [row] = await db
    .insert(roadmapItems)
    .values({
      orgId: input.orgId,
      roadmapId: input.roadmapId,
      title: input.title,
      description: input.description,
      columnId: input.columnId ?? "planned",
      sortOrder,
      linkedPostId: input.linkedPostId,
      eta: input.eta,
    })
    .returning();

  if (!row) throw new Error("roadmap_item_create_failed");
  return serializeRoadmapItem(row);
}

export async function updateRoadmapItem(
  db: Db,
  input: {
    orgId: string;
    itemId: string;
    title?: string;
    description?: string | null;
    columnId?: string;
    sortOrder?: number;
    linkedPostId?: string | null;
    eta?: Date | null;
  },
): Promise<SerializedRoadmapItem | null> {
  const [existing] = await db
    .select()
    .from(roadmapItems)
    .where(and(eq(roadmapItems.id, input.itemId), eq(roadmapItems.orgId, input.orgId)))
    .limit(1);
  if (!existing) return null;

  const [row] = await db
    .update(roadmapItems)
    .set({
      title: input.title ?? existing.title,
      description: input.description === undefined ? existing.description : input.description,
      columnId: input.columnId ?? existing.columnId,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      linkedPostId: input.linkedPostId === undefined ? existing.linkedPostId : input.linkedPostId,
      eta: input.eta === undefined ? existing.eta : input.eta,
      updatedAt: new Date(),
    })
    .where(eq(roadmapItems.id, existing.id))
    .returning();

  return row ? serializeRoadmapItem(row) : null;
}

export async function deleteRoadmapItem(db: Db, orgId: string, itemId: string): Promise<boolean> {
  const deleted = await db
    .delete(roadmapItems)
    .where(and(eq(roadmapItems.id, itemId), eq(roadmapItems.orgId, orgId)))
    .returning({ id: roadmapItems.id });
  return deleted.length > 0;
}

export function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes("unique") || message.includes("constraint");
}
