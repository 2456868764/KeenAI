import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";
import { accounts } from "./core";

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    refreshTokenHash: text("refresh_token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxAccount: index("idx_sessions_account").on(t.accountId),
    idxExpires: index("idx_sessions_expires").on(t.expiresAt),
  }),
);

export const magicLinks = sqliteTable(
  "magic_links",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxEmail: index("idx_magic_links_email").on(t.email),
  }),
);
