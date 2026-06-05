import type { createLibsqlStore } from "@keenai/storage";
import {
  feedbackBoards,
  feedbackComments,
  feedbackPosts,
  feedbackStatuses,
  feedbackVotes,
} from "@keenai/storage/schema";
import { and, desc, eq } from "drizzle-orm";
import { textSimilarity } from "./feedback-dedup.js";

type Db = ReturnType<typeof createLibsqlStore>["db"];

const DEFAULT_STATUSES = [
  { name: "Open", color: "#22c55e", sortOrder: 0 },
  { name: "Planned", color: "#3b82f6", sortOrder: 1 },
  { name: "In progress", color: "#f59e0b", sortOrder: 2 },
  { name: "Done", color: "#71717a", sortOrder: 3 },
] as const;

export type SerializedFeedbackBoard = {
  id: string;
  orgId: string;
  brandId: string;
  slug: string;
  name: string;
  description: string | null;
  public: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SerializedFeedbackPost = {
  id: string;
  boardId: string;
  title: string;
  plainText: string;
  authorId: string | null;
  statusName: string | null;
  upvoteCount: number;
  commentCount: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type SerializedFeedbackComment = {
  id: string;
  postId: string;
  plainText: string;
  authorId: string | null;
  parentId: string | null;
  createdAt: string;
};

function serializeBoard(row: typeof feedbackBoards.$inferSelect): SerializedFeedbackBoard {
  return {
    id: row.id,
    orgId: row.orgId,
    brandId: row.brandId,
    slug: row.slug,
    name: row.name,
    description: row.description ?? null,
    public: row.public ?? true,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function ensureBoardStatuses(db: Db, boardId: string) {
  const existing = await db
    .select()
    .from(feedbackStatuses)
    .where(eq(feedbackStatuses.boardId, boardId));

  if (existing.length > 0) return existing;

  return db
    .insert(feedbackStatuses)
    .values(DEFAULT_STATUSES.map((s) => ({ boardId, ...s })))
    .returning();
}

export async function listFeedbackBoards(db: Db, orgId: string) {
  const rows = await db
    .select()
    .from(feedbackBoards)
    .where(eq(feedbackBoards.orgId, orgId))
    .orderBy(feedbackBoards.name);
  return rows.map(serializeBoard);
}

export async function getFeedbackBoardBySlug(db: Db, orgId: string, slug: string) {
  const [row] = await db
    .select()
    .from(feedbackBoards)
    .where(and(eq(feedbackBoards.orgId, orgId), eq(feedbackBoards.slug, slug)))
    .limit(1);
  return row ? serializeBoard(row) : null;
}

export async function createFeedbackBoard(
  db: Db,
  input: {
    orgId: string;
    brandId: string;
    slug: string;
    name: string;
    description?: string;
  },
) {
  const [row] = await db
    .insert(feedbackBoards)
    .values({
      orgId: input.orgId,
      brandId: input.brandId,
      slug: input.slug,
      name: input.name,
      description: input.description,
    })
    .returning();

  if (!row) throw new Error("board_insert_failed");
  await ensureBoardStatuses(db, row.id);
  return serializeBoard(row);
}

export async function ensureDefaultFeedbackBoard(db: Db, orgId: string, brandId: string) {
  const existing = await getFeedbackBoardBySlug(db, orgId, "ideas");
  if (existing) return existing;
  return createFeedbackBoard(db, {
    orgId,
    brandId,
    slug: "ideas",
    name: "Ideas",
    description: "Share product feedback and vote on ideas.",
  });
}

async function loadPostMeta(
  db: Db,
  row: typeof feedbackPosts.$inferSelect,
): Promise<SerializedFeedbackPost> {
  let statusName: string | null = null;
  if (row.statusId) {
    const [status] = await db
      .select({ name: feedbackStatuses.name })
      .from(feedbackStatuses)
      .where(eq(feedbackStatuses.id, row.statusId))
      .limit(1);
    statusName = status?.name ?? null;
  }

  return {
    id: row.id,
    boardId: row.boardId,
    title: row.title,
    plainText: row.plainText,
    authorId: row.authorId ?? null,
    statusName,
    upvoteCount: row.upvoteCount ?? 0,
    commentCount: row.commentCount ?? 0,
    tags: row.tags ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listFeedbackPosts(db: Db, boardId: string, orgId: string, limit: number) {
  const rows = await db
    .select()
    .from(feedbackPosts)
    .where(and(eq(feedbackPosts.boardId, boardId), eq(feedbackPosts.orgId, orgId)))
    .orderBy(desc(feedbackPosts.upvoteCount), desc(feedbackPosts.createdAt))
    .limit(limit);

  return Promise.all(rows.map((row) => loadPostMeta(db, row)));
}

export async function createFeedbackPost(
  db: Db,
  input: {
    orgId: string;
    boardId: string;
    title: string;
    plainText: string;
    authorId?: string;
    authorMemberId?: string;
    tags?: string[];
  },
) {
  const statuses = await ensureBoardStatuses(db, input.boardId);
  const defaultStatus = statuses.find((s) => s.name === "Open") ?? statuses[0];
  if (!defaultStatus) throw new Error("status_missing");

  const [row] = await db
    .insert(feedbackPosts)
    .values({
      orgId: input.orgId,
      boardId: input.boardId,
      title: input.title,
      plainText: input.plainText,
      authorId: input.authorId ?? null,
      authorMemberId: input.authorMemberId ?? null,
      statusId: defaultStatus.id,
      tags: input.tags ?? [],
    })
    .returning();

  if (!row) throw new Error("post_insert_failed");
  return loadPostMeta(db, row);
}

export async function voteFeedbackPost(
  db: Db,
  input: { postId: string; orgId: string; userId: string; weight?: number },
) {
  const [post] = await db
    .select()
    .from(feedbackPosts)
    .where(and(eq(feedbackPosts.id, input.postId), eq(feedbackPosts.orgId, input.orgId)))
    .limit(1);

  if (!post) return null;

  await db
    .insert(feedbackVotes)
    .values({
      postId: input.postId,
      userId: input.userId,
      weight: input.weight ?? 1,
    })
    .onConflictDoNothing();

  const votes = await db
    .select({ weight: feedbackVotes.weight })
    .from(feedbackVotes)
    .where(eq(feedbackVotes.postId, input.postId));

  const upvoteCount = votes.reduce((sum, v) => sum + (v.weight ?? 1), 0);

  const [updated] = await db
    .update(feedbackPosts)
    .set({ upvoteCount, updatedAt: new Date() })
    .where(eq(feedbackPosts.id, input.postId))
    .returning();

  if (!updated) return null;
  return loadPostMeta(db, updated);
}

export async function addFeedbackComment(
  db: Db,
  input: {
    postId: string;
    orgId: string;
    plainText: string;
    authorId?: string;
    authorMemberId?: string;
    parentId?: string;
  },
) {
  const [post] = await db
    .select()
    .from(feedbackPosts)
    .where(and(eq(feedbackPosts.id, input.postId), eq(feedbackPosts.orgId, input.orgId)))
    .limit(1);

  if (!post) return null;

  const [row] = await db
    .insert(feedbackComments)
    .values({
      postId: input.postId,
      plainText: input.plainText,
      authorId: input.authorId ?? null,
      authorMemberId: input.authorMemberId ?? null,
      parentId: input.parentId ?? null,
    })
    .returning();

  if (!row) throw new Error("comment_insert_failed");

  await db
    .update(feedbackPosts)
    .set({
      commentCount: (post.commentCount ?? 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(feedbackPosts.id, post.id));

  return {
    id: row.id,
    postId: row.postId,
    plainText: row.plainText,
    authorId: row.authorId ?? null,
    parentId: row.parentId ?? null,
    createdAt: row.createdAt.toISOString(),
  } satisfies SerializedFeedbackComment;
}

export async function findSimilarFeedbackPosts(
  db: Db,
  input: { boardId: string; orgId: string; plainText: string; threshold: number },
) {
  const rows = await db
    .select()
    .from(feedbackPosts)
    .where(and(eq(feedbackPosts.boardId, input.boardId), eq(feedbackPosts.orgId, input.orgId)))
    .orderBy(desc(feedbackPosts.createdAt))
    .limit(100);

  const matches = [];
  for (const row of rows) {
    const titleScore = textSimilarity(input.plainText, row.title);
    const bodyScore = textSimilarity(input.plainText, row.plainText);
    const score = Math.max(titleScore, bodyScore);
    if (score >= input.threshold) {
      matches.push({
        post: await loadPostMeta(db, row),
        score: Number(score.toFixed(3)),
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, 5);
}
