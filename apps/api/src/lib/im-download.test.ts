import type { ImPendingAttachment } from "@keenai/channels-im";
import { parseApiEnv } from "@keenai/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetProviderTokenCacheForTests } from "./channel-provider-tokens.js";
import { downloadImAttachment } from "./im-download.js";

const env = parseApiEnv({
  NODE_ENV: "production",
  DATABASE_URL: "file::memory:",
  JWT_SECRET: "test-secret-test-secret-test-secret",
  APP_URL: "http://localhost:3000",
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetProviderTokenCacheForTests();
});

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
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.discordapp.com/file.png",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("resolves Slack file IDs before downloading protected content", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            file: { url_private_download: "https://files.slack.com/protected/file.png" },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(Uint8Array.from([21, 22]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadImAttachment(env, attachment("slack", "F123"), {
      botToken: "xoxb-connection-token",
    });

    expect([...result]).toEqual([21, 22]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("files.info?file=F123");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://files.slack.com/protected/file.png");
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual({
      Authorization: "Bearer xoxb-connection-token",
    });
  });

  it("does not persist placeholder media in production when credentials are missing", async () => {
    await expect(downloadImAttachment(env, attachment("telegram", "file-id"))).rejects.toThrow(
      "telegram_bot_token_missing",
    );
  });

  it("downloads Feishu message resources with the tenant token", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(Uint8Array.from([6, 7]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadImAttachment(
      env,
      attachment(
        "feishu",
        JSON.stringify({ messageId: "om-1", resourceKey: "img-1", resourceType: "image" }),
      ),
      { tenantAccessToken: "tenant-token" },
    );

    expect([...result]).toEqual([6, 7]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/messages/om-1/resources/img-1");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
      Authorization: "Bearer tenant-token",
    });
  });

  it("resolves and downloads DingTalk robot files", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accessToken: "dingtalk-token" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ downloadUrl: "https://download.example/file" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(Uint8Array.from([8, 9]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadImAttachment(env, attachment("dingtalk", "download-code"), {
      appKey: "app-key",
      appSecret: "app-secret",
      robotCode: "robot-code",
    });

    expect([...result]).toEqual([8, 9]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("messageFiles/download");
  });

  it("uses a hydrated DingTalk ISV corp token and the callback robot code", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ downloadUrl: "https://download.example/isv-file" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(Uint8Array.from([12, 13]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadImAttachment(
      env,
      attachment(
        "dingtalk",
        JSON.stringify({ downloadCode: "isv-download-code", robotCode: "isv-robot-code" }),
      ),
      {
        appKey: "suite-key",
        appSecret: "suite-secret",
        accessToken: "corp-token",
      },
    );

    expect([...result]).toEqual([12, 13]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.dingtalk.com/v1.0/robot/messageFiles/download",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({ downloadCode: "isv-download-code", robotCode: "isv-robot-code" }),
    );
  });

  it("downloads WeCom temporary media", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(Uint8Array.from([10, 11]), {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadImAttachment(env, attachment("wecom", "media-1"), {
      accessToken: "wecom-token",
    });

    expect([...result]).toEqual([10, 11]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("media_id=media-1");
  });

  it("downloads WeChat Official Account temporary media", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(Uint8Array.from([14, 15]), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadImAttachment(env, attachment("wechat", "media-1"), {
      accessToken: "wechat-token",
    });

    expect([...result]).toEqual([14, 15]);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("media_id=media-1");
  });

  it("stops reading chunked attachments when the byte limit is exceeded", async () => {
    const oversizedChunk = new Uint8Array(env.UPLOAD_MAX_BYTES + 1);
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(oversizedChunk);
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      downloadImAttachment(env, attachment("discord", "https://cdn.discordapp.com/oversized.bin")),
    ).rejects.toThrow("im_attachment_too_large");
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
