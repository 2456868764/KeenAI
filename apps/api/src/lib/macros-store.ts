import { macros } from "@keenai/storage/schema";
import { and, asc, eq } from "drizzle-orm";
import type { createLibsqlStore } from "@keenai/storage";
import { BUILTIN_MACROS, type Macro } from "./macros.js";

type Db = ReturnType<typeof createLibsqlStore>["db"];

export async function ensureBuiltinMacros(db: Db, orgId: string): Promise<void> {
  for (const macro of BUILTIN_MACROS) {
    const [existing] = await db
      .select({ id: macros.id })
      .from(macros)
      .where(and(eq(macros.orgId, orgId), eq(macros.slug, macro.slug)))
      .limit(1);
    if (existing) continue;
    await db.insert(macros).values({
      orgId,
      slug: macro.slug,
      name: macro.name,
      body: macro.body,
      isBuiltin: true,
    });
  }
}

export async function listOrgMacros(db: Db, orgId: string): Promise<Macro[]> {
  await ensureBuiltinMacros(db, orgId);
  const rows = await db
    .select({
      slug: macros.slug,
      name: macros.name,
      body: macros.body,
    })
    .from(macros)
    .where(eq(macros.orgId, orgId))
    .orderBy(asc(macros.slug));
  return rows;
}

export async function createOrgMacro(
  db: Db,
  orgId: string,
  input: { slug: string; name: string; body: string },
): Promise<Macro> {
  const [existing] = await db
    .select({ id: macros.id })
    .from(macros)
    .where(and(eq(macros.orgId, orgId), eq(macros.slug, input.slug)))
    .limit(1);
  if (existing) throw new Error("macro_exists");

  await db.insert(macros).values({
    orgId,
    slug: input.slug,
    name: input.name,
    body: input.body,
    isBuiltin: false,
  });

  return { slug: input.slug, name: input.name, body: input.body };
}
