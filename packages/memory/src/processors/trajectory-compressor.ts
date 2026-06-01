import type { KeeniMemoryMessageList, KeeniMemoryProcessor } from "./types.js";

export type TrajectoryCompressorOptions = {
  keepLast: number;
  targetTokens: number;
};

/** Recent-K stub — LLM summarization lands in a later sprint. */
export class TrajectoryCompressor implements KeeniMemoryProcessor {
  readonly id = "keeni.trajectory-compressor";

  constructor(private opts: TrajectoryCompressorOptions) {}

  async process(messages: KeeniMemoryMessageList): Promise<KeeniMemoryMessageList> {
    if (messages.length <= this.opts.keepLast) return messages;

    const recent = messages.slice(-this.opts.keepLast);
    const omitted = messages.length - this.opts.keepLast;

    return [
      {
        role: "system",
        content: `[Compressed History · ${omitted} earlier message(s) omitted · stub]`,
      },
      ...recent,
    ];
  }
}
