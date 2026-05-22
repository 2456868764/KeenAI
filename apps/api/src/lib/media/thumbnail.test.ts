import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseApiEnv } from "@keenai/shared";
import { describe, expect, it } from "vitest";
import { readUploadFile } from "../uploads.js";
import { generateVideoThumbnail } from "./thumbnail.js";

describe("generateVideoThumbnail", () => {
  it("writes stub thumbnail for video bytes", async () => {
    const env = parseApiEnv({
      NODE_ENV: "test",
      DATABASE_URL: ":memory:",
      THUMBNAIL_PROVIDER: "stub",
      UPLOAD_DIR: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../../../data/test-thumbnail",
      ),
    });

    const result = await generateVideoThumbnail(env, {
      data: new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]),
      contentType: "video/mp4",
      fileName: "clip.mp4",
    });

    expect(result.provider).toBe("stub");
    expect(result.thumbnailKey).toMatch(/^[a-f0-9]{32}\.jpg$/);

    const saved = await readUploadFile(env, result.thumbnailKey);
    expect(saved).not.toBeNull();
    expect(saved?.byteLength).toBeGreaterThan(0);
  });
});
