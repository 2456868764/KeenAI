import { describe, expect, it } from "vitest";
import { planWeComOutbound } from "./outbound/wecom.js";

describe("planWeComOutbound", () => {
  it("plans native media upload and send actions", () => {
    const actions = planWeComOutbound({
      platform: "wecom",
      targetId: "user-1",
      parts: [
        { type: "audio", attachmentId: "voice-1" },
        { type: "file", attachmentId: "file-1", fileName: "guide.pdf" },
      ],
      attachments: new Map([
        [
          "voice-1",
          {
            attachmentId: "voice-1",
            contentUrl: "https://cdn.example/answer.amr",
            contentType: "audio/amr",
            fileName: "answer.amr",
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
      channelAttributes: { wecomAgentId: 1001 },
    });

    expect(actions).toEqual([
      {
        platform: "wecom",
        method: "media.uploadAndSend",
        toUser: "user-1",
        agentId: 1001,
        mediaType: "voice",
        fileUrl: "https://cdn.example/answer.amr",
        fileName: "answer.amr",
        contentType: "audio/amr",
      },
      {
        platform: "wecom",
        method: "media.uploadAndSend",
        toUser: "user-1",
        agentId: 1001,
        mediaType: "file",
        fileUrl: "https://cdn.example/guide.pdf",
        fileName: "guide.pdf",
        contentType: "application/pdf",
      },
    ]);
  });
});
