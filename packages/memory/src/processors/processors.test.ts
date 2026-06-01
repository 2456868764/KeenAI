import { describe, expect, it } from "vitest";
import {
  ConfidenceFilter,
  DEFAULT_KEENI_MEMORY_PROCESSOR_OPTIONS,
  KEENI_MEMORY_PROCESSORS,
  PiiFilter,
  TrajectoryCompressor,
  buildKeeniMemoryProcessors,
  runKeeniMemoryProcessors,
} from "./index.js";

describe("Keeni memory processors", () => {
  it("enables the processor pipeline stub", () => {
    expect(KEENI_MEMORY_PROCESSORS.enabled).toBe(true);
    expect(KEENI_MEMORY_PROCESSORS.target).toBe("agent.inputProcessors");
  });

  it("redacts PII in message content", async () => {
    const filter = new PiiFilter();
    const output = await filter.process([
      { role: "user", content: "Email me at alice@example.com please" },
    ]);
    expect(output[0]?.content).toBe("Email me at <email> please");
  });

  it("compresses older messages while keeping recent ones", async () => {
    const compressor = new TrajectoryCompressor({ keepLast: 2, targetTokens: 100 });
    const output = await compressor.process([
      { role: "user", content: "one" },
      { role: "assistant", content: "two" },
      { role: "user", content: "three" },
    ]);
    expect(output).toHaveLength(3);
    expect(String(output[0]?.content)).toContain("Compressed History");
    expect(output[1]?.content).toBe("two");
    expect(output[2]?.content).toBe("three");
  });

  it("drops low-confidence messages", async () => {
    const filter = new ConfidenceFilter({ minConfidence: 0.5 });
    const output = await filter.process([
      { role: "user", content: "keep", metadata: { confidence: 0.9 } },
      { role: "user", content: "drop", metadata: { confidence: 0.2 } },
      { role: "user", content: "no-score" },
    ]);
    expect(output.map((m) => m.content)).toEqual(["keep", "no-score"]);
  });

  it("builds and runs the default processor chain", async () => {
    const processors = buildKeeniMemoryProcessors();
    expect(processors.map((p) => p.id)).toEqual([
      "keeni.pii-filter",
      "keeni.trajectory-compressor",
      "keeni.confidence-filter",
    ]);
    expect(DEFAULT_KEENI_MEMORY_PROCESSOR_OPTIONS.trajectory.keepLast).toBe(5);

    const output = await runKeeniMemoryProcessors(
      [
        { role: "user", content: "contact alice@example.com", metadata: { confidence: 0.9 } },
        { role: "assistant", content: "ok" },
        { role: "user", content: "recent" },
      ],
      processors,
    );
    expect(output.some((m) => String(m.content).includes("<email>"))).toBe(true);
    expect(output.some((m) => m.content === "recent")).toBe(true);
    expect(output.some((m) => m.content === "contact alice@example.com")).toBe(false);
  });
});
