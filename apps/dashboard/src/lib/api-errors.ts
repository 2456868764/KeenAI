export function parseApiError(body: string, fallback = "Something went wrong"): string {
  const trimmed = body.trim();
  if (!trimmed) return fallback;

  try {
    const data = JSON.parse(trimmed) as {
      message?: string;
      error?: string;
    };
    if (data.message) return data.message;
    if (data.error === "invalid_credentials") return "Invalid email or password";
    if (data.error === "not_found") return "Workspace or account not found";
    if (data.error) return data.error.replaceAll("_", " ");
  } catch {
    /* plain text */
  }

  return trimmed.length > 120 ? fallback : trimmed;
}
