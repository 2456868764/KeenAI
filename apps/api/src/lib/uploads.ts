import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ApiEnv } from "@keenai/shared";
import { findRepoRoot } from "@keenai/shared";

const uploadsModuleDir = path.dirname(fileURLToPath(import.meta.url));

const pending = new Map<string, { storageKey: string; contentType: string; expiresAt: number }>();

export function resolveUploadDir(env: ApiEnv): string {
  if (env.UPLOAD_DIR) return path.resolve(env.UPLOAD_DIR);
  return path.join(findRepoRoot(uploadsModuleDir), "data", "uploads");
}

export function createPresignedUpload(
  env: ApiEnv,
  input: { fileName: string; contentType: string; sizeBytes: number },
  apiBaseUrl: string,
) {
  if (input.sizeBytes > env.UPLOAD_MAX_BYTES) {
    throw new Error("file_too_large");
  }

  const uploadId = randomBytes(16).toString("hex");
  const ext = path.extname(input.fileName).slice(0, 32);
  const storageKey = `${uploadId}${ext}`;
  const expiresAt = Date.now() + 15 * 60_000;

  pending.set(uploadId, {
    storageKey,
    contentType: input.contentType,
    expiresAt,
  });

  return {
    uploadId,
    storageKey,
    uploadUrl: `${apiBaseUrl}/api/v1/uploads/${uploadId}`,
    expiresAt: new Date(expiresAt).toISOString(),
    maxBytes: env.UPLOAD_MAX_BYTES,
  };
}

export function consumePresignedUpload(uploadId: string) {
  const entry = pending.get(uploadId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    pending.delete(uploadId);
    return null;
  }
  pending.delete(uploadId);
  return entry;
}

export async function saveUploadFile(
  env: ApiEnv,
  storageKey: string,
  body: Uint8Array,
): Promise<string> {
  if (!isValidStorageKey(storageKey)) {
    throw new Error("invalid_storage_key");
  }
  const dir = resolveUploadDir(env);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, storageKey);
  await writeFile(filePath, body);
  return filePath;
}

export function fileChecksum(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

const STORAGE_KEY_RE = /^[a-f0-9]{32}(\.[a-zA-Z0-9]{1,32})?$/;

export function isValidStorageKey(storageKey: string): boolean {
  return STORAGE_KEY_RE.test(storageKey);
}

export function resolveUploadFilePath(env: ApiEnv, storageKey: string): string {
  if (!isValidStorageKey(storageKey)) {
    throw new Error("invalid_storage_key");
  }
  return path.join(resolveUploadDir(env), storageKey);
}

export async function readUploadFile(env: ApiEnv, storageKey: string): Promise<Uint8Array | null> {
  try {
    return await readFile(resolveUploadFilePath(env, storageKey));
  } catch {
    return null;
  }
}

export function guessContentType(storageKey: string): string {
  const ext = path.extname(storageKey).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
