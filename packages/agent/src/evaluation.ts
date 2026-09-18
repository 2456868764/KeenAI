import type { KeeniResolution } from "./resolution.js";

export type AgentRunEvaluation = {
  planComplete: boolean;
  actionVerified: boolean;
  evidenceCoverage: number;
  citationCoverage: number;
  toolSuccessRate: number;
  score: number;
  outcome: "pass" | "review" | "fail";
  issues: string[];
};

export function evaluateAgentRun(input: {
  replyText: string;
  evidenceCount: number;
  requiredEvidenceCount: number;
  toolCalls: Array<{ status: string }>;
  resolution: KeeniResolution;
  hadError: boolean;
}): AgentRunEvaluation {
  const issues: string[] = [];
  const evidenceCoverage =
    input.requiredEvidenceCount === 0
      ? 1
      : Math.min(1, input.evidenceCount / input.requiredEvidenceCount);
  const actionVerified = input.toolCalls.every((call) => call.status === "succeeded");
  const succeededTools = input.toolCalls.filter((call) => call.status === "succeeded").length;
  const toolSuccessRate =
    input.toolCalls.length === 0 ? 1 : succeededTools / input.toolCalls.length;
  const citationCount =
    input.replyText.match(/https?:\/\/\S+|\[(?:source|来源|\d+)[^\]]*\]/gi)?.length ?? 0;
  const citationCoverage =
    input.requiredEvidenceCount === 0
      ? 1
      : Math.min(1, citationCount / input.requiredEvidenceCount);
  const planComplete =
    !input.hadError &&
    input.replyText.trim().length > 0 &&
    input.resolution.type !== "unresolved" &&
    input.resolution.type !== "escalated";

  if (input.hadError) issues.push("agent_run_failed");
  if (input.replyText.trim().length === 0) issues.push("empty_response");
  if (evidenceCoverage < 1) issues.push("insufficient_evidence");
  if (citationCoverage < 1) issues.push("insufficient_citations");
  if (!actionVerified) issues.push("action_not_verified");
  if (input.resolution.confidence < 0.65) issues.push("low_resolution_confidence");

  const score = Math.max(
    0,
    Math.min(
      1,
      evidenceCoverage * 0.25 +
        citationCoverage * 0.1 +
        toolSuccessRate * 0.2 +
        (planComplete ? 0.25 : 0) +
        input.resolution.confidence * 0.2,
    ),
  );
  const outcome = input.hadError || score < 0.45 ? "fail" : score < 0.75 ? "review" : "pass";

  return {
    planComplete,
    actionVerified,
    evidenceCoverage: Number(evidenceCoverage.toFixed(4)),
    citationCoverage: Number(citationCoverage.toFixed(4)),
    toolSuccessRate: Number(toolSuccessRate.toFixed(4)),
    score: Number(score.toFixed(4)),
    outcome,
    issues,
  };
}
