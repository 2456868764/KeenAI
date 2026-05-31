import type { DraftStreamChunk } from "@keenai/llm";
import type { KeeniAgentStreamEvent } from "./types.js";

export function mapDraftChunkToAgentEvent(chunk: DraftStreamChunk): KeeniAgentStreamEvent | null {
  if (chunk.type === "text-delta") {
    return { type: "message_delta", delta: chunk.text };
  }
  if (chunk.type === "done") {
    return { type: "done" };
  }
  return null;
}
