import { buildKeeniAgentContext } from "@keenai/agent";
import type { DraftMessage, DraftRequest } from "@keenai/llm";
import type { MemoryScope } from "@keenai/memory-tree";
import { assembleAgentMemoryContext } from "@keenai/memory-tree";
import type { ApiEnv } from "@keenai/shared";
import { messages } from "@keenai/storage/schema";
import { and, asc, eq } from "drizzle-orm";
import type { AppVariables } from "../types.js";
import { loadAttachmentsForMessages } from "./attachments.js";
import { resolveCustomActionSecretFromEnv } from "./custom-action-executor.js";
import { loadCustomActionDraftTools } from "./custom-action-tools.js";
import { getKbContextSearch } from "./kb-search-config.js";
import { loadMcpDraftTools } from "./mcp-tools.js";
import { readUploadFile } from "./uploads.js";

const MAX_VISION_IMAGES_PER_MSG = 3;
const MAX_VISION_IMAGES_TOTAL = 10;
const MESSAGE_LIMIT = 50;

function isVisionMime(mime: string | null | undefined): boolean {
  return (mime ?? "").toLowerCase().startsWith("image/");
}

function toBase64(buf: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(buf).toString("base64");
  let binary = "";
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    if (byte !== undefined) binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function buildCopilotDraftRequest(
  db: AppVariables["store"]["db"],
  env: ApiEnv,
  input: {
    conversationId: string;
    orgId: string;
    brandId: string;
    userId?: string | null;
    subject?: string;
    instruction?: string;
  },
): Promise<{ request: DraftRequest; memoryScope: MemoryScope; toolNames: string[] }> {
  const rows = await db
    .select({
      id: messages.id,
      senderType: messages.senderType,
      plainText: messages.plainText,
      isInternal: messages.isInternal,
    })
    .from(messages)
    .where(and(eq(messages.conversationId, input.conversationId), eq(messages.orgId, input.orgId)))
    .orderBy(asc(messages.createdAt))
    .limit(MESSAGE_LIMIT);

  const external = rows.filter((m) => !m.isInternal);
  const attachmentMap = await loadAttachmentsForMessages(
    db,
    external.map((m) => m.id),
  );

  let totalImages = 0;
  const draftMessages: DraftMessage[] = [];

  for (const m of external) {
    const role = (m.senderType === "user" ? "user" : "agent") as "user" | "agent";
    const images: NonNullable<DraftMessage["images"]> = [];

    for (const att of attachmentMap.get(m.id) ?? []) {
      if (!isVisionMime(att.contentType)) continue;
      if (images.length >= MAX_VISION_IMAGES_PER_MSG) break;
      if (totalImages >= MAX_VISION_IMAGES_TOTAL) break;

      const buf = await readUploadFile(env, att.storageKey);
      if (!buf) continue;

      images.push({
        mimeType: att.contentType ?? "image/png",
        dataBase64: toBase64(buf),
      });
      totalImages++;
    }

    draftMessages.push({
      role,
      plainText: m.plainText,
      ...(images.length > 0 ? { images } : {}),
    });
  }

  if (draftMessages.length === 0) {
    draftMessages.push({ role: "user", plainText: input.subject ?? "Hello" });
  }

  const memory = await assembleAgentMemoryContext(db, {
    orgId: input.orgId,
    brandId: input.brandId,
    conversationId: input.conversationId,
    userId: input.userId,
    instruction: input.instruction,
    kbSearch: getKbContextSearch(),
  });

  const [customTools, mcpTools] = await Promise.all([
    loadCustomActionDraftTools(
      db,
      {
        orgId: input.orgId,
        brandId: input.brandId,
        conversationId: input.conversationId,
      },
      {
        fetch: globalThis.fetch.bind(globalThis),
        getSecret: (secretRef) => resolveCustomActionSecretFromEnv(secretRef),
      },
      { otelEnabled: env.OTEL_ENABLED },
    ),
    loadMcpDraftTools(env),
  ]);
  const tools = [...customTools, ...mcpTools];

  const agentContext = buildKeeniAgentContext({
    params: {
      orgId: input.orgId,
      brandId: input.brandId,
      conversationId: input.conversationId,
      userId: input.userId,
    },
    draftRequest: {
      messages: draftMessages,
      instruction: input.instruction,
      subject: input.subject,
      ...(memory.text ? { memoryContext: memory.text } : {}),
      ...(tools.length > 0 ? { tools } : {}),
    },
  });

  return {
    memoryScope: memory.scope,
    toolNames: tools.map((tool) => tool.name),
    request: agentContext.draftRequest,
  };
}
