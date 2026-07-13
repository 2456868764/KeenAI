/** Default wait before customer_unresponsive fires (minutes). */
export const DEFAULT_CUSTOMER_UNRESPONSIVE_MINUTES = 30;

export function resolveInactivityMs(definition: {
  trigger: string;
  inactivityMinutes?: number;
}): number {
  const usesUnresponsiveDefault =
    definition.trigger === "customer_unresponsive" ||
    definition.trigger === "teammate_unresponsive";
  const minutes =
    definition.inactivityMinutes ??
    (usesUnresponsiveDefault ? DEFAULT_CUSTOMER_UNRESPONSIVE_MINUTES : 0);
  return minutes * 60_000;
}
