import type { KeeniSkill, KeeniSkillRunResult, KeeniSkillStep } from "./types.js";

export type SkillRunContext = {
  conversationId: string;
  variables: Record<string, unknown>;
};

export type SkillToolExecutor = (
  tool: string,
  inputs: Record<string, unknown>,
  context: SkillRunContext,
) => Promise<unknown>;

export type RunSkillInput = {
  skill: KeeniSkill;
  context: SkillRunContext;
  executeTool?: SkillToolExecutor;
};

const defaultToolExecutor: SkillToolExecutor = async (tool, inputs) => ({
  tool,
  inputs,
  ok: true,
});

/** Execute skill steps in-process — Inngest step.run wiring lands in a later sprint. */
export async function runSkill(input: RunSkillInput): Promise<KeeniSkillRunResult> {
  const executeTool = input.executeTool ?? defaultToolExecutor;
  let stepsExecuted = 0;
  let lastOutput: unknown;

  try {
    let escalatedReason: string | undefined;
    const status = await runSteps(
      input.skill.steps,
      input.context,
      executeTool,
      (count, output) => {
        stepsExecuted += count;
        if (output !== undefined) lastOutput = output;
      },
      (reason) => {
        escalatedReason = reason;
      },
    );

    return {
      skillId: input.skill.id,
      skillName: input.skill.name,
      stepsExecuted,
      status,
      output: lastOutput,
      escalatedReason,
    };
  } catch (error) {
    return {
      skillId: input.skill.id,
      skillName: input.skill.name,
      stepsExecuted,
      status: "failed",
      output: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runSteps(
  steps: KeeniSkillStep[],
  context: SkillRunContext,
  executeTool: SkillToolExecutor,
  onProgress: (count: number, output?: unknown) => void,
  onEscalate: (reason: string) => void,
): Promise<KeeniSkillRunResult["status"]> {
  for (const step of steps) {
    if (step.kind === "tool") {
      const output = await executeTool(step.tool, step.inputs, context);
      context.variables[step.tool] = output;
      onProgress(1, output);
      continue;
    }

    if (step.kind === "escalate") {
      onEscalate(step.reason);
      onProgress(1, step.reason);
      return "escalated";
    }

    const branchSteps = evalBranchCondition(step.if, context.variables) ? step.then : step.else;
    const nestedStatus = await runSteps(branchSteps, context, executeTool, onProgress, onEscalate);
    if (nestedStatus !== "completed") return nestedStatus;
  }

  return "completed";
}

function evalBranchCondition(condition: string, variables: Record<string, unknown>): boolean {
  const parts = condition.split(".");
  let current: unknown = variables;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return false;
    current = (current as Record<string, unknown>)[part];
  }
  return Boolean(current);
}
