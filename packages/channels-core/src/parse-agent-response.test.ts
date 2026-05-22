import { describe, expect, it } from "vitest";
import { parseAgentResponse } from "./parse-agent-response.js";

describe("parseAgentResponse", () => {
  it("extracts MEDIA tags and attachment markdown refs", () => {
    const attachmentId = "01ATTACHMENT123";
    const storageKey = `${"a".repeat(32)}.png`;
    const result = parseAgentResponse(
      `Here is the diagram.\nMEDIA:${storageKey}\n![screenshot](attachment:${attachmentId})`,
    );

    expect(result.plainText).toBe("Here is the diagram.");
    expect(result.storageKeys).toEqual([storageKey]);
    expect(result.attachmentIds).toEqual([attachmentId]);
    expect(
      result.parts.some((p) => p.type === "attachment" && p.attachmentId === attachmentId),
    ).toBe(true);
  });

  it("keeps external markdown images as placeholders", () => {
    const result = parseAgentResponse("See ![chart](https://example.com/chart.png) above.");
    expect(result.plainText).toContain("[Image: chart]");
    expect(result.attachmentIds).toHaveLength(0);
  });

  it("parses Hermes directives", () => {
    const result = parseAgentResponse("Hello [[audio_as_voice]] [[as_document]]");
    expect(result.directives.asVoice).toBe(true);
    expect(result.directives.asDocument).toBe(true);
    expect(result.plainText).toBe("Hello");
  });

  it("accepts structured outbound parts", () => {
    const result = parseAgentResponse([
      { type: "text", text: "Invoice attached." },
      { type: "attachment", attachmentId: "att-99" },
    ]);
    expect(result.plainText).toBe("Invoice attached.");
    expect(result.attachmentIds).toEqual(["att-99"]);
  });
});
