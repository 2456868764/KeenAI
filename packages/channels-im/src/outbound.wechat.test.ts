import { describe, expect, it } from "vitest";
import { planWeChatOutbound } from "./outbound/wechat.js";

describe("planWeChatOutbound", () => {
  it("plans text menus and temporary media uploads", () => {
    const actions = planWeChatOutbound({
      platform: "wechat",
      targetId: "openid-1",
      parts: [
        { type: "text", text: "Choose an option" },
        { type: "image", attachmentId: "image-1" },
      ],
      attachments: new Map([
        [
          "image-1",
          {
            attachmentId: "image-1",
            contentUrl: "https://cdn.example/image.jpg",
            contentType: "image/jpeg",
            fileName: "image.jpg",
          },
        ],
      ]),
      directives: {
        interaction: { buttons: [{ id: "billing", label: "Billing" }] },
      },
    });

    expect(actions).toEqual([
      {
        platform: "wechat",
        method: "message.send",
        toUser: "openid-1",
        text: "Choose an option",
        buttons: [{ id: "billing", label: "Billing" }],
      },
      {
        platform: "wechat",
        method: "media.uploadAndSend",
        toUser: "openid-1",
        mediaType: "image",
        fileUrl: "https://cdn.example/image.jpg",
        fileName: "image.jpg",
        contentType: "image/jpeg",
      },
    ]);
  });
});
