import { describe, expect, it } from "vitest";
import { MESSAGES_BY_LOCALE, SUPPORTED_LOCALES, messagesForLocale } from "./locale-store";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flattenKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("dashboard locales", () => {
  it("registers at least 10 next-intl locales", () => {
    expect(SUPPORTED_LOCALES.length).toBeGreaterThanOrEqual(10);
    expect(SUPPORTED_LOCALES).toContain("en");
    expect(SUPPORTED_LOCALES).toContain("zh");
  });

  it("keeps message keys aligned across locales", () => {
    const baseKeys = flattenKeys(MESSAGES_BY_LOCALE.en).sort();

    for (const locale of SUPPORTED_LOCALES) {
      expect(flattenKeys(messagesForLocale(locale)).sort()).toEqual(baseKeys);
    }
  });
});
