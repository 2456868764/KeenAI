import dns from "node:dns/promises";
import { isIP } from "node:net";
import path from "node:path";
import { parseAgentResponse } from "@keenai/channels-core";
import type { ApiEnv } from "@keenai/shared";
import { attachments } from "@keenai/storage/schema";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AppVariables } from "../types.js";
import { insertAttachment, loadPendingAttachments } from "./attachments.js";
import {
  generateStorageKey,
  guessContentType,
  isAllowedUploadMime,
  saveUploadFile,
} from "./uploads.js";

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

/** Parse Keeni/agent markdown and resolve media refs/URLs to pending attachment IDs. */
export async function buildAgentOutboundPayload(
  db: Db,
  env: ApiEnv,
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

  if (parsed.externalUrls.length > 0) {
    const downloaded = await downloadExternalAttachments(db, env, orgId, parsed.externalUrls);
    attachmentIds.push(...downloaded.map((row) => row.id));
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

async function downloadExternalAttachments(db: Db, env: ApiEnv, orgId: string, urls: string[]) {
  const rows = [];
  for (const url of urls) {
    const safe = await isSafeExternalHttpUrl(url);
    if (!safe) throw new Error("invalid_attachments");

    const res = await fetch(url, { redirect: "error" });
    if (!res.ok) throw new Error("invalid_attachments");

    const fileName = fileNameFromUrl(url);
    const headerContentType = res.headers.get("content-type")?.split(";")[0]?.trim();
    const contentType = headerContentType || guessContentType(fileName);
    if (!isAllowedUploadMime(contentType)) throw new Error("invalid_attachments");

    const contentLength = Number(res.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > env.UPLOAD_MAX_BYTES) {
      throw new Error("invalid_attachments");
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > env.UPLOAD_MAX_BYTES) throw new Error("invalid_attachments");

    const storageKey = generateStorageKey(path.extname(fileName) || extensionForMime(contentType));
    await saveUploadFile(env, storageKey, bytes);
    rows.push(
      await insertAttachment(db, {
        orgId,
        storageKey,
        fileName,
        contentType,
        sizeBytes: bytes.byteLength,
        metadata: { source: "agent_url", url },
      }),
    );
  }
  return rows;
}

async function isSafeExternalHttpUrl(raw: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;
  if (!parsed.hostname || isBlockedHostname(parsed.hostname)) return false;
  if (isPrivateAddress(parsed.hostname)) return false;

  try {
    const records = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
    return records.length > 0 && records.every((record) => !isPrivateAddress(record.address));
  } catch {
    return false;
  }
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  );
}

function isPrivateAddress(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "");
  const ipVersion = isIP(normalized);
  if (ipVersion === 0) return false;

  if (ipVersion === 6) {
    const lower = normalized.toLowerCase();
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("fe80:") ||
      lower.startsWith("::ffff:127.") ||
      lower.startsWith("::ffff:10.") ||
      lower.startsWith("::ffff:192.168.") ||
      lower.startsWith("::ffff:169.254.")
    );
  }

  const parts = normalized.split(".").map((part) => Number(part));
  const [a, b] = parts;
  if (a == null || b == null || parts.some((part) => !Number.isInteger(part))) return true;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function fileNameFromUrl(raw: string): string {
  const parsed = new URL(raw);
  let decodedPath = parsed.pathname;
  try {
    decodedPath = decodeURIComponent(parsed.pathname);
  } catch {
    decodedPath = parsed.pathname;
  }
  const base = path.basename(decodedPath);
  return base?.includes(".") ? base.slice(0, 128) : "remote-attachment";
}

function extensionForMime(contentType: string): string {
  const mime = contentType.toLowerCase();
  if (mime === "image/png") return ".png";
  if (mime === "image/jpeg") return ".jpg";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/webp") return ".webp";
  if (mime === "application/pdf") return ".pdf";
  if (mime.startsWith("text/")) return ".txt";
  return ".bin";
}
