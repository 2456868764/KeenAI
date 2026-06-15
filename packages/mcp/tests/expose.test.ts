import { describe, expect, it } from "vitest";
import {
  KEENAI_EXPOSE_TOOLS,
  getKeenaiExposeServerCommand,
  listKeenaiExposeTools,
} from "../src/expose.js";

describe("KeenAI MCP expose", () => {
  it("lists built-in expose tools", () => {
    const tools = listKeenaiExposeTools();
    expect(tools.length).toBe(KEENAI_EXPOSE_TOOLS.length);
    expect(tools.map((t) => t.name)).toContain("keenai_search_help");
    expect(tools.map((t) => t.name)).toContain("keenai_run_custom_action");
  });

  it("returns stdio server command", () => {
    expect(getKeenaiExposeServerCommand()).toContain("packages/mcp/src/server.ts");
  });
});
