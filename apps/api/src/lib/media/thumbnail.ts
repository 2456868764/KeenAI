import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ApiEnv } from "@keenai/shared";
import { saveUploadFile } from "../uploads.js";

const execFileAsync = promisify(execFile);

/** Minimal valid 1×1 PNG for stub thumbnails. */
export const PLACEHOLDER_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

export type ThumbnailResult = {
  thumbnailKey: string;
  width?: number;
  height?: number;
  provider: "stub" | "ffmpeg";
};

export function createThumbnailStorageKey(): string {
  return `${randomBytes(16).toString("hex")}.jpg`;
}

export async function generateVideoThumbnail(
  env: ApiEnv,
  input: {
    data: Uint8Array;
    contentType: string;
    fileName?: string | null;
  },
): Promise<ThumbnailResult> {
  const provider = resolveThumbnailProvider(env);
  let imageBytes: Uint8Array | null = null;
  let thumbProvider: ThumbnailResult["provider"] = "stub";

  if (provider === "ffmpeg") {
    imageBytes = await extractFfmpegThumbnail(input.data, input.contentType);
    if (imageBytes) thumbProvider = "ffmpeg";
  }

  if (!imageBytes) {
    imageBytes = PLACEHOLDER_PNG;
    thumbProvider = "stub";
  }

  const thumbnailKey = createThumbnailStorageKey();
  await saveUploadFile(env, thumbnailKey, imageBytes);

  return {
    thumbnailKey,
    width: thumbProvider === "stub" ? 1 : undefined,
    height: thumbProvider === "stub" ? 1 : undefined,
    provider: thumbProvider,
  };
}

function resolveThumbnailProvider(env: ApiEnv): "stub" | "ffmpeg" {
  if (env.THUMBNAIL_PROVIDER === "ffmpeg") return "ffmpeg";
  if (env.THUMBNAIL_PROVIDER === "stub") return "stub";
  return "stub";
}

async function extractFfmpegThumbnail(
  data: Uint8Array,
  contentType: string,
): Promise<Uint8Array | null> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "keenai-thumb-"));
  const ext = extensionForVideoMime(contentType);
  const inputPath = path.join(dir, `input.${ext}`);
  const outputPath = path.join(dir, "frame.jpg");

  try {
    await writeFile(inputPath, data);
    await execFileAsync(
      "ffmpeg",
      ["-y", "-i", inputPath, "-ss", "00:00:00.5", "-vframes", "1", "-f", "image2", outputPath],
      { timeout: 30_000 },
    );
    return new Uint8Array(await readFile(outputPath));
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function extensionForVideoMime(contentType: string): string {
  const mime = contentType.toLowerCase();
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mp4") || mime.includes("quicktime")) return "mp4";
  if (mime.includes("ogg")) return "ogv";
  return "bin";
}
