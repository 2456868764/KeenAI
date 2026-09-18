import type { ImPendingAttachment } from "@keenai/channels-im";
import { parseApiEnv } from "@keenai/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadImAttachment } from "./im-download.js";

const env = parseApiEnv({
  NODE_ENV: "production",
  DATABASE_URL: "file::memory:",
  JWT_SECRET: "test-secret-test-secret-test-secret",
  APP_URL: "http://localhost:3000",
});

afterEach(() => vi.unstubAllGlobals());

describe("downloadImAttachment", () => {
  it("uses connection credentials for Telegram media", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, result: { file_path: "voice/file.ogg" } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(Uint8Array.from([1, 2, 3]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadImAttachment(env, attachment("telegram", "file-id"), {
      botToken: "connection-token",
    });

    expect([...result]).toEqual([1, 2, 3]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("botconnection-token/getFile");
  });

  it("downloads Discord attachment URLs without Slack credentials", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(Uint8Array.from([4, 5]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadImAttachment(
      env,
      attachment("discord", "https://cdn.discordapp.com/file.png"),
    );

    expect([...result]).toEqual([4, 5]);
    expect(fetchMock).toHaveBeenCalledWith("https://cdn.discordapp.com/file.png");
  });

  it("does not persist placeholder media in production when credentials are missing", async () => {
    await expect(downloadImAttachment(env, attachment("telegram", "file-id"))).rejects.toThrow(
      "telegram_bot_token_missing",
    );
  });
});

function attachment(
  platform: ImPendingAttachment["platform"],
  platformRef: string,
): ImPendingAttachment {
  return {
    platform,
    platformRef,
    fileName: "file.png",
    contentType: "image/png",
    sizeBytes: 10,
  };
}
