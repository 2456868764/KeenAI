import { zValidator } from "@hono/zod-validator";
import {
  API_VERSION,
  createFeedbackBoardSchema,
  createFeedbackCommentSchema,
  createFeedbackPostSchema,
  feedbackDedupQuerySchema,
  feedbackVoteSchema,
  listFeedbackPostsSchema,
} from "@keenai/shared";
import { Hono } from "hono";
import { assertBrandInOrg } from "../lib/conversations.js";
import {
  addFeedbackComment,
  createFeedbackBoard,
  createFeedbackPost,
  ensureDefaultFeedbackBoard,
  findSimilarFeedbackPosts,
  getFeedbackBoardBySlug,
  listFeedbackBoards,
  listFeedbackPosts,
  voteFeedbackPost,
} from "../lib/feedback.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

export function feedbackRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/feedback`;

  r.get(`${prefix}/boards`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const items = await listFeedbackBoards(c.get("store").db, auth.orgId);
    return c.json({ items });
  });

  r.post(
    `${prefix}/boards`,
    requireAuth(),
    zValidator("json", createFeedbackBoardSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      const brand = await assertBrandInOrg(c.get("store").db, body.brandId, auth.orgId);
      if (!brand) return c.json({ error: "brand_not_found" }, 404);

      try {
        const board = await createFeedbackBoard(c.get("store").db, {
          orgId: auth.orgId,
          brandId: body.brandId,
          slug: body.slug,
          name: body.name,
          description: body.description,
        });
        return c.json({ board }, 201);
      } catch {
        return c.json({ error: "slug_conflict" }, 409);
      }
    },
  );

  r.post(`${prefix}/boards/ensure-default`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const brandId = c.req.query("brandId");
    if (!brandId) return c.json({ error: "missing_brand_id" }, 400);

    const brand = await assertBrandInOrg(c.get("store").db, brandId, auth.orgId);
    if (!brand) return c.json({ error: "brand_not_found" }, 404);

    const board = await ensureDefaultFeedbackBoard(c.get("store").db, auth.orgId, brandId);
    return c.json({ board });
  });

  r.get(
    `${prefix}/boards/:slug/posts`,
    requireAuth(),
    zValidator("query", listFeedbackPostsSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const board = await getFeedbackBoardBySlug(
        c.get("store").db,
        auth.orgId,
        c.req.param("slug"),
      );
      if (!board) return c.json({ error: "not_found" }, 404);

      const { limit } = c.req.valid("query");
      const items = await listFeedbackPosts(c.get("store").db, board.id, auth.orgId, limit);
      return c.json({ board, items });
    },
  );

  r.post(
    `${prefix}/boards/:slug/posts`,
    requireAuth(),
    zValidator("json", createFeedbackPostSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const board = await getFeedbackBoardBySlug(
        c.get("store").db,
        auth.orgId,
        c.req.param("slug"),
      );
      if (!board) return c.json({ error: "not_found" }, 404);

      const body = c.req.valid("json");
      const post = await createFeedbackPost(c.get("store").db, {
        orgId: auth.orgId,
        boardId: board.id,
        title: body.title,
        plainText: body.plainText,
        authorId: body.authorId,
        authorMemberId: auth.memberId,
        tags: body.tags,
      });
      return c.json({ post }, 201);
    },
  );

  r.get(
    `${prefix}/boards/:slug/dedup`,
    requireAuth(),
    zValidator("query", feedbackDedupQuerySchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const board = await getFeedbackBoardBySlug(
        c.get("store").db,
        auth.orgId,
        c.req.param("slug"),
      );
      if (!board) return c.json({ error: "not_found" }, 404);

      const query = c.req.valid("query");
      const matches = await findSimilarFeedbackPosts(c.get("store").db, {
        boardId: board.id,
        orgId: auth.orgId,
        plainText: query.plainText,
        threshold: query.threshold,
      });
      return c.json({ matches });
    },
  );

  r.post(
    `${prefix}/posts/:id/vote`,
    requireAuth(),
    zValidator("json", feedbackVoteSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      const post = await voteFeedbackPost(c.get("store").db, {
        postId: c.req.param("id"),
        orgId: auth.orgId,
        userId: body.userId,
        weight: body.weight,
      });
      if (!post) return c.json({ error: "not_found" }, 404);
      return c.json({ post });
    },
  );

  r.post(
    `${prefix}/posts/:id/comments`,
    requireAuth(),
    zValidator("json", createFeedbackCommentSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);

      const body = c.req.valid("json");
      const comment = await addFeedbackComment(c.get("store").db, {
        postId: c.req.param("id"),
        orgId: auth.orgId,
        plainText: body.plainText,
        authorId: body.authorId,
        authorMemberId: auth.memberId,
        parentId: body.parentId,
      });
      if (!comment) return c.json({ error: "not_found" }, 404);
      return c.json({ comment }, 201);
    },
  );

  return r;
}
