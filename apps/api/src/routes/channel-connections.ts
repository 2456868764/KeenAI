import { randomBytes } from "node:crypto";
import { zValidator } from "@hono/zod-validator";
import { CHANNEL_TYPES, type ChannelType } from "@keenai/channels-core";
import { DASHBOARD_API_PREFIX } from "@keenai/shared";
import {
  auditLogs,
  brands,
  channelConnections,
  channelOAuthStates,
  members,
  organizations,
} from "@keenai/storage/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { validateChannelConnection } from "../lib/channel-connection-validator.js";
import { disconnectChannelProvider } from "../lib/channel-disconnect.js";
import { getChannelProviderAppState } from "../lib/channel-provider-app-state.js";
import { getWeComSuiteAccessToken } from "../lib/channel-provider-tokens.js";
import {
  channelCredentialKeys,
  openChannelCredentials,
  sealChannelCredentials,
} from "../lib/channel-secrets.js";
import { canAccessBrand } from "../lib/conversations.js";
import {
  completeDingTalkAdminConsent,
  createDingTalkOAuthState,
  dingtalkOAuthAuthorizeUrl,
  dingtalkOAuthStateHash,
  parseDingTalkOAuthState,
} from "../lib/dingtalk-oauth.js";
import {
  discordOAuthAuthorizeUrl,
  discordOAuthStateHash,
  exchangeDiscordAuthorizationCode,
} from "../lib/discord-oauth.js";
import {
  createEmailOAuthState,
  emailOAuthAuthorizeUrl,
  emailOAuthConnectionSettings,
  emailOAuthStateHash,
  exchangeEmailAuthorizationCode,
  parseEmailOAuthState,
} from "../lib/email-oauth.js";
import {
  exchangeFeishuAuthorizationCode,
  feishuOAuthAuthorizeUrl,
  feishuOAuthStateHash,
} from "../lib/feishu-oauth.js";
import {
  exchangeSlackAuthorizationCode,
  loadChannelCredentials,
  slackOAuthAuthorizeUrl,
  slackOAuthStateHash,
} from "../lib/slack-oauth.js";
import { buildTelegramWebhookUrl, reconcileTelegramTransport } from "../lib/telegram-webhook.js";
import {
  exchangeWeComAuthorizationCode,
  wecomOAuthAuthorizeUrl,
  wecomOAuthStateHash,
} from "../lib/wecom-oauth.js";
import {
  installWhatsAppSignup,
  whatsappOAuthStateHash,
  whatsappSignupConfig,
} from "../lib/whatsapp-oauth.js";
import {
  WhatsAppTemplateProviderError,
  createWhatsAppTemplate,
  deleteWhatsAppTemplate,
  listWhatsAppTemplates,
  updateWhatsAppTemplate,
  whatsappTemplateCredentials,
} from "../lib/whatsapp-templates.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

const channelTypeSchema = z.enum(CHANNEL_TYPES);
const upsertConnectionSchema = z.object({
  brandId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  externalAccountId: z.string().trim().min(1).max(255).default("default"),
  status: z.enum(["pending", "active", "disabled", "error"]).default("pending"),
  transport: z.enum(["webhook", "gateway", "polling", "stream"]).default("webhook"),
  credentials: z.record(z.string(), z.unknown()).optional(),
  settings: z.record(z.string(), z.unknown()).default({}),
});
const whatsappTemplateNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .regex(/^[a-z0-9_]+$/);
const whatsappTemplateLanguageSchema = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .regex(/^[A-Za-z0-9_-]+$/);
const whatsappTemplateComponentsSchema = z.array(z.record(z.string(), z.unknown())).min(1).max(20);
const whatsappTemplateSchema = z.object({
  name: whatsappTemplateNameSchema,
  language: whatsappTemplateLanguageSchema,
  category: z.enum(["AUTHENTICATION", "MARKETING", "UTILITY"]),
  components: whatsappTemplateComponentsSchema,
  allowCategoryChange: z.boolean().optional(),
});
const whatsappTemplatePatchSchema = whatsappTemplateSchema
  .omit({ allowCategoryChange: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "At least one field is required");

export function channelConnectionRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `${DASHBOARD_API_PREFIX}/channel-connections`;

  r.get(prefix, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const brandId = c.req.query("brandId");
    if (brandId && !canAccessBrand(auth, brandId)) return c.json({ error: "forbidden" }, 403);
    const filters = [eq(channelConnections.orgId, auth.orgId)];
    if (brandId) filters.push(eq(channelConnections.brandId, brandId));
    const rows = await c
      .get("store")
      .db.select()
      .from(channelConnections)
      .where(and(...filters));
    return c.json({
      items: rows.map((row) => serializeConnection(row, c.get("authConfig").jwtSecret)),
    });
  });

  r.post(
    `${prefix}/slack/oauth/start`,
    requireAuth(),
    zValidator("json", z.object({ brandId: z.string().min(1) })),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const { brandId } = c.req.valid("json");
      if (!canAccessBrand(auth, brandId)) return c.json({ error: "forbidden" }, 403);
      const env = c.get("env");
      if (
        !env.SLACK_OAUTH_REDIRECT_URI ||
        new URL(env.SLACK_OAUTH_REDIRECT_URI).pathname !== `${prefix}/slack/oauth/callback`
      ) {
        return c.json({ error: "slack_oauth_redirect_uri_invalid" }, 503);
      }
      const state = randomBytes(32).toString("base64url");
      let authorizeUrl: string;
      try {
        authorizeUrl = slackOAuthAuthorizeUrl(env, state);
      } catch {
        return c.json({ error: "slack_oauth_not_configured" }, 503);
      }
      const now = new Date();
      await c
        .get("store")
        .db.insert(channelOAuthStates)
        .values({
          stateHash: slackOAuthStateHash(state),
          provider: "slack",
          orgId: auth.orgId,
          brandId,
          actorId: auth.sub,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 10 * 60_000),
        });
      return c.json({ authorizeUrl });
    },
  );

  r.get(`${prefix}/slack/oauth/callback`, async (c) => {
    const state = c.req.query("state");
    if (!state || state.length > 256) return c.json({ error: "slack_oauth_state_invalid" }, 400);
    const now = new Date();
    const [oauthState] = await c
      .get("store")
      .db.update(channelOAuthStates)
      .set({ consumedAt: now })
      .where(
        and(
          eq(channelOAuthStates.stateHash, slackOAuthStateHash(state)),
          eq(channelOAuthStates.provider, "slack"),
          isNull(channelOAuthStates.consumedAt),
          gt(channelOAuthStates.expiresAt, now),
        ),
      )
      .returning();
    if (!oauthState) return c.json({ error: "slack_oauth_state_invalid" }, 400);

    const [membership] = await c
      .get("store")
      .db.select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.orgId, oauthState.orgId),
          eq(members.accountId, oauthState.actorId),
          eq(members.status, "active"),
        ),
      )
      .limit(1);
    const [brand] = await c
      .get("store")
      .db.select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.id, oauthState.brandId), eq(brands.orgId, oauthState.orgId)))
      .limit(1);
    if (!membership || !brand) return c.json({ error: "slack_oauth_access_revoked" }, 403);

    const destination = new URL("/dashboard/settings/integrations", c.get("env").APP_URL);
    if (c.req.query("error")) {
      destination.searchParams.set("slack", "denied");
      return c.redirect(destination.toString(), 303);
    }
    const code = c.req.query("code");
    if (!code) return c.json({ error: "slack_oauth_code_missing" }, 400);
    try {
      const installation = await exchangeSlackAuthorizationCode(c.get("env"), code);
      const db = c.get("store").db;
      const filter = and(
        eq(channelConnections.orgId, oauthState.orgId),
        eq(channelConnections.brandId, oauthState.brandId),
        eq(channelConnections.channelType, "slack"),
        eq(channelConnections.externalAccountId, installation.accountId),
      );
      const [existing] = await db.select().from(channelConnections).where(filter).limit(1);
      const prior = existing
        ? openChannelCredentials(existing.credentials, c.get("authConfig").jwtSecret)
        : {};
      const { refreshToken: _oldRefresh, expiresAt: _oldExpiry, ...priorStable } = prior;
      const credentials = sealChannelCredentials(
        { ...priorStable, ...installation.credentials },
        c.get("authConfig").jwtSecret,
      );
      const [connection] = await db
        .insert(channelConnections)
        .values({
          orgId: oauthState.orgId,
          brandId: oauthState.brandId,
          channelType: "slack",
          externalAccountId: installation.accountId,
          name: installation.name,
          status: "active",
          transport: existing?.transport ?? "webhook",
          credentials,
          settings: { ...(existing?.settings ?? {}), ...installation.settings },
          lastConnectedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            channelConnections.orgId,
            channelConnections.brandId,
            channelConnections.channelType,
            channelConnections.externalAccountId,
          ],
          set: {
            name: installation.name,
            status: "active",
            credentials,
            settings: { ...(existing?.settings ?? {}), ...installation.settings },
            lastError: null,
            lastConnectedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning({ id: channelConnections.id });
      if (!connection) throw new Error("slack_oauth_connection_save_failed");
      await writeConnectionAudit(c, oauthState.actorId, {
        orgId: oauthState.orgId,
        action: "channel.connection.oauth_installed",
        connectionId: connection.id,
        changes: { channelType: "slack", externalAccountId: installation.accountId },
      });
      destination.searchParams.set("slack", "connected");
    } catch (error) {
      c.get("log").error({ err: error }, "Slack OAuth installation failed");
      destination.searchParams.set("slack", "failed");
    }
    return c.redirect(destination.toString(), 303);
  });

  r.post(
    `${prefix}/discord/oauth/start`,
    requireAuth(),
    zValidator("json", z.object({ brandId: z.string().min(1) })),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const { brandId } = c.req.valid("json");
      if (!canAccessBrand(auth, brandId)) return c.json({ error: "forbidden" }, 403);
      const env = c.get("env");
      if (
        !env.DISCORD_OAUTH_REDIRECT_URI ||
        new URL(env.DISCORD_OAUTH_REDIRECT_URI).pathname !== `${prefix}/discord/oauth/callback`
      ) {
        return c.json({ error: "discord_oauth_redirect_uri_invalid" }, 503);
      }
      const state = randomBytes(32).toString("base64url");
      let authorizeUrl: string;
      try {
        authorizeUrl = discordOAuthAuthorizeUrl(env, state);
      } catch {
        return c.json({ error: "discord_oauth_not_configured" }, 503);
      }
      const now = new Date();
      await c
        .get("store")
        .db.insert(channelOAuthStates)
        .values({
          stateHash: discordOAuthStateHash(state),
          provider: "discord",
          orgId: auth.orgId,
          brandId,
          actorId: auth.sub,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 10 * 60_000),
        });
      return c.json({ authorizeUrl });
    },
  );

  r.get(`${prefix}/discord/oauth/callback`, async (c) => {
    const state = c.req.query("state");
    if (!state || state.length > 256) return c.json({ error: "discord_oauth_state_invalid" }, 400);
    const now = new Date();
    const [oauthState] = await c
      .get("store")
      .db.update(channelOAuthStates)
      .set({ consumedAt: now })
      .where(
        and(
          eq(channelOAuthStates.stateHash, discordOAuthStateHash(state)),
          eq(channelOAuthStates.provider, "discord"),
          isNull(channelOAuthStates.consumedAt),
          gt(channelOAuthStates.expiresAt, now),
        ),
      )
      .returning();
    if (!oauthState) return c.json({ error: "discord_oauth_state_invalid" }, 400);
    const [membership] = await c
      .get("store")
      .db.select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.orgId, oauthState.orgId),
          eq(members.accountId, oauthState.actorId),
          eq(members.status, "active"),
        ),
      )
      .limit(1);
    const [brand] = await c
      .get("store")
      .db.select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.id, oauthState.brandId), eq(brands.orgId, oauthState.orgId)))
      .limit(1);
    if (!membership || !brand) return c.json({ error: "discord_oauth_access_revoked" }, 403);

    const destination = new URL("/dashboard/settings/integrations", c.get("env").APP_URL);
    if (c.req.query("error")) {
      destination.searchParams.set("discord", "denied");
      return c.redirect(destination.toString(), 303);
    }
    const code = c.req.query("code");
    if (!code) return c.json({ error: "discord_oauth_code_missing" }, 400);
    try {
      const installation = await exchangeDiscordAuthorizationCode(c.get("env"), code);
      const db = c.get("store").db;
      const filter = and(
        eq(channelConnections.orgId, oauthState.orgId),
        eq(channelConnections.brandId, oauthState.brandId),
        eq(channelConnections.channelType, "discord"),
        eq(channelConnections.externalAccountId, installation.accountId),
      );
      const [existing] = await db.select().from(channelConnections).where(filter).limit(1);
      const prior = existing
        ? openChannelCredentials(existing.credentials, c.get("authConfig").jwtSecret)
        : {};
      const {
        oauthAccessToken: _oldAccess,
        oauthRefreshToken: _oldRefresh,
        oauthExpiresAt: _oldExpiry,
        ...priorStable
      } = prior;
      const credentials = sealChannelCredentials(
        { ...priorStable, ...installation.credentials },
        c.get("authConfig").jwtSecret,
      );
      const [connection] = await db
        .insert(channelConnections)
        .values({
          orgId: oauthState.orgId,
          brandId: oauthState.brandId,
          channelType: "discord",
          externalAccountId: installation.accountId,
          name: installation.name,
          status: "active",
          transport: "gateway",
          credentials,
          settings: { ...(existing?.settings ?? {}), ...installation.settings },
          lastConnectedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            channelConnections.orgId,
            channelConnections.brandId,
            channelConnections.channelType,
            channelConnections.externalAccountId,
          ],
          set: {
            name: installation.name,
            status: "active",
            transport: "gateway",
            credentials,
            settings: { ...(existing?.settings ?? {}), ...installation.settings },
            lastError: null,
            lastConnectedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning({ id: channelConnections.id });
      if (!connection) throw new Error("discord_oauth_connection_save_failed");
      await writeConnectionAudit(c, oauthState.actorId, {
        orgId: oauthState.orgId,
        action: "channel.connection.oauth_installed",
        connectionId: connection.id,
        changes: { channelType: "discord", externalAccountId: installation.accountId },
      });
      destination.searchParams.set("discord", "connected");
    } catch (error) {
      c.get("log").error({ err: error }, "Discord OAuth installation failed");
      destination.searchParams.set("discord", "failed");
    }
    return c.redirect(destination.toString(), 303);
  });

  r.post(
    `${prefix}/feishu/oauth/start`,
    requireAuth(),
    zValidator("json", z.object({ brandId: z.string().min(1) })),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const { brandId } = c.req.valid("json");
      if (!canAccessBrand(auth, brandId)) return c.json({ error: "forbidden" }, 403);
      const env = c.get("env");
      if (
        !env.FEISHU_ISV_OAUTH_REDIRECT_URI ||
        new URL(env.FEISHU_ISV_OAUTH_REDIRECT_URI).pathname !== `${prefix}/feishu/oauth/callback`
      ) {
        return c.json({ error: "feishu_oauth_redirect_uri_invalid" }, 503);
      }
      const state = randomBytes(32).toString("base64url");
      let authorizeUrl: string;
      try {
        authorizeUrl = feishuOAuthAuthorizeUrl(env, state);
      } catch {
        return c.json({ error: "feishu_oauth_not_configured" }, 503);
      }
      const now = new Date();
      await c
        .get("store")
        .db.insert(channelOAuthStates)
        .values({
          stateHash: feishuOAuthStateHash(state),
          provider: "feishu",
          orgId: auth.orgId,
          brandId,
          actorId: auth.sub,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 10 * 60_000),
        });
      return c.json({ authorizeUrl });
    },
  );

  r.get(`${prefix}/feishu/oauth/callback`, async (c) => {
    const state = c.req.query("state");
    if (!state || state.length > 256) return c.json({ error: "feishu_oauth_state_invalid" }, 400);
    const now = new Date();
    const [oauthState] = await c
      .get("store")
      .db.update(channelOAuthStates)
      .set({ consumedAt: now })
      .where(
        and(
          eq(channelOAuthStates.stateHash, feishuOAuthStateHash(state)),
          eq(channelOAuthStates.provider, "feishu"),
          isNull(channelOAuthStates.consumedAt),
          gt(channelOAuthStates.expiresAt, now),
        ),
      )
      .returning();
    if (!oauthState) return c.json({ error: "feishu_oauth_state_invalid" }, 400);
    const [membership] = await c
      .get("store")
      .db.select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.orgId, oauthState.orgId),
          eq(members.accountId, oauthState.actorId),
          eq(members.status, "active"),
        ),
      )
      .limit(1);
    const [brand] = await c
      .get("store")
      .db.select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.id, oauthState.brandId), eq(brands.orgId, oauthState.orgId)))
      .limit(1);
    if (!membership || !brand) return c.json({ error: "feishu_oauth_access_revoked" }, 403);

    const destination = new URL("/dashboard/settings/integrations", c.get("env").APP_URL);
    if (c.req.query("error")) {
      destination.searchParams.set("feishu", "denied");
      return c.redirect(destination.toString(), 303);
    }
    const code = c.req.query("code");
    if (!code) return c.json({ error: "feishu_oauth_code_missing" }, 400);
    try {
      const env = c.get("env");
      const appId = env.FEISHU_ISV_APP_ID;
      if (!appId) throw new Error("feishu_oauth_not_configured");
      const ticketState = await getChannelProviderAppState({
        store: c.get("store"),
        provider: "feishu",
        appId,
        stateType: "app_ticket",
        secret: c.get("authConfig").jwtSecret,
      });
      const appTicket =
        typeof ticketState?.appTicket === "string" ? ticketState.appTicket.trim() : "";
      if (!appTicket) throw new Error("feishu_isv_app_ticket_missing");
      const installation = await exchangeFeishuAuthorizationCode(env, code, appTicket);
      const db = c.get("store").db;
      const filter = and(
        eq(channelConnections.orgId, oauthState.orgId),
        eq(channelConnections.brandId, oauthState.brandId),
        eq(channelConnections.channelType, "feishu"),
        eq(channelConnections.externalAccountId, installation.accountId),
      );
      const [existing] = await db.select().from(channelConnections).where(filter).limit(1);
      const credentials = sealChannelCredentials(
        installation.credentials,
        c.get("authConfig").jwtSecret,
      );
      const [connection] = await db
        .insert(channelConnections)
        .values({
          orgId: oauthState.orgId,
          brandId: oauthState.brandId,
          channelType: "feishu",
          externalAccountId: installation.accountId,
          name: installation.name,
          status: "active",
          transport: "webhook",
          credentials,
          settings: { ...(existing?.settings ?? {}), ...installation.settings },
          lastConnectedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            channelConnections.orgId,
            channelConnections.brandId,
            channelConnections.channelType,
            channelConnections.externalAccountId,
          ],
          set: {
            name: installation.name,
            status: "active",
            transport: "webhook",
            credentials,
            settings: { ...(existing?.settings ?? {}), ...installation.settings },
            lastError: null,
            lastConnectedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning({ id: channelConnections.id });
      if (!connection) throw new Error("feishu_oauth_connection_save_failed");
      await writeConnectionAudit(c, oauthState.actorId, {
        orgId: oauthState.orgId,
        action: "channel.connection.oauth_installed",
        connectionId: connection.id,
        changes: { channelType: "feishu", externalAccountId: installation.accountId },
      });
      destination.searchParams.set("feishu", "connected");
    } catch (error) {
      c.get("log").error({ err: error }, "Feishu OAuth installation failed");
      destination.searchParams.set("feishu", "failed");
    }
    return c.redirect(destination.toString(), 303);
  });

  r.post(
    `${prefix}/dingtalk/oauth/start`,
    requireAuth(),
    zValidator(
      "json",
      z.object({
        brandId: z.string().min(1),
        corpId: z.string().trim().min(1).max(255),
      }),
    ),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const { brandId, corpId } = c.req.valid("json");
      if (!canAccessBrand(auth, brandId)) return c.json({ error: "forbidden" }, 403);
      const env = c.get("env");
      if (
        !env.DINGTALK_ISV_OAUTH_REDIRECT_URI ||
        new URL(env.DINGTALK_ISV_OAUTH_REDIRECT_URI).pathname !==
          `${prefix}/dingtalk/oauth/callback`
      ) {
        return c.json({ error: "dingtalk_oauth_redirect_uri_invalid" }, 503);
      }
      const state = createDingTalkOAuthState(corpId);
      let authorizeUrl: string;
      try {
        authorizeUrl = dingtalkOAuthAuthorizeUrl(env, corpId, state);
      } catch {
        return c.json({ error: "dingtalk_oauth_not_configured" }, 503);
      }
      const now = new Date();
      await c
        .get("store")
        .db.insert(channelOAuthStates)
        .values({
          stateHash: dingtalkOAuthStateHash(state),
          provider: "dingtalk",
          orgId: auth.orgId,
          brandId,
          actorId: auth.sub,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 10 * 60_000),
        });
      return c.json({ authorizeUrl });
    },
  );

  r.get(`${prefix}/dingtalk/oauth/callback`, async (c) => {
    const state = c.req.query("state");
    const parsedState = state ? parseDingTalkOAuthState(state) : null;
    if (!state || !parsedState || state.length > 512) {
      return c.json({ error: "dingtalk_oauth_state_invalid" }, 400);
    }
    const now = new Date();
    const [oauthState] = await c
      .get("store")
      .db.update(channelOAuthStates)
      .set({ consumedAt: now })
      .where(
        and(
          eq(channelOAuthStates.stateHash, dingtalkOAuthStateHash(state)),
          eq(channelOAuthStates.provider, "dingtalk"),
          isNull(channelOAuthStates.consumedAt),
          gt(channelOAuthStates.expiresAt, now),
        ),
      )
      .returning();
    if (!oauthState) return c.json({ error: "dingtalk_oauth_state_invalid" }, 400);
    const [membership] = await c
      .get("store")
      .db.select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.orgId, oauthState.orgId),
          eq(members.accountId, oauthState.actorId),
          eq(members.status, "active"),
        ),
      )
      .limit(1);
    const [brand] = await c
      .get("store")
      .db.select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.id, oauthState.brandId), eq(brands.orgId, oauthState.orgId)))
      .limit(1);
    if (!membership || !brand) return c.json({ error: "dingtalk_oauth_access_revoked" }, 403);

    const destination = new URL("/dashboard/settings/integrations", c.get("env").APP_URL);
    const corpId = c.req.query("corp_id");
    const granted = /^(?:true|1)$/i.test(c.req.query("admin_consent") ?? "");
    if (!granted || c.req.query("error")) {
      destination.searchParams.set("dingtalk", "denied");
      return c.redirect(destination.toString(), 303);
    }
    if (!corpId || corpId !== parsedState.corpId) {
      return c.json({ error: "dingtalk_oauth_corp_mismatch" }, 400);
    }
    try {
      const env = c.get("env");
      const suiteKey = env.DINGTALK_ISV_SUITE_KEY;
      if (!suiteKey) throw new Error("dingtalk_oauth_not_configured");
      const ticketState = await getChannelProviderAppState({
        store: c.get("store"),
        provider: "dingtalk",
        appId: suiteKey,
        stateType: "suite_ticket",
        secret: c.get("authConfig").jwtSecret,
      });
      const suiteTicket =
        typeof ticketState?.suiteTicket === "string" ? ticketState.suiteTicket.trim() : "";
      if (!suiteTicket) throw new Error("dingtalk_suite_ticket_missing");
      const installation = await completeDingTalkAdminConsent({ env, corpId, suiteTicket });
      const db = c.get("store").db;
      const filter = and(
        eq(channelConnections.orgId, oauthState.orgId),
        eq(channelConnections.brandId, oauthState.brandId),
        eq(channelConnections.channelType, "dingtalk"),
        eq(channelConnections.externalAccountId, installation.accountId),
      );
      const [existing] = await db.select().from(channelConnections).where(filter).limit(1);
      const credentials = sealChannelCredentials(
        installation.credentials,
        c.get("authConfig").jwtSecret,
      );
      const [connection] = await db
        .insert(channelConnections)
        .values({
          orgId: oauthState.orgId,
          brandId: oauthState.brandId,
          channelType: "dingtalk",
          externalAccountId: installation.accountId,
          name: installation.name,
          status: "active",
          transport: "stream",
          credentials,
          settings: { ...(existing?.settings ?? {}), ...installation.settings },
          lastConnectedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            channelConnections.orgId,
            channelConnections.brandId,
            channelConnections.channelType,
            channelConnections.externalAccountId,
          ],
          set: {
            name: installation.name,
            status: "active",
            transport: "stream",
            credentials,
            settings: { ...(existing?.settings ?? {}), ...installation.settings },
            lastError: null,
            lastConnectedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning({ id: channelConnections.id });
      if (!connection) throw new Error("dingtalk_oauth_connection_save_failed");
      await writeConnectionAudit(c, oauthState.actorId, {
        orgId: oauthState.orgId,
        action: "channel.connection.oauth_installed",
        connectionId: connection.id,
        changes: { channelType: "dingtalk", externalAccountId: installation.accountId },
      });
      destination.searchParams.set("dingtalk", "connected");
    } catch (error) {
      c.get("log").error({ err: error }, "DingTalk administrator consent failed");
      destination.searchParams.set("dingtalk", "failed");
    }
    return c.redirect(destination.toString(), 303);
  });

  r.post(
    `${prefix}/wecom/oauth/start`,
    requireAuth(),
    zValidator("json", z.object({ brandId: z.string().min(1) })),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const { brandId } = c.req.valid("json");
      if (!canAccessBrand(auth, brandId)) return c.json({ error: "forbidden" }, 403);
      const env = c.get("env");
      if (
        !env.WECOM_SUITE_OAUTH_REDIRECT_URI ||
        new URL(env.WECOM_SUITE_OAUTH_REDIRECT_URI).pathname !== `${prefix}/wecom/oauth/callback`
      ) {
        return c.json({ error: "wecom_oauth_redirect_uri_invalid" }, 503);
      }
      const state = randomBytes(32).toString("base64url");
      let authorizeUrl: string;
      try {
        const suiteAccessToken = await loadWeComSuiteToken(c);
        authorizeUrl = await wecomOAuthAuthorizeUrl(env, state, suiteAccessToken);
      } catch {
        return c.json({ error: "wecom_oauth_not_configured" }, 503);
      }
      const now = new Date();
      await c
        .get("store")
        .db.insert(channelOAuthStates)
        .values({
          stateHash: wecomOAuthStateHash(state),
          provider: "wecom",
          orgId: auth.orgId,
          brandId,
          actorId: auth.sub,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 10 * 60_000),
        });
      return c.json({ authorizeUrl });
    },
  );

  r.get(`${prefix}/wecom/oauth/callback`, async (c) => {
    const state = c.req.query("state");
    if (!state || state.length > 256) return c.json({ error: "wecom_oauth_state_invalid" }, 400);
    const now = new Date();
    const [oauthState] = await c
      .get("store")
      .db.update(channelOAuthStates)
      .set({ consumedAt: now })
      .where(
        and(
          eq(channelOAuthStates.stateHash, wecomOAuthStateHash(state)),
          eq(channelOAuthStates.provider, "wecom"),
          isNull(channelOAuthStates.consumedAt),
          gt(channelOAuthStates.expiresAt, now),
        ),
      )
      .returning();
    if (!oauthState) return c.json({ error: "wecom_oauth_state_invalid" }, 400);
    const [membership] = await c
      .get("store")
      .db.select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.orgId, oauthState.orgId),
          eq(members.accountId, oauthState.actorId),
          eq(members.status, "active"),
        ),
      )
      .limit(1);
    const [brand] = await c
      .get("store")
      .db.select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.id, oauthState.brandId), eq(brands.orgId, oauthState.orgId)))
      .limit(1);
    if (!membership || !brand) return c.json({ error: "wecom_oauth_access_revoked" }, 403);

    const destination = new URL("/dashboard/settings/integrations", c.get("env").APP_URL);
    const authCode = c.req.query("auth_code");
    if (!authCode || c.req.query("error")) {
      destination.searchParams.set("wecom", authCode ? "failed" : "denied");
      return c.redirect(destination.toString(), 303);
    }
    try {
      const suiteAccessToken = await loadWeComSuiteToken(c);
      const installation = await exchangeWeComAuthorizationCode(
        c.get("env"),
        authCode,
        suiteAccessToken,
      );
      const db = c.get("store").db;
      const filter = and(
        eq(channelConnections.orgId, oauthState.orgId),
        eq(channelConnections.brandId, oauthState.brandId),
        eq(channelConnections.channelType, "wecom"),
        eq(channelConnections.externalAccountId, installation.accountId),
      );
      const [existing] = await db.select().from(channelConnections).where(filter).limit(1);
      const credentials = sealChannelCredentials(
        installation.credentials,
        c.get("authConfig").jwtSecret,
      );
      const [connection] = await db
        .insert(channelConnections)
        .values({
          orgId: oauthState.orgId,
          brandId: oauthState.brandId,
          channelType: "wecom",
          externalAccountId: installation.accountId,
          name: installation.name,
          status: "active",
          transport: "webhook",
          credentials,
          settings: { ...(existing?.settings ?? {}), ...installation.settings },
          lastConnectedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            channelConnections.orgId,
            channelConnections.brandId,
            channelConnections.channelType,
            channelConnections.externalAccountId,
          ],
          set: {
            name: installation.name,
            status: "active",
            transport: "webhook",
            credentials,
            settings: { ...(existing?.settings ?? {}), ...installation.settings },
            lastError: null,
            lastConnectedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning({ id: channelConnections.id });
      if (!connection) throw new Error("wecom_oauth_connection_save_failed");
      await writeConnectionAudit(c, oauthState.actorId, {
        orgId: oauthState.orgId,
        action: "channel.connection.oauth_installed",
        connectionId: connection.id,
        changes: { channelType: "wecom", externalAccountId: installation.accountId },
      });
      destination.searchParams.set("wecom", "connected");
    } catch (error) {
      c.get("log").error({ err: error }, "WeCom suite installation failed");
      destination.searchParams.set("wecom", "failed");
    }
    return c.redirect(destination.toString(), 303);
  });

  r.post(
    `${prefix}/email/oauth/start`,
    requireAuth(),
    zValidator(
      "json",
      z.object({
        brandId: z.string().min(1),
        provider: z.enum(["google", "microsoft"]),
        email: z.string().email().max(254),
      }),
    ),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const { brandId, provider, email } = c.req.valid("json");
      if (!canAccessBrand(auth, brandId)) return c.json({ error: "forbidden" }, 403);
      const env = c.get("env");
      if (
        !env.EMAIL_OAUTH_REDIRECT_URI ||
        new URL(env.EMAIL_OAUTH_REDIRECT_URI).pathname !== `${prefix}/email/oauth/callback`
      ) {
        return c.json({ error: "email_oauth_redirect_uri_invalid" }, 503);
      }
      const normalizedEmail = email.toLowerCase();
      const state = createEmailOAuthState(provider, normalizedEmail);
      let authorizeUrl: string;
      try {
        authorizeUrl = emailOAuthAuthorizeUrl(env, provider, normalizedEmail, state);
      } catch {
        return c.json({ error: "email_oauth_not_configured" }, 503);
      }
      const now = new Date();
      await c
        .get("store")
        .db.insert(channelOAuthStates)
        .values({
          stateHash: emailOAuthStateHash(state),
          provider: "email",
          orgId: auth.orgId,
          brandId,
          actorId: auth.sub,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 10 * 60_000),
        });
      return c.json({ authorizeUrl });
    },
  );

  r.get(`${prefix}/email/oauth/callback`, async (c) => {
    const state = c.req.query("state");
    if (!state || !parseEmailOAuthState(state)) {
      return c.json({ error: "email_oauth_state_invalid" }, 400);
    }
    const now = new Date();
    const [oauthState] = await c
      .get("store")
      .db.update(channelOAuthStates)
      .set({ consumedAt: now })
      .where(
        and(
          eq(channelOAuthStates.stateHash, emailOAuthStateHash(state)),
          eq(channelOAuthStates.provider, "email"),
          isNull(channelOAuthStates.consumedAt),
          gt(channelOAuthStates.expiresAt, now),
        ),
      )
      .returning();
    if (!oauthState) return c.json({ error: "email_oauth_state_invalid" }, 400);
    const [membership] = await c
      .get("store")
      .db.select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.orgId, oauthState.orgId),
          eq(members.accountId, oauthState.actorId),
          eq(members.status, "active"),
        ),
      )
      .limit(1);
    const [brand] = await c
      .get("store")
      .db.select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.id, oauthState.brandId), eq(brands.orgId, oauthState.orgId)))
      .limit(1);
    if (!membership || !brand) return c.json({ error: "email_oauth_access_revoked" }, 403);

    const destination = new URL("/dashboard/settings/integrations", c.get("env").APP_URL);
    if (c.req.query("error")) {
      destination.searchParams.set("email", "denied");
      return c.redirect(destination.toString(), 303);
    }
    const code = c.req.query("code");
    if (!code) return c.json({ error: "email_oauth_code_missing" }, 400);
    try {
      const { provider, email } = parseEmailOAuthState(state) as NonNullable<
        ReturnType<typeof parseEmailOAuthState>
      >;
      const tokens = await exchangeEmailAuthorizationCode(c.get("env"), provider, code);
      const credentials = sealChannelCredentials(
        { ...emailOAuthConnectionSettings(provider, email), ...tokens },
        c.get("authConfig").jwtSecret,
      );
      const [connection] = await c
        .get("store")
        .db.insert(channelConnections)
        .values({
          orgId: oauthState.orgId,
          brandId: oauthState.brandId,
          channelType: "email",
          externalAccountId: email,
          name: `${provider === "google" ? "Gmail" : "Microsoft 365"} ${email}`,
          status: "active",
          transport: "polling",
          credentials,
          settings: {},
          lastConnectedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            channelConnections.orgId,
            channelConnections.brandId,
            channelConnections.channelType,
            channelConnections.externalAccountId,
          ],
          set: {
            credentials,
            status: "active",
            transport: "polling",
            lastError: null,
            lastConnectedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning({ id: channelConnections.id });
      if (!connection) throw new Error("email_oauth_connection_save_failed");
      await writeConnectionAudit(c, oauthState.actorId, {
        orgId: oauthState.orgId,
        action: "channel.connection.oauth_installed",
        connectionId: connection.id,
        changes: { channelType: "email", provider, externalAccountId: email },
      });
      destination.searchParams.set("email", "connected");
    } catch (error) {
      c.get("log").error({ err: error }, "Email OAuth installation failed");
      destination.searchParams.set("email", "failed");
    }
    return c.redirect(destination.toString(), 303);
  });

  r.post(
    `${prefix}/whatsapp/signup/start`,
    requireAuth(),
    zValidator("json", z.object({ brandId: z.string().min(1) })),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const { brandId } = c.req.valid("json");
      if (!canAccessBrand(auth, brandId)) return c.json({ error: "forbidden" }, 403);
      let config: ReturnType<typeof whatsappSignupConfig>;
      try {
        config = whatsappSignupConfig(c.get("env"));
      } catch {
        return c.json({ error: "whatsapp_signup_not_configured" }, 503);
      }
      const state = randomBytes(32).toString("base64url");
      const now = new Date();
      await c
        .get("store")
        .db.insert(channelOAuthStates)
        .values({
          stateHash: whatsappOAuthStateHash(state),
          provider: "whatsapp",
          orgId: auth.orgId,
          brandId,
          actorId: auth.sub,
          createdAt: now,
          expiresAt: new Date(now.getTime() + 10 * 60_000),
        });
      return c.json({ state, ...config });
    },
  );

  r.post(
    `${prefix}/whatsapp/signup/complete`,
    requireAuth(),
    zValidator(
      "json",
      z.object({
        state: z.string().min(32).max(256),
        code: z.string().min(1).max(4096),
        wabaId: z.string().regex(/^\d+$/),
        phoneNumberId: z.string().regex(/^\d+$/),
        pin: z
          .string()
          .regex(/^\d{6}$/)
          .optional(),
      }),
    ),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const body = c.req.valid("json");
      const now = new Date();
      const [oauthState] = await c
        .get("store")
        .db.update(channelOAuthStates)
        .set({ consumedAt: now })
        .where(
          and(
            eq(channelOAuthStates.stateHash, whatsappOAuthStateHash(body.state)),
            eq(channelOAuthStates.provider, "whatsapp"),
            eq(channelOAuthStates.orgId, auth.orgId),
            eq(channelOAuthStates.actorId, auth.sub),
            isNull(channelOAuthStates.consumedAt),
            gt(channelOAuthStates.expiresAt, now),
          ),
        )
        .returning();
      if (!oauthState || !canAccessBrand(auth, oauthState.brandId)) {
        return c.json({ error: "whatsapp_signup_state_invalid" }, 400);
      }
      const [brand] = await c
        .get("store")
        .db.select({ id: brands.id })
        .from(brands)
        .where(and(eq(brands.id, oauthState.brandId), eq(brands.orgId, auth.orgId)))
        .limit(1);
      if (!brand) return c.json({ error: "whatsapp_signup_access_revoked" }, 403);
      let installation: Awaited<ReturnType<typeof installWhatsAppSignup>>;
      try {
        installation = await installWhatsAppSignup(c.get("env"), body);
      } catch (error) {
        const message = safeValidationError(error);
        c.get("log").error({ err: error }, "WhatsApp Embedded Signup failed");
        return c.json({ error: message }, 422);
      }
      const db = c.get("store").db;
      const [connection] = await db
        .insert(channelConnections)
        .values({
          orgId: auth.orgId,
          brandId: oauthState.brandId,
          channelType: "whatsapp",
          externalAccountId: installation.accountId,
          name: installation.name,
          status: "active",
          transport: "webhook",
          credentials: sealChannelCredentials(
            installation.credentials,
            c.get("authConfig").jwtSecret,
          ),
          settings: {},
          lastConnectedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            channelConnections.orgId,
            channelConnections.brandId,
            channelConnections.channelType,
            channelConnections.externalAccountId,
          ],
          set: {
            name: installation.name,
            status: "active",
            transport: "webhook",
            credentials: sealChannelCredentials(
              installation.credentials,
              c.get("authConfig").jwtSecret,
            ),
            lastError: null,
            lastConnectedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!connection) return c.json({ error: "whatsapp_signup_save_failed" }, 500);
      await writeConnectionAudit(c, auth.sub, {
        action: "channel.connection.oauth_installed",
        connectionId: connection.id,
        changes: { channelType: "whatsapp", externalAccountId: installation.accountId },
      });
      return c.json({ connection: serializeConnection(connection, c.get("authConfig").jwtSecret) });
    },
  );

  r.get(`${prefix}/:id/whatsapp/templates`, requireAuth(), async (c) => {
    const context = await whatsappTemplateContext(c, c.req.param("id"));
    if (context.error) return context.error;
    try {
      return c.json({ items: await listWhatsAppTemplates(context.credentials) });
    } catch (error) {
      return whatsappTemplateError(c, error);
    }
  });

  r.post(
    `${prefix}/:id/whatsapp/templates`,
    requireAuth(),
    zValidator("json", whatsappTemplateSchema),
    async (c) => {
      const context = await whatsappTemplateContext(c, c.req.param("id"));
      if (context.error) return context.error;
      const body = c.req.valid("json");
      try {
        const template = await createWhatsAppTemplate(context.credentials, body);
        await writeConnectionAudit(c, context.auth.sub, {
          action: "channel.whatsapp_template.created",
          connectionId: context.connectionId,
          changes: { name: body.name, language: body.language, category: body.category },
        });
        return c.json({ template }, 201);
      } catch (error) {
        return whatsappTemplateError(c, error);
      }
    },
  );

  r.patch(
    `${prefix}/:id/whatsapp/templates/:templateId`,
    requireAuth(),
    zValidator("param", z.object({ id: z.string().min(1), templateId: z.string().regex(/^\d+$/) })),
    zValidator("json", whatsappTemplatePatchSchema),
    async (c) => {
      const { id, templateId } = c.req.valid("param");
      const context = await whatsappTemplateContext(c, id);
      if (context.error) return context.error;
      const body = c.req.valid("json");
      try {
        const result = await updateWhatsAppTemplate(context.credentials, templateId, body);
        await writeConnectionAudit(c, context.auth.sub, {
          action: "channel.whatsapp_template.updated",
          connectionId: context.connectionId,
          changes: { templateId, fields: Object.keys(body).sort() },
        });
        return c.json(result);
      } catch (error) {
        return whatsappTemplateError(c, error);
      }
    },
  );

  r.delete(
    `${prefix}/:id/whatsapp/templates/:templateId`,
    requireAuth(),
    zValidator("param", z.object({ id: z.string().min(1), templateId: z.string().regex(/^\d+$/) })),
    zValidator("query", z.object({ name: whatsappTemplateNameSchema })),
    async (c) => {
      const { id, templateId } = c.req.valid("param");
      const { name } = c.req.valid("query");
      const context = await whatsappTemplateContext(c, id);
      if (context.error) return context.error;
      try {
        await deleteWhatsAppTemplate(context.credentials, { name, templateId });
        await writeConnectionAudit(c, context.auth.sub, {
          action: "channel.whatsapp_template.deleted",
          connectionId: context.connectionId,
          changes: { templateId, name },
        });
        return c.body(null, 204);
      } catch (error) {
        return whatsappTemplateError(c, error);
      }
    },
  );

  r.put(
    `${prefix}/:channelType`,
    requireAuth(),
    zValidator("param", z.object({ channelType: channelTypeSchema })),
    zValidator("json", upsertConnectionSchema),
    async (c) => {
      const auth = c.get("auth");
      if (!auth) return c.json({ error: "unauthorized" }, 401);
      const body = c.req.valid("json");
      if (!canAccessBrand(auth, body.brandId)) return c.json({ error: "forbidden" }, 403);
      const channelType = c.req.valid("param").channelType;
      const secret = c.get("authConfig").jwtSecret;
      const [existing] = await c
        .get("store")
        .db.select()
        .from(channelConnections)
        .where(
          and(
            eq(channelConnections.orgId, auth.orgId),
            eq(channelConnections.brandId, body.brandId),
            eq(channelConnections.channelType, channelType),
            eq(channelConnections.externalAccountId, body.externalAccountId),
          ),
        )
        .limit(1);
      const mergedCredentials = body.credentials
        ? {
            ...(existing ? openChannelCredentials(existing.credentials, secret) : {}),
            ...body.credentials,
          }
        : existing
          ? openChannelCredentials(existing.credentials, secret)
          : {};
      const replacingOauth =
        (channelType === "slack" && body.credentials?.botToken && !body.credentials.refreshToken) ||
        (channelType === "email" &&
          (body.credentials?.pass || body.credentials?.imapPass) &&
          !body.credentials?.accessToken);
      const credentials = replacingOauth
        ? Object.fromEntries(
            Object.entries(mergedCredentials).filter(
              ([key]) =>
                key !== "refreshToken" &&
                key !== "expiresAt" &&
                key !== "accessToken" &&
                key !== "oauthProvider",
            ),
          )
        : mergedCredentials;
      const now = new Date();
      // Manual credentials are not routable until the provider test below has
      // proved them. OAuth and embedded-signup callbacks use separate routes
      // and activate only after their provider exchanges succeed.
      const savedStatus = channelType === "widget" ? "active" : "pending";
      const [row] = existing
        ? await c
            .get("store")
            .db.update(channelConnections)
            .set({
              name: body.name,
              status: savedStatus,
              transport: body.transport,
              credentials: sealChannelCredentials(credentials, secret),
              settings: body.settings,
              lastError: null,
              lastConnectedAt: channelType === "widget" ? now : null,
              runtimeNextAttemptAt: null,
              updatedAt: now,
            })
            .where(eq(channelConnections.id, existing.id))
            .returning()
        : await c
            .get("store")
            .db.insert(channelConnections)
            .values({
              orgId: auth.orgId,
              brandId: body.brandId,
              channelType,
              name: body.name,
              externalAccountId: body.externalAccountId,
              status: savedStatus,
              transport: body.transport,
              credentials: sealChannelCredentials(credentials, secret),
              settings: body.settings,
              lastConnectedAt: channelType === "widget" ? now : null,
            })
            .returning();
      if (!row) return c.json({ error: "save_failed" }, 500);
      await writeConnectionAudit(c, auth.sub, {
        action: existing ? "channel.connection.updated" : "channel.connection.created",
        connectionId: row.id,
        changes: {
          brandId: body.brandId,
          channelType,
          externalAccountId: body.externalAccountId,
          requestedStatus: body.status,
          status: savedStatus,
          transport: body.transport,
          configuredCredentialKeys: Object.entries(body.credentials ?? {})
            .filter(([, value]) => value !== undefined && value !== null && value !== "")
            .map(([key]) => key)
            .sort(),
          settingsKeys: Object.keys(body.settings).sort(),
        },
      });
      return c.json({ connection: serializeConnection(row, secret) });
    },
  );

  r.delete(`${prefix}/:id`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const [connection] = await c
      .get("store")
      .db.select()
      .from(channelConnections)
      .where(
        and(eq(channelConnections.id, c.req.param("id")), eq(channelConnections.orgId, auth.orgId)),
      )
      .limit(1);
    if (!connection) return c.json({ error: "not_found" }, 404);
    if (!canAccessBrand(auth, connection.brandId)) return c.json({ error: "forbidden" }, 403);
    let disconnectResult: Awaited<ReturnType<typeof disconnectChannelProvider>>;
    try {
      disconnectResult = await disconnectChannelProvider(
        connection,
        openChannelCredentials(connection.credentials, c.get("authConfig").jwtSecret),
        c.get("env"),
      );
    } catch (error) {
      const message = safeValidationError(error);
      await writeConnectionAudit(c, auth.sub, {
        action: "channel.connection.disconnect_failed",
        connectionId: connection.id,
        changes: { channelType: connection.channelType, error: message },
      });
      return c.json({ error: message }, 502);
    }
    await c
      .get("store")
      .db.update(channelConnections)
      .set({
        status: "disabled",
        runtimeState: "stopped",
        runtimeOwnerId: null,
        runtimeLeaseToken: null,
        runtimeLeaseExpiresAt: null,
        runtimeHeartbeatAt: null,
        runtimeNextAttemptAt: null,
        updatedAt: new Date(),
      })
      .where(eq(channelConnections.id, connection.id));
    await writeConnectionAudit(c, auth.sub, {
      action: "channel.connection.disabled",
      connectionId: connection.id,
      changes: {
        channelType: connection.channelType,
        status: "disabled",
        disconnectMode: disconnectResult.mode,
        providerAction: disconnectResult.providerAction,
      },
    });
    return c.body(null, 204);
  });

  r.post(`${prefix}/:id/test`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);
    const [row] = await c
      .get("store")
      .db.select()
      .from(channelConnections)
      .where(
        and(eq(channelConnections.id, c.req.param("id")), eq(channelConnections.orgId, auth.orgId)),
      )
      .limit(1);
    if (!row) return c.json({ error: "not_found" }, 404);
    try {
      const connection = {
        connectionId: row.id,
        orgId: row.orgId,
        brandId: row.brandId,
        channelType: row.channelType as ChannelType,
        transport: row.transport,
        credentials: await loadChannelCredentials(
          c.get("store"),
          row,
          c.get("authConfig").jwtSecret,
          c.get("env"),
        ),
        settings: row.settings,
      };
      const result = await validateChannelConnection(connection);
      let providerLifecycle: Awaited<ReturnType<typeof reconcileTelegramTransport>> | undefined;
      if (row.channelType === "telegram") {
        const botToken = connection.credentials.botToken;
        if (typeof botToken !== "string" || !botToken)
          throw new Error("telegram_bot_token_required");
        if (row.transport === "webhook") {
          const baseUrl = c.get("env").CHANNEL_WEBHOOK_BASE_URL;
          if (!baseUrl) throw new Error("telegram_webhook_base_url_required");
          const [identity] = await c
            .get("store")
            .db.select({ orgSlug: organizations.slug, brandSlug: brands.slug })
            .from(brands)
            .innerJoin(organizations, eq(brands.orgId, organizations.id))
            .where(and(eq(brands.id, row.brandId), eq(organizations.id, row.orgId)))
            .limit(1);
          if (!identity) throw new Error("telegram_webhook_tenant_not_found");
          providerLifecycle = await reconcileTelegramTransport({
            botToken,
            transport: "webhook",
            webhookUrl: buildTelegramWebhookUrl({
              baseUrl,
              orgSlug: identity.orgSlug,
              brandSlug: identity.brandSlug,
              connectionId: row.id,
            }),
            webhookSecret:
              typeof connection.credentials.webhookSecret === "string"
                ? connection.credentials.webhookSecret
                : undefined,
          });
        } else if (row.transport === "polling") {
          providerLifecycle = await reconcileTelegramTransport({ botToken, transport: "polling" });
        }
      }
      const now = new Date();
      await c
        .get("store")
        .db.update(channelConnections)
        .set({ status: "active", lastError: null, lastConnectedAt: now, updatedAt: now })
        .where(eq(channelConnections.id, row.id));
      await writeConnectionAudit(c, auth.sub, {
        action: "channel.connection.tested",
        connectionId: row.id,
        changes: {
          channelType: row.channelType,
          verification: result.verification,
          providerAction: providerLifecycle?.providerAction,
          ok: true,
        },
      });
      return c.json({ result: { ...result, lifecycle: providerLifecycle } });
    } catch (error) {
      const message = safeValidationError(error);
      await c
        .get("store")
        .db.update(channelConnections)
        .set({ status: "error", lastError: message, updatedAt: new Date() })
        .where(eq(channelConnections.id, row.id));
      await writeConnectionAudit(c, auth.sub, {
        action: "channel.connection.test_failed",
        connectionId: row.id,
        changes: { channelType: row.channelType, ok: false, error: message },
      });
      return c.json({ error: message }, 422);
    }
  });

  return r;
}

async function whatsappTemplateContext(
  c: Context<{ Variables: AppVariables }>,
  connectionId: string,
): Promise<
  | {
      error: null;
      auth: NonNullable<AppVariables["auth"]>;
      connectionId: string;
      credentials: ReturnType<typeof whatsappTemplateCredentials>;
    }
  | { error: Response }
> {
  const auth = c.get("auth");
  if (!auth) return { error: c.json({ error: "unauthorized" }, 401) };
  const [row] = await c
    .get("store")
    .db.select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.id, connectionId),
        eq(channelConnections.orgId, auth.orgId),
        eq(channelConnections.channelType, "whatsapp"),
      ),
    )
    .limit(1);
  if (!row) return { error: c.json({ error: "not_found" }, 404) };
  if (!canAccessBrand(auth, row.brandId)) return { error: c.json({ error: "forbidden" }, 403) };
  try {
    return {
      error: null,
      auth,
      connectionId: row.id,
      credentials: whatsappTemplateCredentials(
        openChannelCredentials(row.credentials, c.get("authConfig").jwtSecret),
        c.get("env").WHATSAPP_GRAPH_API_VERSION,
      ),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "whatsapp_template_credentials_invalid";
    return {
      error: c.json(
        {
          error: /^[a-zA-Z0-9_:-]{1,160}$/.test(message)
            ? message
            : "whatsapp_template_credentials_invalid",
        },
        422,
      ),
    };
  }
}

function whatsappTemplateError(c: Context<{ Variables: AppVariables }>, error: unknown): Response {
  c.get("log").warn({ err: error }, "WhatsApp template provider request failed");
  if (error instanceof WhatsAppTemplateProviderError) {
    if (error.status === 429) return c.json({ error: error.message }, 429);
    if (error.status === 401 || error.status === 403) {
      return c.json({ error: "whatsapp_template_provider_unauthorized" }, 502);
    }
    return c.json({ error: error.message }, 502);
  }
  const message = error instanceof Error ? error.message : "whatsapp_template_request_failed";
  return c.json(
    {
      error: /^[a-zA-Z0-9_:-]{1,160}$/.test(message) ? message : "whatsapp_template_request_failed",
    },
    502,
  );
}

function safeValidationError(error: unknown): string {
  const message = error instanceof Error ? error.message : "channel_connection_test_failed";
  return /^[a-z0-9_:-]{1,160}$/i.test(message) ? message : "channel_connection_test_failed";
}

async function loadWeComSuiteToken(c: Context<{ Variables: AppVariables }>): Promise<string> {
  const env = c.get("env");
  if (!env.WECOM_SUITE_ID || !env.WECOM_SUITE_SECRET) {
    throw new Error("wecom_oauth_not_configured");
  }
  const state = await getChannelProviderAppState({
    store: c.get("store"),
    provider: "wecom",
    appId: env.WECOM_SUITE_ID,
    stateType: "suite_ticket",
    secret: c.get("authConfig").jwtSecret,
  });
  const suiteTicket = typeof state?.suiteTicket === "string" ? state.suiteTicket.trim() : "";
  if (!suiteTicket) throw new Error("wecom_suite_ticket_missing");
  return getWeComSuiteAccessToken(
    {
      suiteId: env.WECOM_SUITE_ID,
      suiteSecret: env.WECOM_SUITE_SECRET,
      suiteTicket,
    },
    "wecom-suite-oauth",
  );
}

async function writeConnectionAudit(
  c: Context<{ Variables: AppVariables }>,
  actorId: string,
  input: {
    orgId?: string;
    action: string;
    connectionId: string;
    changes?: Record<string, unknown>;
  },
) {
  const orgId = input.orgId ?? c.get("auth")?.orgId;
  if (!orgId) return;
  await c
    .get("store")
    .db.insert(auditLogs)
    .values({
      orgId,
      actorType: "account",
      actorId,
      action: input.action,
      resourceType: "channel_connection",
      resourceId: input.connectionId,
      changes: input.changes,
      ipAddress: c.req.header("x-forwarded-for")?.split(",")[0]?.trim(),
      userAgent: c.req.header("user-agent"),
    });
}

function serializeConnection(row: typeof channelConnections.$inferSelect, secret: string) {
  return {
    id: row.id,
    brandId: row.brandId,
    channelType: row.channelType as ChannelType,
    name: row.name,
    externalAccountId: row.externalAccountId,
    status: row.status,
    transport: row.transport,
    configuredCredentialKeys: channelCredentialKeys(row.credentials, secret),
    settings: row.settings,
    lastError: row.lastError,
    lastConnectedAt: row.lastConnectedAt?.toISOString() ?? null,
    runtimeState: row.runtimeState,
    runtimeHeartbeatAt: row.runtimeHeartbeatAt?.toISOString() ?? null,
    runtimeNextAttemptAt: row.runtimeNextAttemptAt?.toISOString() ?? null,
    reconnectAttempts: row.reconnectAttempts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
