import type { MemorySummaryProvenance } from "@keenai/storage/schema";
import { agentMemoryProject } from "./config.js";
import type { RememberRequest } from "./types.js";

export type MapSummaryToRememberInput = {
  orgId: string;
  brandId: string;
  scopeKey: string;
  title: string | null;
  summary: string;
  provenance: MemorySummaryProvenance;
  kind: "seal" | "digest";
};

/** Map a sealed Memory Tree summary into agentmemory remember payload. */
export function mapSummaryToRemember(input: MapSummaryToRememberInput): RememberRequest {
  const sessionIds = input.provenance.messageIds.length > 0 ? input.provenance.messageIds : undefined;
  const concepts = [
    "memory-tree",
    input.kind,
    input.scopeKey,
    ...(input.provenance.keyEvents ?? []),
  ].slice(0, 12);

  return {
    project: agentMemoryProject(input.orgId, input.brandId),
    title: input.title ?? input.scopeKey,
    content: input.summary,
    type: input.kind === "digest" ? "fact" : "conversation",
    concepts,
    sessionIds,
  };
}
