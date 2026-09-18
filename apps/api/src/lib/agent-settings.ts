import type { AgentAbandonedWorkflowTrigger, UpdateAgentOtherSettingsInput } from "@keenai/shared";
import type { KeenaiDb } from "@keenai/storage";
import { agentOtherSettings } from "@keenai/storage/schema";
import { and, eq } from "drizzle-orm";

export type AgentOtherSettingsValue = {
  id: string;
  orgId: string;
  brandId: string;
  simpleDeployEnabled: boolean;
  allowHandoff: boolean;
  autoCloseResolvedEnabled: boolean;
  autoCloseResolvedDelayMinutes: number;
  abandonedWorkflowTriggers: AgentAbandonedWorkflowTrigger[];
  abandonedWorkflowDelayMinutes: number;
  createdAt: Date;
  updatedAt: Date;
};

export async function getOrCreateAgentOtherSettings(
  db: KeenaiDb,
  input: { orgId: string; brandId: string },
): Promise<AgentOtherSettingsValue> {
  await db
    .insert(agentOtherSettings)
    .values({ orgId: input.orgId, brandId: input.brandId })
    .onConflictDoNothing({ target: agentOtherSettings.brandId });

  const [row] = await db
    .select()
    .from(agentOtherSettings)
    .where(
      and(eq(agentOtherSettings.orgId, input.orgId), eq(agentOtherSettings.brandId, input.brandId)),
    )
    .limit(1);
  if (!row) throw new Error("agent_other_settings_create_failed");
  return row;
}

export async function updateAgentOtherSettings(
  db: KeenaiDb,
  input: { orgId: string; brandId: string; patch: UpdateAgentOtherSettingsInput },
): Promise<AgentOtherSettingsValue> {
  const existing = await getOrCreateAgentOtherSettings(db, input);
  const [row] = await db
    .update(agentOtherSettings)
    .set({ ...input.patch, updatedAt: new Date() })
    .where(eq(agentOtherSettings.id, existing.id))
    .returning();
  if (!row) throw new Error("agent_other_settings_update_failed");
  return row;
}
