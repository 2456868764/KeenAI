import type { ChannelConnectionConfig, ChannelOutboundEnvelope } from "@keenai/channels-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getChannelPluginRegistry, resetChannelPluginRegistryForTests } from "./channel-plugins.js";

afterEach(() => {
  vi.unstubAllGlobals();
  resetChannelPluginRegistryForTests();
});

describe("channel provider media execution", () => {
  it("classifies attachment download timeouts as safe to retry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")),
    );
    const plugin = getChannelPluginRegistry().get("slack");

    let failure: unknown;
    try {
      await plugin.send(
        mediaEnvelope("slack", {
          type: "file",
          attachmentId: "att-1",
          fileName: "invoice.pdf",
        }),
        connection("slack", { botToken: "xoxb-token" }),
      );
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ message: "attachment_download_timeout", status: 503 });
    expect(plugin.classifyError(failure)).toMatchObject({
      disposition: "retryable",
      code: "provider_unavailable",
    });
  });

  it("stops reading outbound media without Content-Length at the byte limit", async () => {
    const oversizedChunk = new Uint8Array(25 * 1024 * 1024 + 1);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(oversizedChunk);
              controller.close();
            },
          }),
          { status: 200 },
        ),
      ),
    );
    const plugin = getChannelPluginRegistry().get("discord");

    await expect(
      plugin.send(
        mediaEnvelope("discord", { type: "image", attachmentId: "att-1" }),
        connection("discord", { botToken: "discord-token" }),
      ),
    ).rejects.toMatchObject({ message: "attachment_too_large", status: 413 });
  });

  it("uses Slack's external upload flow instead of posting a file URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(binaryResponse("invoice"))
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, upload_url: "https://upload.slack.test", file_id: "F1" }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, files: [{ id: "F1" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getChannelPluginRegistry()
      .get("slack")
      .send(
        mediaEnvelope("slack", { type: "file", attachmentId: "att-1", fileName: "invoice.pdf" }),
        connection("slack", { botToken: "xoxb-token" }),
      );

    expect(result.providerMessageIds).toEqual(["F1"]);
    expect(result.providerMessageRefs).toEqual([
      {
        providerMessageId: "F1",
        providerAction: "files.uploadV2",
        resourceType: "file",
        actionIndex: 0,
      },
    ]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "https://cdn.example/invoice.pdf",
      "https://slack.com/api/files.getUploadURLExternal",
      "https://upload.slack.test",
      "https://slack.com/api/files.completeUploadExternal",
    ]);
    expect(fetchMock.mock.calls[2]?.[1]?.body).toBeInstanceOf(ArrayBuffer);
  });

  it("sends Discord attachments as multipart messages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(binaryResponse("png"))
      .mockResolvedValueOnce(jsonResponse({ id: "discord-message-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getChannelPluginRegistry()
      .get("discord")
      .send(
        mediaEnvelope("discord", { type: "image", attachmentId: "att-1", alt: "Screenshot" }),
        connection("discord", { botToken: "discord-token" }),
      );

    expect(result.providerMessageIds).toEqual(["discord-message-1"]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/channels/thread-1/messages");
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBeInstanceOf(FormData);
  });

  it("uploads Feishu media before creating the message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(binaryResponse("png"))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { image_key: "img-1" } }))
      .mockResolvedValueOnce(jsonResponse({ code: 0, data: { message_id: "om-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getChannelPluginRegistry()
      .get("feishu")
      .send(
        mediaEnvelope("feishu", { type: "image", attachmentId: "att-1" }),
        connection("feishu", { tenantAccessToken: "tenant-token" }),
      );

    expect(result.providerMessageIds).toEqual(["om-1"]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "https://open.feishu.cn/open-apis/im/v1/images",
    );
    const sendBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(sendBody).toMatchObject({ msg_type: "image" });
    expect(JSON.parse(sendBody.content)).toEqual({ image_key: "img-1" });
  });

  it("uploads WeCom temporary media before sending it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(binaryResponse("pdf"))
      .mockResolvedValueOnce(jsonResponse({ errcode: 0, media_id: "media-1" }))
      .mockResolvedValueOnce(jsonResponse({ errcode: 0, msgid: "wecom-message-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getChannelPluginRegistry()
      .get("wecom")
      .send(
        mediaEnvelope("wecom", { type: "file", attachmentId: "att-1", fileName: "guide.pdf" }),
        connection("wecom", { accessToken: "access-token" }, { wecomAgentId: 1001 }),
      );

    expect(result.providerMessageIds).toEqual(["wecom-message-1"]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/media/upload?");
    const sendBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(sendBody).toMatchObject({ msgtype: "file", file: { media_id: "media-1" } });
  });

  it("uploads WeChat Official Account temporary media before sending it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(binaryResponse("png"))
      .mockResolvedValueOnce(jsonResponse({ errcode: 0, media_id: "media-1" }))
      .mockResolvedValueOnce(jsonResponse({ errcode: 0, msgid: "wechat-message-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getChannelPluginRegistry()
      .get("wechat")
      .send(
        mediaEnvelope("wechat", { type: "image", attachmentId: "att-1" }),
        connection("wechat", { accessToken: "access-token" }),
      );

    expect(result.providerMessageIds).toEqual(["wechat-message-1"]);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/media/upload?");
    const sendBody = JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body));
    expect(sendBody).toMatchObject({ msgtype: "image", image: { media_id: "media-1" } });
  });
});

function connection(
  channelType: ChannelConnectionConfig["channelType"],
  credentials: Record<string, unknown>,
  settings: Record<string, unknown> = {},
): ChannelConnectionConfig {
  return {
    connectionId: `${channelType}-connection`,
    orgId: "org-1",
    brandId: "brand-1",
    channelType,
    credentials,
    settings,
  };
}

function mediaEnvelope(
  channelType: ChannelOutboundEnvelope["channelType"],
  part: ChannelOutboundEnvelope["parts"][number],
): ChannelOutboundEnvelope {
  return {
    deliveryId: "delivery-1",
    orgId: "org-1",
    brandId: "brand-1",
    connectionId: `${channelType}-connection`,
    conversationId: "conversation-1",
    messageId: "message-1",
    channelType,
    externalThreadId: "thread-1",
    parts: [part],
    metadata: {
      attachments: [
        {
          attachmentId: "att-1",
          contentUrl: "https://cdn.example/invoice.pdf",
          contentType: part.type === "image" ? "image/png" : "application/pdf",
          fileName: part.type === "file" ? part.fileName : "screenshot.png",
        },
      ],
    },
  };
}

function binaryResponse(value: string): Response {
  return new Response(new TextEncoder().encode(value), {
    status: 200,
    headers: { "content-length": String(value.length) },
  });
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
