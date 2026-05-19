import { parseApiEnv } from "@keenai/shared";
import { describe, expect, it } from "vitest";
import { createPresignedUpload, fileChecksum } from "./lib/uploads.js";

describe("uploads", () => {
  it("presigns and validates size", () => {
    const env = parseApiEnv({ NODE_ENV: "test", DATABASE_URL: ":memory:" });
    const presigned = createPresignedUpload(
      env,
      { fileName: "note.txt", contentType: "text/plain", sizeBytes: 12 },
      "http://localhost:8090",
    );
    expect(presigned.uploadUrl).toContain(presigned.uploadId);
    expect(presigned.storageKey).toContain(presigned.uploadId);

    expect(() =>
      createPresignedUpload(
        env,
        { fileName: "big.bin", contentType: "application/octet-stream", sizeBytes: env.UPLOAD_MAX_BYTES + 1 },
        "http://localhost:8090",
      ),
    ).toThrow("file_too_large");
  });

  it("checksums file bytes", () => {
    const sum = fileChecksum(new TextEncoder().encode("hello"));
    expect(sum).toHaveLength(64);
  });
});
