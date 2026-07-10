import { z } from "zod";

export const emptyConnectorConfigSchema = z.object({}).passthrough();

export const permissionsSchema = z
  .object({
    visibility: z.enum(["public", "customers", "paying_customers", "internal", "role"]),
    roles: z.array(z.string()).optional(),
  })
  .passthrough();

export const attachmentSchema = z
  .object({
    filename: z.string(),
    mime: z.string(),
    url: z.string().url(),
    bytes: z.number().int().nonnegative(),
  })
  .passthrough();

export const configDocumentSchema = z
  .object({
    externalId: z.string().optional(),
    title: z.string().optional(),
    url: z.string().url().optional(),
    rawContent: z.string().optional(),
    content: z.string().optional(),
    body: z.string().optional(),
    text: z.string().optional(),
    transcript: z.string().optional(),
    contentType: z.string().optional(),
    canonicalLocale: z.string().optional(),
    permissions: permissionsSchema.optional(),
    attachments: z.array(attachmentSchema).optional(),
    updatedAt: z.string().datetime().optional(),
  })
  .passthrough();

export const configDocumentsConnectorConfigSchema = z
  .object({
    documents: z.array(configDocumentSchema).optional(),
    items: z.array(configDocumentSchema).optional(),
    defaultContentType: z.string().optional(),
  })
  .passthrough();

export const fileUploadConnectorConfigSchema = z
  .object({
    documents: z.array(configDocumentSchema).optional(),
  })
  .passthrough();

export const webCrawlUrlConfigSchema = z.union([
  z.string().url(),
  z
    .object({
      url: z.string().url().optional(),
      title: z.string().optional(),
      canonicalLocale: z.string().optional(),
      updatedAt: z.string().datetime().optional(),
    })
    .passthrough(),
]);

export const webCrawlConnectorConfigSchema = z
  .object({
    urls: z.array(webCrawlUrlConfigSchema).optional(),
    userAgent: z.string().optional(),
  })
  .passthrough();

export const githubFileConfigSchema = z.union([
  z.string().url(),
  z
    .object({
      url: z.string().url().optional(),
      path: z.string().optional(),
      title: z.string().optional(),
      updatedAt: z.string().datetime().optional(),
    })
    .passthrough(),
]);

export const githubConnectorConfigSchema = z
  .object({
    files: z.array(githubFileConfigSchema).optional(),
    token: z.string().optional(),
    userAgent: z.string().optional(),
  })
  .passthrough();

export const notionPageConfigSchema = z.union([
  z.string(),
  z
    .object({
      pageId: z.string().optional(),
      title: z.string().optional(),
      updatedAt: z.string().datetime().optional(),
    })
    .passthrough(),
]);

export const notionConnectorConfigSchema = z
  .object({
    pageIds: z.array(notionPageConfigSchema).optional(),
    token: z.string().optional(),
    version: z.string().optional(),
  })
  .passthrough();
