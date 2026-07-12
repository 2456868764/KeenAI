import { describe, expect, it } from "vitest";
import {
  buildPlainTextFromParts,
  inboundMessageSchema,
  inferMessageKind,
  messageMetadataSchema,
} from "./message-parts.js";

describe("message-parts", () => {
  it("infers photo kind for single image part", () => {
    const parts = [{ type: "image" as const, attachmentId: "att1" }];
    expect(inferMessageKind(parts)).toBe("photo");
  });

  it("builds plain text placeholders", () => {
    const parts = [
      { type: "text" as const, text: "see attached" },
      { type: "image" as const, attachmentId: "att1" },
    ];
    const map = new Map([["att1", { fileName: "photo.png", contentType: "image/png" }]]);
    expect(buildPlainTextFromParts(parts, map)).toContain("see attached");
    expect(buildPlainTextFromParts(parts, map)).toContain("[Image: photo.png]");
    expect(inferMessageKind(parts)).toBe("photo");
  });

  it("infers mixed kind for multiple media parts", () => {
    const parts = [
      { type: "image" as const, attachmentId: "att1" },
      { type: "image" as const, attachmentId: "att2" },
    ];
    expect(inferMessageKind(parts)).toBe("mixed");
  });

  it("uses audio transcript when available", () => {
    const parts = [{ type: "audio" as const, attachmentId: "att-voice" }];
    const map = new Map([
      [
        "att-voice",
        {
          fileName: "note.webm",
          contentType: "audio/webm",
          transcript: "Please reset my password.",
        },
      ],
    ]);
    expect(buildPlainTextFromParts(parts, map)).toBe('[Voice: "Please reset my password."]');
  });

  it("uses image vision summary and extracted file text when available", () => {
    const parts = [
      { type: "image" as const, attachmentId: "att-image" },
      { type: "file" as const, attachmentId: "att-file", fileName: "manual.txt" },
    ];
    const map = new Map([
      [
        "att-image",
        {
          fileName: "photo.png",
          contentType: "image/png",
          visionSummary: "damaged package label",
        },
      ],
      [
        "att-file",
        {
          fileName: "manual.txt",
          contentType: "text/plain",
          extractedText: "Reset steps",
        },
      ],
    ]);

    expect(buildPlainTextFromParts(parts, map)).toBe(
      "[Image: damaged package label]\n[File: manual.txt]\nReset steps",
    );
  });

  it("validates canonical inbound message and message metadata", () => {
    expect(
      inboundMessageSchema.parse({
        parts: [{ type: "text", text: "replying with an image" }],
        plainText: "replying with an image",
        messageKind: "text",
        metadata: {
          platformMessageId: "100",
          replyToMessageId: "99",
          replyToPlainText: "previous text",
        },
      }).metadata?.replyToPlainText,
    ).toBe("previous text");

    expect(
      messageMetadataSchema.parse({
        messageKind: "photo",
        enrichmentStatus: "pending",
        imageInputMode: "native",
        mediaGroupId: "album-1",
      }).mediaGroupId,
    ).toBe("album-1");
  });
});
