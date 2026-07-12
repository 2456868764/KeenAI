import { describe, expect, it } from "vitest";
import { attachmentMetadataSchema } from "./attachment-metadata.js";

describe("attachmentMetadataSchema", () => {
  it("keeps agent URL source metadata", () => {
    const metadata = attachmentMetadataSchema.parse({
      source: "agent_url",
      url: "https://cdn.example.com/diagram.png",
    });

    expect(metadata.source).toBe("agent_url");
    expect(metadata.url).toBe("https://cdn.example.com/diagram.png");
  });
});
