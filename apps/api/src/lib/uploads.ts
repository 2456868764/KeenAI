import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ApiEnv } from "@keenai/shared";
import { findRepoRoot } from "@keenai/shared";

const pending = new Map<
  string,
  { storageKey: string; contentType: string; expiresAt: number }
>();

export function resolveUploadDir(env: ApiEnv): string {
  if (env.UPLOAD_DIR) return path.resolve(env.UPLOAD_DIR);
  return path.join(findRepoRoot(), "data", "uploads");
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
  const dir = resolveUploadDir(env);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, storageKey);
  await writeFile(filePath, body);
  return filePath;
}

export function fileChecksum(body: Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}
