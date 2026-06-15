"use client";

import { listMcpExposeTools, listMcpHostTools, listMcpServers } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

export function McpPanel() {
  const serversQuery = useQuery({ queryKey: ["mcp-servers"], queryFn: listMcpServers });
  const hostToolsQuery = useQuery({ queryKey: ["mcp-host-tools"], queryFn: listMcpHostTools });
  const exposeQuery = useQuery({ queryKey: ["mcp-expose-tools"], queryFn: listMcpExposeTools });

  const loading = serversQuery.isLoading || hostToolsQuery.isLoading || exposeQuery.isLoading;

  if (loading) {
    return <Loader2 className="size-5 animate-spin text-[hsl(var(--muted-foreground))]" />;
  }

  const servers = serversQuery.data;
  const hostTools = hostToolsQuery.data?.items ?? [];
  const expose = exposeQuery.data;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
        <h3 className="mb-2 text-sm font-medium">MCP Host (consume external tools)</h3>
        <p className="mb-2 text-xs text-[hsl(var(--muted-foreground))]">
          {servers?.enabled
            ? `Connected: ${(servers.connected ?? []).join(", ") || "none"}`
            : "Set MCP_HOST_ENABLED=true and MCP_SERVERS in API env."}
        </p>
        {hostTools.length === 0 ? (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            No external MCP tools loaded.
          </p>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
            {hostTools.map((tool) => (
              <li key={tool.qualifiedName} className="rounded bg-[hsl(var(--surface-2))] px-2 py-1">
                <span className="font-mono">{tool.qualifiedName}</span>
                {tool.description ? (
                  <span className="text-[hsl(var(--muted-foreground))]"> · {tool.description}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--surface-1))] p-4">
        <h3 className="mb-2 text-sm font-medium">KeenAI MCP Server (expose)</h3>
        <p className="mb-2 break-all font-mono text-xs text-[hsl(var(--muted-foreground))]">
          {expose?.transport} · {expose?.command}
        </p>
        <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
          {(expose?.items ?? []).map((tool) => (
            <li key={tool.name} className="rounded bg-[hsl(var(--surface-2))] px-2 py-1">
              <span className="font-mono">{tool.name}</span>
              <span className="text-[hsl(var(--muted-foreground))]"> · {tool.description}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
