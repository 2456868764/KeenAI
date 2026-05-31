import type { DraftStreamChunk } from "@keenai/llm";
import type { ChunkType } from "@mastra/core/stream";
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

export function mapMastraChunkToAgentEvent(chunk: ChunkType): KeeniAgentStreamEvent | null {
  switch (chunk.type) {
    case "text-delta":
      return chunk.payload?.text ? { type: "message_delta", delta: chunk.payload.text } : null;
    case "reasoning-delta":
      return chunk.payload?.text ? { type: "thinking", content: chunk.payload.text } : null;
    case "tool-call":
      return chunk.payload?.toolName
        ? {
            type: "tool_call_start",
            tool: chunk.payload.toolName,
            params: chunk.payload.args ?? {},
          }
        : null;
    case "tool-result":
      return chunk.payload?.toolName
        ? {
            type: "tool_call_result",
            tool: chunk.payload.toolName,
            result: chunk.payload.result,
          }
        : null;
    case "error": {
      const error = chunk.payload?.error;
      const message =
        error instanceof Error ? error.message : String(error ?? "Unknown agent error");
      const name = error instanceof Error ? error.name : "AgentError";
      return { type: "error", error: { name, message } };
    }
    default:
      return null;
  }
}
