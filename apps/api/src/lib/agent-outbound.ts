import { parseAgentResponse } from "@keenai/channels-core";
import { attachments } from "@keenai/storage/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AppVariables } from "../types.js";
import { loadPendingAttachments } from "./attachments.js";

type Db = AppVariables["store"]["db"];

export async function loadPendingAttachmentsByStorageKeys(
  db: Db,
  orgId: string,
  storageKeys: string[],
) {
  if (storageKeys.length === 0) return [];
  return db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.orgId, orgId),
        inArray(attachments.storageKey, storageKeys),
        isNull(attachments.messageId),
      ),
    );
}

export type AgentOutboundPayload = {
  plainText: string;
  attachmentIds: string[];
};

/** Parse Keeni/agent markdown and resolve MEDIA: / attachment refs to pending attachment IDs. */
export async function buildAgentOutboundPayload(
  db: Db,
  orgId: string,
  agentOutboundText: string,
): Promise<AgentOutboundPayload> {
  const parsed = parseAgentResponse(agentOutboundText);
  const attachmentIds = [...parsed.attachmentIds];

  if (parsed.storageKeys.length > 0) {
    const rows = await loadPendingAttachmentsByStorageKeys(db, orgId, parsed.storageKeys);
    const foundKeys = new Set(rows.map((r) => r.storageKey));
    const missing = parsed.storageKeys.filter((k) => !foundKeys.has(k));
    if (missing.length > 0) {
      throw new Error("invalid_attachments");
    }
    attachmentIds.push(...rows.map((r) => r.id));
  }

  const uniqueIds = [...new Set(attachmentIds)];
  if (uniqueIds.length > 0) {
    const pending = await loadPendingAttachments(db, orgId, uniqueIds);
    if (pending.length !== uniqueIds.length) {
      throw new Error("invalid_attachments");
    }
  }

  return {
    plainText: parsed.plainText,
    attachmentIds: uniqueIds,
  };
}
