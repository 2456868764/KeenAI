import { newEnforcer, newModelFromString } from "casbin";
import { CASBIN_MODEL, DEFAULT_POLICIES } from "./model.js";

let cached: Awaited<ReturnType<typeof createRbacEnforcer>> | null = null;

export async function createRbacEnforcer() {
  const model = newModelFromString(CASBIN_MODEL);
  const enforcer = await newEnforcer(model);
  for (const [sub, obj, act] of DEFAULT_POLICIES) {
    await enforcer.addPolicy(sub, obj, act);
  }
  return enforcer;
}

export async function getRbacEnforcer() {
  if (!cached) cached = await createRbacEnforcer();
  return cached;
}

export async function canAccess(role: string, resource: string, action: string): Promise<boolean> {
  const enforcer = await getRbacEnforcer();
  return enforcer.enforce(role, resource, action);
}
