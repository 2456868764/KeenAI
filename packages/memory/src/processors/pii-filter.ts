import { redactPii } from "@keenai/memory-tree";
import type { KeeniMemoryMessageList, KeeniMemoryProcessor } from "./types.js";

export class PiiFilter implements KeeniMemoryProcessor {
  readonly id = "keeni.pii-filter";

  async process(messages: KeeniMemoryMessageList): Promise<KeeniMemoryMessageList> {
    return messages.map((message) => {
      if (typeof message.content !== "string") return message;
      return { ...message, content: redactPii(message.content).text };
    });
  }
}
