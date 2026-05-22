import { describe, expect, it, vi } from "vitest";
import { AgentMemoryClient } from "./client.js";
import { agentMemoryProject, resolveAgentMemoryConfig } from "./config.js";
import { mapSummaryToRemember } from "./mapping.js";
import {
  probeAgentMemory,
  recallFromAgentMemory,
  syncSummaryToAgentMemory,
} from "./sync.js";

describe("agentmemory mapping", () => {
  it("maps sealed summary to remember payload", () => {
    const body = mapSummaryToRemember({
      orgId: "org_1",
      brandId: "brand_1",
      scopeKey: "conv:abc",
      title: "Billing thread",
      summary: "Customer asked about invoice.",
      provenance: { chunkIds: ["c1"], messageIds: ["m1"], keyEvents: ["invoice"] },
      kind: "seal",
    });

    expect(body.project).toBe("keenai:org_1:brand_1");
    expect(body.type).toBe("conversation");
    expect(body.sessionIds).toEqual(["m1"]);
    expect(body.concepts).toContain("memory-tree");
  });
});

describe("agentmemory client", () => {
  it("posts remember and parses response", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ id: "mem_123" }, { status: 200 }),
    ) as unknown as typeof fetch;

    const client = new AgentMemoryClient({
      url: "http://localhost:3111",
      fetchImpl,
    });

    const res = await client.remember({
      project: "demo",
      title: "k",
      content: "v",
      type: "fact",
    });

    expect(res.id).toBe("mem_123");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("reports livez status", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
    const client = new AgentMemoryClient({ url: "http://127.0.0.1:3111", fetchImpl });
    await expect(client.livez()).resolves.toBe(true);
  });
});

describe("agentmemory sync", () => {
  it("skips sync when disabled", async () => {
    const config = resolveAgentMemoryConfig({ MEMORY_TREE_AGENTMEMORY_SYNC: false });
    const result = await syncSummaryToAgentMemory(config, {
      orgId: "org",
      brandId: "brand",
      scopeKey: "conv:x",
      title: "t",
      summary: "s",
      provenance: { chunkIds: [], messageIds: [] },
      kind: "seal",
    });
    expect(result.synced).toBe(false);
  });

  it("recalls via smart-search when daemon responds", async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { query?: string };
      if (body.query) {
        return Response.json(
          {
            results: [
              {
                id: "mem_1",
                title: "billing",
                content: "invoice help",
                project: agentMemoryProject("org", "brand"),
                score: 0.9,
              },
            ],
          },
          { status: 200 },
        );
      }
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const config = {
      syncEnabled: true,
      url: "http://127.0.0.1:3111",
      timeoutMs: 1000,
    };

    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const hits = await recallFromAgentMemory(config, {
        orgId: "org",
        brandId: "brand",
        q: "billing",
        limit: 5,
      });

      expect(hits).toHaveLength(1);
      expect(hits[0]?.score).toBe(0.9);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("probes daemon health", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes("livez")) return new Response(null, { status: 200 });
      if (String(url).includes("health")) return Response.json({ memories: 42 });
      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;

    const client = new AgentMemoryClient({ url: "http://127.0.0.1:3111", fetchImpl });
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const status = await probeAgentMemory({
        syncEnabled: false,
        url: "http://127.0.0.1:3111",
        timeoutMs: 1000,
      });
      expect(status.reachable).toBe(true);
      expect(status.memories).toBe(42);
    } finally {
      globalThis.fetch = original;
    }
  });
});
