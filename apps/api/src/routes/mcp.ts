import { getKeenaiExposeServerCommand, listKeenaiExposeTools } from "@keenai/mcp";
import { API_VERSION } from "@keenai/shared";
import { Hono } from "hono";
import { getSharedMcpHost, listConfiguredMcpServers } from "../lib/mcp-tools.js";
import { requireAuth } from "../middleware/auth.js";
import type { AppVariables } from "../types.js";

export function mcpRoutes() {
  const r = new Hono<{ Variables: AppVariables }>();
  const prefix = `/api/${API_VERSION}/mcp`;

  r.get(`${prefix}/servers`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const env = c.get("env");
    return c.json({
      enabled: env.MCP_HOST_ENABLED,
      servers: listConfiguredMcpServers(env),
      connected: (await getSharedMcpHost(env))?.getConnectedServerIds() ?? [],
    });
  });

  r.get(`${prefix}/tools`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    const host = await getSharedMcpHost(c.get("env"));
    if (!host) return c.json({ items: [] });

    const tools = await host.listTools();
    return c.json({
      items: tools.map((tool) => ({
        serverId: tool.serverId,
        name: tool.name,
        qualifiedName: tool.qualifiedName,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    });
  });

  r.get(`${prefix}/expose/tools`, requireAuth(), async (c) => {
    const auth = c.get("auth");
    if (!auth) return c.json({ error: "unauthorized" }, 401);

    return c.json({
      transport: "stdio",
      command: getKeenaiExposeServerCommand(),
      items: listKeenaiExposeTools(),
    });
  });

  return r;
}
