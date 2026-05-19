import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseMimeSource } from "../src/parse.js";

const fixture = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/simple-reply.eml"),
);

describe("parseMimeSource", () => {
  it("parses plain MIME with threading headers", async () => {
    const parsed = await parseMimeSource(fixture);
    expect(parsed.from.address).toBe("customer@example.com");
    expect(parsed.subject).toContain("billing");
    expect(parsed.inReplyTo).toBe("<msg1@example.com>");
    expect(parsed.references).toContain("<msg1@example.com>");
    expect(parsed.plainText).toContain("billing question");
  });
});
