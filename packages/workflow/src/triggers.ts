/** Default wait before customer_unresponsive fires (minutes). */
export const DEFAULT_CUSTOMER_UNRESPONSIVE_MINUTES = 30;

export function resolveInactivityMs(definition: {
  trigger: string;
  inactivityMinutes?: number;
}): number {
  const minutes =
    definition.inactivityMinutes ??
    (definition.trigger === "customer_unresponsive" ? DEFAULT_CUSTOMER_UNRESPONSIVE_MINUTES : 0);
  return minutes * 60_000;
}
