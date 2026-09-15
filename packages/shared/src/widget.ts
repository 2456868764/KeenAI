import { z } from "zod";
import { conversationRatingSchema } from "./conversation.js";
import { messagePartSchema } from "./message-parts.js";

export const widgetUserSchema = z.object({
  id: z.string().min(1).max(128),
  userHash: z.string().regex(/^[a-f0-9]{64}$/i, "expected HMAC-SHA256 hex"),
  email: z.string().email().optional(),
  name: z.string().max(200).optional(),
});

export const widgetSessionSchema = z.object({
  orgSlug: z.string().min(1).max(64),
  brandSlug: z.string().min(1).max(64).default("default"),
  user: widgetUserSchema,
});

export const widgetCreateConversationSchema = z.object({
  subject: z.string().max(500).optional(),
  initialMessage: z
    .object({
      plainText: z.string().min(1).max(20_000),
    })
    .optional(),
});

export const widgetPageViewSchema = z.object({
  url: z.string().url().max(2048),
  title: z.string().max(500).optional(),
  timeOnPageSec: z.number().int().min(0).max(86_400).optional(),
});

export const widgetPostMessageSchema = z
  .object({
    plainText: z.string().max(20_000).optional(),
    attachmentIds: z.array(z.string().min(1)).max(5).optional(),
    parts: z.array(messagePartSchema).optional(),
  })
  .refine(
    (v) =>
      (typeof v.plainText === "string" && v.plainText.trim().length > 0) ||
      (v.attachmentIds !== undefined && v.attachmentIds.length > 0),
    { message: "plainText or attachmentIds required" },
  );

/** Widget CSAT after conversation close (I104) or workflow csat block resume. */
export const widgetConversationRatingSchema = conversationRatingSchema.extend({
  workflowRunId: z.string().min(1).max(64).optional(),
  blockId: z.string().min(1).max(64).optional(),
});

export const widgetWorkflowInputSchema = z.object({
  workflowRunId: z.string().min(1).max(64),
  blockId: z.string().min(1).max(64),
  attributes: z.record(z.string().min(1).max(64), z.string().max(2000)),
  freeText: z.string().max(5000).optional(),
});

export const widgetTicketFormInputSchema = z.object({
  workflowRunId: z.string().min(1).max(64),
  blockId: z.string().min(1).max(64),
  ticketId: z.string().min(1).max(64).optional(),
  values: z.record(z.string().min(1).max(64), z.unknown()),
});

export const widgetCreateTicketSchema = z.object({
  type: z.string().min(1).max(64).default("support"),
  title: z.string().min(1).max(240),
  description: z.string().min(1).max(20_000),
  attachmentIds: z.array(z.string().min(1)).max(5).optional(),
});

export const widgetAnswerSchema = z.object({
  conversationId: z.string().min(1).max(64),
  query: z.string().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(10).default(5),
  rerank: z.coerce.boolean().optional(),
});

export const widgetHandoffSchema = z.object({
  message: z.string().min(1).max(5000).default("I need help from the team."),
});

const widgetModuleKeySchema = z.enum(["home", "messages", "help", "changelog", "tickets"]);

export const updateWidgetSettingsSchema = z.object({
  primaryColor: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
  launcherIconUrl: z.string().url().nullable().optional(),
  agentName: z.string().min(1).max(120).optional(),
  agentSubtitle: z.string().min(1).max(240).optional(),
  agentAvatarUrl: z.string().url().nullable().optional(),
  greetingTitle: z.string().min(1).max(200).optional(),
  greetingBody: z.string().min(1).max(1000).optional(),
  poweredByEnabled: z.boolean().optional(),
  modules: z
    .object({
      home: z.boolean().optional(),
      messages: z.boolean().optional(),
      help: z.boolean().optional(),
      changelog: z.boolean().optional(),
      tickets: z.boolean().optional(),
    })
    .optional(),
  menuItems: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        description: z.string().max(240).nullable().optional(),
        icon: z.string().max(64).nullable().optional(),
        type: z.enum(["module", "external"]),
        module: widgetModuleKeySchema.nullable().optional(),
        href: z.string().url().nullable().optional(),
        location: z.enum(["bottom_nav", "home_card", "portal_menu"]),
        enabled: z.boolean().default(true),
        sortOrder: z.number().int().min(0).max(10_000).default(0),
      }),
    )
    .max(20)
    .optional(),
  quickActions: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        type: z.enum(["start_chat", "submit_ticket", "open_help", "open_url"]),
        payload: z.record(z.string(), z.unknown()).default({}),
        enabled: z.boolean().default(true),
        sortOrder: z.number().int().min(0).max(10_000).default(0),
      }),
    )
    .max(20)
    .optional(),
  featured: z
    .array(
      z.object({
        type: z.enum(["kb_article", "changelog_entry", "external"]),
        contentId: z.string().max(128).nullable().optional(),
        title: z.string().max(200).nullable().optional(),
        imageUrl: z.string().url().nullable().optional(),
        href: z.string().url().nullable().optional(),
        enabled: z.boolean().default(true),
        sortOrder: z.number().int().min(0).max(10_000).default(0),
      }),
    )
    .max(20)
    .optional(),
});

export const widgetWorkflowButtonSchema = z.object({
  workflowRunId: z.string().min(1).max(64),
  blockId: z.string().min(1).max(64),
  buttonId: z.string().min(1).max(64),
});

export type WidgetUser = z.infer<typeof widgetUserSchema>;
export type WidgetSessionInput = z.infer<typeof widgetSessionSchema>;
export type UpdateWidgetSettingsInput = z.infer<typeof updateWidgetSettingsSchema>;
