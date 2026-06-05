import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sqliteTimestamps } from "../_shared/timestamps";
import { newUlid } from "../_shared/ulid";
import { brands, organizations } from "./core";

export const feedbackBoards = sqliteTable(
  "feedback_boards",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    brandId: text("brand_id")
      .notNull()
      .references(() => brands.id),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    public: integer("public", { mode: "boolean" }).notNull().default(true),
    ...sqliteTimestamps,
  },
  (t) => ({
    uqSlug: uniqueIndex("uq_feedback_boards_org_slug").on(t.orgId, t.slug),
    idxOrg: index("idx_feedback_boards_org").on(t.orgId),
  }),
);

export const feedbackStatuses = sqliteTable(
  "feedback_statuses",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    boardId: text("board_id")
      .notNull()
      .references(() => feedbackBoards.id),
    name: text("name").notNull(),
    color: text("color"),
    public: integer("public", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").default(0),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxBoard: index("idx_feedback_statuses_board").on(t.boardId, t.sortOrder),
  }),
);

export const feedbackPosts = sqliteTable(
  "feedback_posts",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    orgId: text("org_id")
      .notNull()
      .references(() => organizations.id),
    boardId: text("board_id")
      .notNull()
      .references(() => feedbackBoards.id),
    title: text("title").notNull(),
    plainText: text("plain_text").notNull(),
    authorId: text("author_id"),
    authorMemberId: text("author_member_id"),
    statusId: text("status_id").references(() => feedbackStatuses.id),
    upvoteCount: integer("upvote_count").notNull().default(0),
    commentCount: integer("comment_count").notNull().default(0),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull().default([]),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxBoard: index("idx_feedback_posts_board").on(t.boardId, t.upvoteCount),
  }),
);

export const feedbackVotes = sqliteTable(
  "feedback_votes",
  {
    postId: text("post_id")
      .notNull()
      .references(() => feedbackPosts.id),
    userId: text("user_id").notNull(),
    weight: integer("weight").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.postId, t.userId] }),
  }),
);

export const feedbackComments = sqliteTable(
  "feedback_comments",
  {
    id: text("id").primaryKey().$defaultFn(newUlid),
    postId: text("post_id")
      .notNull()
      .references(() => feedbackPosts.id),
    authorId: text("author_id"),
    authorMemberId: text("author_member_id"),
    plainText: text("plain_text").notNull(),
    parentId: text("parent_id"),
    ...sqliteTimestamps,
  },
  (t) => ({
    idxPost: index("idx_feedback_comments_post").on(t.postId, t.createdAt),
  }),
);
