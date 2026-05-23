import { describe, expect, it } from "vitest";
import { DEFAULT_PII_PATTERNS, redactPii } from "./privacy-filter.js";

describe("redactPii", () => {
  it("redacts email, phone, id card, api key, password, and credit card", () => {
    const input =
      "Email me at alice@example.com or call 13800138000. " +
      "Card 4111 1111 1111 1111. ID 11010119900307891X. sk-abcdefghijklmnopqrstuvwxyz123456. password: s3cr3t!";

    const result = redactPii(input);

    expect(result.text).not.toContain("alice@example.com");
    expect(result.text).not.toContain("13800138000");
    expect(result.text).not.toContain("4111 1111 1111 1111");
    expect(result.text).not.toContain("11010119900307891X");
    expect(result.text).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
    expect(result.text).not.toContain("s3cr3t!");
    expect(result.text).toContain("<email>");
    expect(result.text).toContain("<phone>");
    expect(result.text).toContain("<idcard>");
    expect(result.text).toContain("<secret>");
    expect(result.text).toContain("password=<redacted>");
    expect(result.text).toContain("****-****-****-1111");
    expect(result.redactedKinds).toEqual(
      expect.arrayContaining([
        "email",
        "phone_cn",
        "credit_card",
        "id_card_cn",
        "api_key",
        "password",
      ]),
    );
  });

  it("leaves non-sensitive text unchanged", () => {
    const input = "Need help with billing for order ORD-12345.";
    const result = redactPii(input);
    expect(result.text).toBe(input);
    expect(result.redactedKinds).toEqual([]);
  });

  it("supports custom pattern lists", () => {
    const result = redactPii("hello@example.com", {
      patterns: DEFAULT_PII_PATTERNS.filter((pattern) => pattern.name === "email"),
    });
    expect(result.text).toBe("<email>");
    expect(result.redactedKinds).toEqual(["email"]);
  });
});
