import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { defaultStubServerConfig } from "../src/config.js";
import { McpHost } from "../src/host.js";
import { qualifyMcpToolName } from "../src/tool-utils.js";

const stubServerPath = fileURLToPath(new URL("../src/stub-server.ts", import.meta.url));

describe("McpHost", () => {
  const host = new McpHost();

  beforeAll(async () => {
    const config = defaultStubServerConfig();
    config.args = [stubServerPath];
    await host.connectServer(config);
  }, 15_000);

  afterAll(async () => {
    await host.close();
  }, 10_000);

  it("lists echo tool from stub server", async () => {
    expect(host.getConnectedServerIds()).toContain("stub");
    const tools = await host.listTools("stub");
    expect(tools.some((tool) => tool.name === "echo")).toBe(true);
    expect(tools.find((tool) => tool.name === "echo")?.qualifiedName).toBe(
      qualifyMcpToolName("stub", "echo"),
    );
  });

  it("calls echo tool on the stub server", async () => {
    const result = await host.callTool("stub", "echo", { message: "hello-mcp" });
    expect(result).toBe("hello-mcp");
  });
});
