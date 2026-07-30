export function formatWebhookHeaders(headers: Record<string, string> | undefined): string {
  return Object.entries(headers ?? {})
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

export function parseWebhookHeaders(input: string): Record<string, string> | undefined {
  const headers = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, line) => {
      const separatorIndex = line.indexOf(":");
      if (separatorIndex <= 0) return acc;

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (!key || !value) return acc;

      acc[key] = value;
      return acc;
    }, {});

  return Object.keys(headers).length > 0 ? headers : undefined;
}

export function formatCommaList(values: string[] | undefined): string {
  return (values ?? []).join(", ");
}

export function parseCommaList(input: string): string[] | undefined {
  const values = input
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return values.length > 0 ? values : undefined;
}
