import { describe, expect, it } from "vitest";
import { parseImportArgv } from "./import.js";

describe("keenai import CLI", () => {
  it("parses intercom import args", () => {
    const args = parseImportArgv([
      "intercom",
      "--file",
      "./export.zip",
      "--org-slug",
      "acme",
      "--dry-run",
    ]);
    expect(args?.provider).toBe("intercom");
    expect(args?.file).toBe("./export.zip");
    expect(args?.orgSlug).toBe("acme");
    expect(args?.dryRun).toBe(true);
  });

  it("parses zendesk import args", () => {
    const args = parseImportArgv([
      "zendesk",
      "--tickets",
      "./tickets.json",
      "--kb",
      "./articles.json",
      "--org-slug",
      "acme",
    ]);
    expect(args?.provider).toBe("zendesk");
    expect(args?.tickets).toBe("./tickets.json");
    expect(args?.kb).toBe("./articles.json");
  });
});
