import { describe, expect, it } from "vitest";
import { planFeishuOutbound } from "./outbound/feishu.js";

describe("planFeishuOutbound", () => {
  it("plans im.message.create for text parts", () => {
    const actions = planFeishuOutbound({
      platform: "feishu",
      targetId: "oc_456",
      parts: [{ type: "text", text: "Thanks for reaching out." }],
      attachments: new Map(),
    });

    expect(actions).toEqual([
      {
        platform: "feishu",
        method: "im.message.create",
        receiveId: "oc_456",
        receiveIdType: "chat_id",
        text: "Thanks for reaching out.",
      },
    ]);
  });

  it("uploads and sends image and file parts", () => {
    const actions = planFeishuOutbound({
      platform: "feishu",
      targetId: "oc_456",
      parts: [
        { type: "image", attachmentId: "image-1" },
        { type: "file", attachmentId: "file-1", fileName: "guide.pdf" },
      ],
      attachments: new Map([
        [
          "image-1",
          {
            attachmentId: "image-1",
            contentUrl: "https://cdn.example/image.png",
            contentType: "image/png",
            fileName: "image.png",
          },
        ],
        [
          "file-1",
          {
            attachmentId: "file-1",
            contentUrl: "https://cdn.example/guide.pdf",
            contentType: "application/pdf",
            fileName: "guide.pdf",
          },
        ],
      ]),
    });

    expect(actions.map((action) => action.method)).toEqual([
      "im.media.uploadAndSend",
      "im.media.uploadAndSend",
    ]);
    expect(actions[0]).toMatchObject({ mediaType: "image", contentType: "image/png" });
    expect(actions[1]).toMatchObject({ mediaType: "file", fileName: "guide.pdf" });
  });
});
