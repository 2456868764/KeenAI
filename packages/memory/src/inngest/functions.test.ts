import { Inngest } from "inngest";
import { describe, expect, it, vi } from "vitest";
import {
  MEMORY_CONSOLIDATE_CRON_DEFAULT,
  MEMORY_DECAY_CRON_DEFAULT,
  MEMORY_DIGEST_CRON_DEFAULT,
  MEMORY_FLUSH_STALE_CRON_DEFAULT,
  MEMORY_INNGEST_EVENTS,
  createMemoryInngestFunctions,
} from "./functions.js";

describe("createMemoryInngestFunctions", () => {
  const handlers = {
    processAdmittedChunk: vi.fn(async () => ({ summaryIds: [] })),
    extractFacts: vi.fn(async () => ({})),
    extractEntities: vi.fn(async () => ({})),
    digestDaily: vi.fn(async () => ({})),
    flushStaleBuffers: vi.fn(async () => ({})),
    consolidate: vi.fn(async () => ({})),
    decaySweep: vi.fn(async () => ({})),
  };

  it("registers extract, digest, and consolidation cron functions", () => {
    const client = new Inngest({ id: "test" });
    const fns = createMemoryInngestFunctions(client, handlers);

    expect(fns).toHaveLength(10);
    expect(fns.map((fn) => fn.id())).toEqual([
      "keenai-memory-extract-chunk",
      "keenai-memory-extract-facts",
      "keenai-memory-extract-entities",
      "keenai-memory-digest-daily",
      "keenai-memory-digest-daily-cron",
      "keenai-memory-flush-stale-cron",
      "keenai-memory-consolidate",
      "keenai-memory-consolidate-cron",
      "keenai-memory-decay-sweep",
      "keenai-memory-decay-sweep-cron",
    ]);
  });

  it("uses custom cron schedules when provided", () => {
    const client = new Inngest({ id: "test" });
    const fns = createMemoryInngestFunctions(client, handlers, {
      consolidateCron: "15 * * * *",
      decayCron: "30 4 * * *",
    });

    expect(fns[7]?.id()).toBe("keenai-memory-consolidate-cron");
    expect(fns[9]?.id()).toBe("keenai-memory-decay-sweep-cron");
  });

  it("exports memory cron defaults and consolidation events", () => {
    expect(MEMORY_INNGEST_EVENTS.CONSOLIDATE).toBe("keenai/memory.consolidate");
    expect(MEMORY_INNGEST_EVENTS.DECAY_SWEEP).toBe("keenai/memory.decay_sweep");
    expect(MEMORY_CONSOLIDATE_CRON_DEFAULT).toBe("0 * * * *");
    expect(MEMORY_DECAY_CRON_DEFAULT).toBe("0 3 * * *");
    expect(MEMORY_DIGEST_CRON_DEFAULT).toBe("0 0 * * *");
    expect(MEMORY_FLUSH_STALE_CRON_DEFAULT).toBe("0 * * * *");
  });
});
