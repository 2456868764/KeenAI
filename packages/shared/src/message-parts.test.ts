import { describe, expect, it } from "vitest";
import { buildPlainTextFromParts, inferMessageKind } from "./message-parts.js";

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
    expect(buildPlainTextFromParts(parts, map)).toBe("Please reset my password.");
  });
});
