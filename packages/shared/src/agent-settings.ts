import { z } from "zod";

export const AGENT_ABANDONED_WORKFLOW_TRIGGERS = [
  "user_visits_website",
  "visitor_visits_page",
  "user_opens_conversation",
  "visitor_opens_conversation",
  "first_message",
  "any_message",
  "customer_unresponsive",
  "teammate_unresponsive",
  "conversation_state_changed",
] as const;

export type AgentAbandonedWorkflowTrigger = (typeof AGENT_ABANDONED_WORKFLOW_TRIGGERS)[number];

export const updateAgentOtherSettingsSchema = z
  .object({
    simpleDeployEnabled: z.boolean().optional(),
    allowHandoff: z.boolean().optional(),
    autoCloseResolvedEnabled: z.boolean().optional(),
    autoCloseResolvedDelayMinutes: z.number().int().min(1).max(525_600).optional(),
    abandonedWorkflowTriggers: z
      .array(z.enum(AGENT_ABANDONED_WORKFLOW_TRIGGERS))
      .max(AGENT_ABANDONED_WORKFLOW_TRIGGERS.length)
      .optional(),
    abandonedWorkflowDelayMinutes: z.number().int().min(1).max(10_080).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "at_least_one_setting_required",
  });

export type UpdateAgentOtherSettingsInput = z.infer<typeof updateAgentOtherSettingsSchema>;
