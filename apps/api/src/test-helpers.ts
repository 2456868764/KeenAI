/** Fail fast in tests when a seeded row is missing. */
export function requireRow<T>(row: T | undefined, label: string): T {
  if (!row) throw new Error(`missing ${label}`);
  return row;
}
