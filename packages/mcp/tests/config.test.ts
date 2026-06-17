import { describe, expect, it } from "vitest";
import { parseMcpServersJson, resolveMcpHostConfig } from "../src/config.js";
import { resolveBunCommand } from "../src/runtime.js";
import { qualifyMcpToolName } from "../src/tool-utils.js";

describe("MCP config", () => {
  it("returns disabled config when host is off", () => {
    expect(resolveMcpHostConfig({ enabled: false })).toEqual({
      enabled: false,
      servers: [],
    });
  });

  it("parses server JSON when host is enabled", () => {
    const config = resolveMcpHostConfig({
      enabled: true,
      serversJson: JSON.stringify([{ id: "demo", command: "node", args: ["server.js"] }]),
    });
    expect(config.enabled).toBe(true);
    expect(config.servers).toHaveLength(1);
    expect(config.servers[0]?.id).toBe("demo");
  });
});

describe("qualifyMcpToolName", () => {
  it("builds copilot-safe qualified names", () => {
    expect(qualifyMcpToolName("stub", "echo")).toBe("mcp_stub__echo");
    expect(qualifyMcpToolName("brave-search", "web_search")).toBe("mcp_brave_search__web_search");
  });
});

describe("parseMcpServersJson", () => {
  it("falls back to bundled stub server when JSON is empty", () => {
    const servers = parseMcpServersJson(undefined);
    expect(servers).toHaveLength(1);
    expect(servers[0]?.id).toBe("stub");
    expect(servers[0]?.command).toBe(resolveBunCommand());
  });
});
