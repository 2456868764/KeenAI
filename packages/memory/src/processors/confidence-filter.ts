import type { KeeniMemoryMessageList, KeeniMemoryProcessor } from "./types.js";

export type ConfidenceFilterOptions = {
  minConfidence: number;
};

export class ConfidenceFilter implements KeeniMemoryProcessor {
  readonly id = "keeni.confidence-filter";

  constructor(private opts: ConfidenceFilterOptions) {}

  async process(messages: KeeniMemoryMessageList): Promise<KeeniMemoryMessageList> {
    return messages.filter((message) => {
      const confidence = message.metadata?.confidence;
      return confidence === undefined || confidence >= this.opts.minConfidence;
    });
  }
}
