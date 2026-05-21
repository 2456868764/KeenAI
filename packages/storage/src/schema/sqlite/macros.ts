import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";
import { organizations } from "./core";

export const macros = sqliteTable(
  "macros",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    body: text("body").notNull(),
    isBuiltin: integer("is_builtin", { mode: "boolean" }).notNull().default(false),
    ...sqliteTimestamps,
  },
  (t) => ({
    uniqOrgSlug: uniqueIndex("uniq_macros_org_slug").on(t.orgId, t.slug),
    idxOrg: index("idx_macros_org").on(t.orgId),
  }),
);
